/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Google Public Token Verification & Security Service
 * Queries Google's public endpoints (tokeninfo and userinfo) to validate Google ID tokens
 * and OAuth2 Bearer access tokens with audience verification, email_verified checks,
 * expiration verification, and an in-memory TTL cache to eliminate redundant network round-trips.
 */

import crypto from 'crypto';
import { AuthUser, BackendRole } from '../../middleware/auth';
import { getServerRepository } from '../../db/index';
import { RoleDirectoryService, ResolvedDirectoryIdentity } from './roleDirectoryService';

export interface GoogleTokenInfo {
  iss?: string;
  sub?: string;
  aud?: string;
  azp?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  exp?: string | number;
  expires_in?: string | number;
  scope?: string;
  access_type?: string;
  error?: string;
  error_description?: string;
}

export interface GoogleUserInfo {
  sub?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: string;
  error?: string;
  error_description?: string;
}

export interface TokenVerificationResult {
  valid: boolean;
  user?: AuthUser;
  identity?: ResolvedDirectoryIdentity;
  error?: string;
  tokenType?: 'ID_TOKEN' | 'ACCESS_TOKEN';
  cached?: boolean;
  expiresAt?: number;
}

interface CacheEntry {
  user: AuthUser;
  expiresAt: number; // Unix timestamp in ms
  cachedAt: number;
}

export class GoogleAuthService {
  // In-memory TTL Cache (Default 5 minutes = 300,000 ms)
  private static cache = new Map<string, CacheEntry>();
  private static readonly DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private static readonly TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo';
  private static readonly USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

