/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Authentication & Role-Based Access Control (RBAC) Middleware
 * Supports Firebase ID tokens, signed local/session tokens, and public access links.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getServerRepository } from '../db/index';
import { ShareLink, Acknowledgment } from '../../src/types';
import { GoogleAuthService } from '../services/auth/googleAuthService';

export type BackendRole = 'OWNER' | 'PLANNER' | 'EDITOR' | 'STAFF' | 'VIEWER';

export interface AuthUser {
  uid: string;
  name: string;
  email: string;
  role: BackendRole;
  appRole?: 'VIEWER' | 'EDITOR';
  isManager?: boolean;
  accessStatus?: 'APPROVED' | 'PENDING' | 'REVOKED';
  linkedNurseId?: string;
  isLocal: boolean;
}

// Global declaration merge for Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      shareLink?: ShareLink;
      acknowledgment?: Acknowledgment;
    }
  }
}

const JWT_SECRET = process.env.SESSION_SECRET || 'clinic-roster-hmac-secret-2026-al-shifa';

/**
 * Standard role inheritance hierarchy:
 * OWNER > PLANNER/EDITOR > STAFF > VIEWER
 */
const ROLE_HIERARCHY: Record<BackendRole, BackendRole[]> = {
  OWNER: ['OWNER', 'PLANNER', 'EDITOR', 'STAFF', 'VIEWER'],
  PLANNER: ['PLANNER', 'EDITOR', 'STAFF', 'VIEWER'],
  EDITOR: ['PLANNER', 'EDITOR', 'STAFF', 'VIEWER'],
  STAFF: ['STAFF', 'VIEWER'],
  VIEWER: ['VIEWER'],
};

/**
 * Create a signed local token using HMAC-SHA256
 */
export function signLocalToken(payload: Partial<AuthUser>, expiresInHours: number = 24): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const exp = Math.floor(Date.now() / 1000) + expiresInHours * 3600;
  const isRoland = payload.email?.trim().toLowerCase() === 'rolandabj@gmail.com';

  const body = {
    uid: payload.uid || `usr-local-${Date.now()}`,
    name: payload.name || (isRoland ? 'Dr. Roland / Clinical Director' : 'Clinic User'),
    email: payload.email || (isRoland ? 'rolandabj@gmail.com' : 'user@clinic.local'),
    role: isRoland ? 'OWNER' : (payload.role && payload.role !== 'OWNER' ? payload.role : 'STAFF'),
    appRole: isRoland ? 'EDITOR' : (payload.appRole || 'VIEWER'),
    isManager: isRoland ? true : (payload.isManager ?? false),
    accessStatus: isRoland ? 'APPROVED' : (payload.accessStatus || 'APPROVED'),
    linkedNurseId: payload.linkedNurseId,
    isLocal: payload.isLocal ?? true,
    exp,
  };

  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const bodyB64 = Buffer.from(JSON.stringify(body)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${headerB64}.${bodyB64}`)
    .digest('base64url');

  return `${headerB64}.${bodyB64}.${signature}`;
}

/**
 * Verify a local signed token or Firebase ID token
 */
export async function verifyToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;

  // 1. Quick dev token aliases for rapid CLI and test usage
  const lower = token.trim().toLowerCase();
  if (lower === 'local-owner' || lower === 'owner' || lower === 'roland' || lower === 'admin') {
    return {
      uid: 'usr-admin-roland',
      name: 'Dr. Roland / Clinical Director',
      email: 'rolandabj@gmail.com',
      role: 'OWNER',
      appRole: 'EDITOR',
      isManager: true,
      accessStatus: 'APPROVED',
      isLocal: true,
    };
  }
  if (lower === 'local-planner' || lower === 'local-editor' || lower === 'maryam') {
    return {
      uid: 'usr-nurse-1',
      name: 'Maryam Al-Nuaimi (Charge Nurse)',
      email: 'maryam.nuaimi.rn@gmail.com',
      role: 'EDITOR',
      appRole: 'EDITOR',
      isManager: true,
      accessStatus: 'APPROVED',
      linkedNurseId: 'nurse-1',
      isLocal: true,
    };
  }
  if (lower === 'local-staff' || lower === 'aisha') {
    return {
      uid: 'usr-nurse-3',
      name: 'Aisha Al-Hashimi (Staff)',
      email: 'aisha.alhashimi.rn@gmail.com',
      role: 'VIEWER',
      appRole: 'VIEWER',
      isManager: false,
      accessStatus: 'APPROVED',
      linkedNurseId: 'nurse-3',
      isLocal: true,
    };
  }
  if (lower === 'local-viewer' || lower === 'viewer') {
    return {
      uid: 'usr-viewer-1',
      name: 'Guest Viewer',
      email: 'viewer@alshifa.ae',
      role: 'VIEWER',
      appRole: 'VIEWER',
      isManager: false,
      accessStatus: 'APPROVED',
      isLocal: true,
    };
  }

  // 2. Parse 3-part JWT
  const parts = token.split('.');
  if (parts.length === 3) {
    const [headerB64, bodyB64, signature] = parts;

    // Check if it's our HMAC signed local token
    const expectedSig = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${bodyB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf)) {
      try {
        const decoded = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf-8'));
        if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
          return null; // Expired
        }
        const isRoland = decoded.email?.trim().toLowerCase() === 'rolandabj@gmail.com';
        const rawRole = (decoded.role?.toUpperCase() as BackendRole) || 'STAFF';
        const safeRole: BackendRole = isRoland ? 'OWNER' : (rawRole === 'OWNER' ? 'STAFF' : rawRole);
        return {
          uid: decoded.uid || 'usr-local',
          name: decoded.name || (isRoland ? 'Dr. Roland / Clinical Director' : 'Clinic User'),
          email: decoded.email || '',
          role: safeRole,
          appRole: isRoland ? 'EDITOR' : (decoded.appRole || 'VIEWER'),
          isManager: isRoland ? true : (decoded.isManager ?? false),
          accessStatus: isRoland ? 'APPROVED' : (decoded.accessStatus || 'APPROVED'),
          linkedNurseId: decoded.linkedNurseId,
          isLocal: decoded.isLocal ?? true,
        };
      } catch {
        return null;
      }
    }

    // 3. Fallback: Firebase ID token format inspection
    try {
      const decodedBody = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf-8'));
      // If issued by Google/Firebase
      if (decodedBody.iss && decodedBody.iss.includes('securetoken.google.com')) {
        const email = decodedBody.email || '';
        const isRoland = email.trim().toLowerCase() === 'rolandabj@gmail.com';
        const role = isRoland ? 'OWNER' : (decodedBody.role || decodedBody.custom_claims?.role || 'VIEWER').toUpperCase();
        return {
          uid: decodedBody.sub || decodedBody.user_id,
          name: decodedBody.name || email.split('@')[0] || 'Firebase User',
          email,
          role: role as BackendRole,
          appRole: isRoland ? 'EDITOR' : 'VIEWER',
          isManager: isRoland,
          accessStatus: isRoland ? 'APPROVED' : 'PENDING',
          isLocal: false,
        };
      }
    } catch {
      // not a valid json payload
    }
  }

  // 3. Google OAuth2 Access Token or Google ID Token verification via GoogleAuthService
  try {
    const googleResult = await GoogleAuthService.verifyGoogleToken(token);
    if (googleResult.valid && googleResult.user) {
      return googleResult.user;
    }
  } catch (err) {
    console.warn('[AuthMiddleware] GoogleAuthService verification error:', err);
  }

  return null;
}

/**
 * Base Authentication Middleware
 * Parses Authorization: Bearer <token> and sets req.user if valid.
 * Does not reject requests if missing, enabling public or optional-auth endpoints.
 */
export async function authMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    return next();
  }

  try {
    const user = await verifyToken(token);
    if (user) {
      req.user = user;
    }
  } catch (err) {
    console.warn('[AuthMiddleware] Token verification warning:', err);
  }

  next();
}

/**
 * Require active authentication guard
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Active authentication credentials required. Provide a valid Bearer token.',
    });
    return;
  }
  next();
}

/**
 * Require one or more specific roles
 */
export function requireRole(allowedRoles: BackendRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Active authentication credentials required.',
      });
      return;
    }

    const userRole = req.user.role;
    const effectiveRoles = ROLE_HIERARCHY[userRole] || [userRole];

    const hasPermission = allowedRoles.some((r) => effectiveRoles.includes(r));
    if (!hasPermission) {
      res.status(403).json({
        error: 'Forbidden',
        message: `User role '${userRole}' is not permitted to perform this action. Required: ${allowedRoles.join(', ')}.`,
      });
      return;
    }

    next();
  };
}

/**
 * Convenience Role Guards
 */
export const requireOwner = requireRole(['OWNER']);
export const requirePlanner = requireRole(['OWNER', 'PLANNER', 'EDITOR']);
export const requireStaff = requireRole(['OWNER', 'PLANNER', 'EDITOR', 'STAFF']);

/**
 * Validate Public Share Link Token
 * Inspects req.params.token, req.query.token, or x-share-token header.
 * Verifies existence in `shareLinks`, expiration, and revoked status.
 */
export async function validatePublicToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (
    req.params.token ||
    (req.query.token as string) ||
    (req.headers['x-share-token'] as string)
  )?.trim();

  if (!token) {
    res.status(400).json({
      error: 'MissingToken',
      message: 'A share token is required to access this resource.',
    });
    return;
  }

  try {
    const repo = getServerRepository();
    const links = await repo.list('shareLinks');
    const matched = links.find((l) => l.token === token || l.id === token);

    if (!matched) {
      res.status(404).json({
        error: 'NotFound',
        message: 'The requested share link does not exist.',
      });
      return;
    }

    if (matched.revoked) {
      res.status(403).json({
        error: 'Revoked',
        message: 'This share link has been revoked by an administrator.',
      });
      return;
    }

    // Attach to request
    req.shareLink = matched;
    next();
  } catch (err: any) {
    console.error('[AuthMiddleware] validatePublicToken error:', err);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to validate share token.',
    });
  }
}

/**
 * Validate Staff Acknowledgment Token
 * Inspects req.params.ackToken or req.body.token.
 */
export async function validateAckToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (
    req.params.ackToken ||
    req.body.token ||
    (req.query.token as string)
  )?.trim();

  if (!token) {
    res.status(400).json({
      error: 'MissingAckToken',
      message: 'An acknowledgment token is required.',
    });
    return;
  }

  try {
    const repo = getServerRepository();
    const acks = await repo.list('acknowledgments');
    const matched = acks.find((a) => a.token === token || a.id === token);

    if (!matched) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Acknowledgment record not found for this token.',
      });
      return;
    }

    req.acknowledgment = matched;
    next();
  } catch (err: any) {
    console.error('[AuthMiddleware] validateAckToken error:', err);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to validate acknowledgment token.',
    });
  }
}