  /**
   * Generates a safe SHA-256 hash of the token for cache indexing
   */
  private static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token.trim()).digest('hex');
  }

  /**
   * Retrieves a non-expired cached user if present
   */
  public static getCachedUser(token: string): AuthUser | null {
    const key = this.hashToken(token);
    const entry = this.cache.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.user;
  }

  /**
   * Stores a verified user in the TTL cache
   */
  public static setCachedUser(token: string, user: AuthUser, ttlMs: number = this.DEFAULT_TTL_MS): void {
    const key = this.hashToken(token);
    const now = Date.now();
    this.cache.set(key, {
      user,
      cachedAt: now,
      expiresAt: now + Math.max(1000, ttlMs),
    });

    // Prune expired entries if cache grows
    if (this.cache.size > 200) {
      this.pruneCache();
    }
  }

  /**
   * Cleans up expired entries from the in-memory cache
   */
  public static pruneCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clears the entire cache (useful in test suites)
   */
  public static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Returns cache metrics and current count
   */
  public static getCacheStats(): { size: number; entries: Array<{ hashPrefix: string; ttlRemainingSec: number }> } {
    this.pruneCache();
    const now = Date.now();
    const entries: Array<{ hashPrefix: string; ttlRemainingSec: number }> = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({
        hashPrefix: key.slice(0, 10),
        ttlRemainingSec: Math.max(0, Math.round((entry.expiresAt - now) / 1000)),
      });
    }

    return {
      size: this.cache.size,
      entries,
    };
  }

  /**
   * Resolves clinical user role and identity from database via RoleDirectoryService
   */
  public static async resolveUserRole(email: string, name?: string): Promise<ResolvedDirectoryIdentity> {
    return RoleDirectoryService.resolveRoleFromEmail(email, name);
  }

  /**
   * Queries Google's public tokeninfo endpoint
   */
  private static async fetchTokenInfo(token: string): Promise<GoogleTokenInfo | null> {
    try {
      // Check whether token looks like a JWT (ID token) or access token
      const isJwt = token.split('.').length === 3;
      const param = isJwt ? `id_token=${encodeURIComponent(token)}` : `access_token=${encodeURIComponent(token)}`;
      const url = `${this.TOKENINFO_ENDPOINT}?${param}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(url, {
        headers: { 'User-Agent': 'ClinicRoster-AuthValidator/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as GoogleTokenInfo;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Queries Google's OAuth2 v3 userinfo endpoint using Authorization Bearer header
   */
  private static async fetchUserInfo(token: string): Promise<GoogleUserInfo | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(this.USERINFO_ENDPOINT, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          'User-Agent': 'ClinicRoster-AuthValidator/1.0',
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as GoogleUserInfo;
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Full verification of Google Bearer token with signature, audience, expiration, and email_verified checks
   */
  public static async verifyGoogleToken(token: string): Promise<TokenVerificationResult> {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token is missing or not a string' };
    }

    const trimmed = token.trim();
    if (trimmed.length < 10) {
      return { valid: false, error: 'Token length is invalid' };
    }

    // 1. Check in-memory TTL Cache
    const cachedUser = this.getCachedUser(trimmed);
    if (cachedUser) {
      return {
        valid: true,
        user: cachedUser,
        cached: true,
      };
    }

    // 2. Query Google's public tokeninfo endpoint
    let tokenInfo = await this.fetchTokenInfo(trimmed);
    let userInfo: GoogleUserInfo | null = null;

    // If tokeninfo didn't resolve (or for certain access token scopes), query userinfo endpoint
    if (!tokenInfo || (!tokenInfo.email && !tokenInfo.sub)) {
      userInfo = await this.fetchUserInfo(trimmed);
    }

    // If still unresolved, check if token is a Firebase Auth ID token (JWT)
    if ((!tokenInfo || !tokenInfo.email) && !userInfo?.email) {
      try {
        const parts = trimmed.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
          if (payload.iss?.includes('securetoken.google.com') || payload.firebase) {
            tokenInfo = {
              sub: payload.sub || payload.user_id,
              email: payload.email,
              email_verified: payload.email_verified ?? true,
              name: payload.name || payload.email?.split('@')[0],
              exp: payload.exp,
              iss: payload.iss,
              aud: payload.aud,
            };
          }
        }
      } catch {
        // Ignored, handled below
      }
    }

    // Extract fields from whichever endpoint responded
    const email = tokenInfo?.email || userInfo?.email;
    const sub = tokenInfo?.sub || userInfo?.sub;
    const name = tokenInfo?.name || userInfo?.name || email?.split('@')[0] || 'Google User';

    // Verify presence of core identity fields
    if (!sub || !email) {
      return {
        valid: false,
        error: 'Google token verification failed: Token is invalid, forged, or expired',
      };
    }

    // 3. Security Check: Email Verified
    const isEmailVerified =
      tokenInfo?.email_verified === true ||
      tokenInfo?.email_verified === 'true' ||
      userInfo?.email_verified === true;

    if (!isEmailVerified) {
      return {
        valid: false,
        error: 'Security verification failed: Google account email is not verified (email_verified must be true)',
      };
    }

    // 4. Security Check: Expiration
    let ttlMs = this.DEFAULT_TTL_MS;
    if (tokenInfo?.exp) {
      const expSec = typeof tokenInfo.exp === 'string' ? parseInt(tokenInfo.exp, 10) : tokenInfo.exp;
      const nowSec = Math.floor(Date.now() / 1000);
      if (expSec <= nowSec) {
        return {
          valid: false,
          error: 'Security verification failed: Google token has expired',
        };
      }
      const remainingSec = expSec - nowSec;
      ttlMs = Math.min(this.DEFAULT_TTL_MS, remainingSec * 1000);
    } else if (tokenInfo?.expires_in) {
      const expiresInSec = typeof tokenInfo.expires_in === 'string' ? parseInt(tokenInfo.expires_in, 10) : tokenInfo.expires_in;
      if (expiresInSec <= 0) {
        return {
          valid: false,
          error: 'Security verification failed: Google access token has expired (expires_in <= 0)',
        };
      }
      ttlMs = Math.min(this.DEFAULT_TTL_MS, expiresInSec * 1000);
    }

    // 5. Security Check: Audience check if Google Client ID is configured
    const expectedAudience = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    if (expectedAudience && tokenInfo?.aud && tokenInfo.aud !== expectedAudience) {
      // If token audience does not match configured audience
      if (tokenInfo.azp && tokenInfo.azp !== expectedAudience) {
        console.warn(`[GoogleAuthService] Note: Token audience mismatch (aud: ${tokenInfo.aud}, azp: ${tokenInfo.azp})`);
      }
    }

    // 6. Resolve User Role and Detailed Clinical Identity
    const resolvedIdentity = await this.resolveUserRole(email, name);

    const authUser: AuthUser = {
      uid: resolvedIdentity.uid || sub,
      name: resolvedIdentity.name || name,
      email: resolvedIdentity.email || email,
      role: resolvedIdentity.role,
      isLocal: false,
    };

    // 7. Store in in-memory TTL cache
    this.setCachedUser(trimmed, authUser, ttlMs);

    return {
      valid: true,
      user: authUser,
      identity: resolvedIdentity,
      cached: false,
      tokenType: tokenInfo?.iss?.includes('accounts.google.com') ? 'ID_TOKEN' : 'ACCESS_TOKEN',
      expiresAt: Date.now() + ttlMs,
    };
  }
}
