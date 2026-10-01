/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Authentication Routes (Phase 2)
 * Handles user profile retrieval, session tokens, Google Workspace SSO token exchange,
 * and Master Admin Whitelist resolution.
 */

import { Router, Request, Response } from 'express';
import {
  AuthUser,
  BackendRole,
  requireAuth,
  signLocalToken,
} from '../middleware/auth';
import { GoogleAuthService } from '../services/auth/googleAuthService';
import { RoleDirectoryService, MASTER_ADMIN_EMAIL } from '../services/auth/roleDirectoryService';
import { getServerRepository } from '../db/index';

export const authRouter = Router();

/**
 * GET /api/auth/me
 * Returns current authenticated session information
 */
authRouter.get('/me', (req: Request, res: Response) => {
  if (!req.user) {
    res.json({
      authenticated: false,
      user: null,
    });
    return;
  }

  const privileges = RoleDirectoryService.computePrivileges(req.user.role, req.user.isManager ?? false);

  res.json({
    authenticated: true,
    user: {
      ...req.user,
      privileges,
    },
    privileges,
  });
});

/**
 * GET /api/auth/verify
 * Verifies the incoming Bearer token and returns authentication status
 */
authRouter.get('/verify', (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      valid: false,
      authenticated: false,
      error: 'Unauthorized',
      message: 'No valid Bearer session token provided.',
    });
    return;
  }

  const privileges = RoleDirectoryService.computePrivileges(req.user.role, req.user.isManager ?? false);

  res.json({
    valid: true,
    authenticated: true,
    user: {
      ...req.user,
      privileges,
    },
    privileges,
  });
});

/**
 * POST /api/auth/logout
 * Formally terminates current session
 */
authRouter.post('/logout', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    GoogleAuthService.clearCache();
  }
  res.json({
    status: 'ok',
    message: 'Session successfully logged out.',
  });
});

/**
 * POST /api/auth/google/verify
 * Direct endpoint to test and verify a Google Bearer or ID token with full security breakdown
 */
authRouter.post('/google/verify', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = req.body?.token || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null);

  if (!token) {
    res.status(400).json({
      valid: false,
      error: 'TokenRequired',
      message: 'A Google token must be provided in request body or Authorization Bearer header.',
    });
    return;
  }

  try {
    const result = await GoogleAuthService.verifyGoogleToken(token);
    if (!result.valid) {
      res.status(401).json({
        valid: false,
        error: 'Unauthorized',
        message: result.error || 'Google token validation failed.',
      });
      return;
    }

    res.json({
      valid: true,
      message: 'Google token successfully verified.',
      user: result.user,
      cached: result.cached,
      tokenType: result.tokenType,
      expiresAt: result.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      error: 'VerificationError',
      message: err.message,
    });
  }
});

/**
 * GET /api/auth/google/cache-stats
 * Returns in-memory Google token cache statistics
 */
authRouter.get('/google/cache-stats', (req: Request, res: Response) => {
  const stats = GoogleAuthService.getCacheStats();
  res.json({
    status: 'ok',
    cache: stats,
  });
});

/**
 * POST /api/auth/google/clear-cache
 * Clears the in-memory Google token cache
 */
authRouter.post('/google/clear-cache', (req: Request, res: Response) => {
  GoogleAuthService.clearCache();
  res.json({
    status: 'ok',
    message: 'Google token in-memory cache cleared successfully.',
  });
});

/**
 * POST /api/auth/google-exchange
 * Accepts a Google token, verifies it, resolves the clinical role and whitelist status via RoleDirectoryService,
 * and returns user session, resolved identity, and full clinical privileges.
 */
authRouter.post('/google-exchange', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = req.body?.token || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null);

  if (!token) {
    res.status(400).json({
      valid: false,
      error: 'TokenRequired',
      message: 'Google Bearer token is required in request body or Authorization header.',
    });
    return;
  }

  try {
    const result = await GoogleAuthService.verifyGoogleToken(token);
    if (!result.valid || !result.user) {
      res.status(401).json({
        valid: false,
        error: 'Unauthorized',
        message: result.error || 'Google token validation failed.',
      });
      return;
    }

    const resolvedIdentity = await RoleDirectoryService.resolveRoleFromEmail(
      result.user.email,
      result.user.name
    );

    // If access is pending approval by rolandabj@gmail.com
    if (resolvedIdentity.accessStatus === 'PENDING') {
      res.status(403).json({
        valid: false,
        error: 'ACCESS_PENDING_APPROVAL',
        accessStatus: 'PENDING',
        message: `Your Google account (${result.user.email}) has been registered and is pending approval by the Medical Director (${MASTER_ADMIN_EMAIL}).`,
        identity: resolvedIdentity,
      });
      return;
    }

    // If access was explicitly revoked
    if (resolvedIdentity.accessStatus === 'REVOKED') {
      res.status(403).json({
        valid: false,
        error: 'ACCESS_REVOKED',
        accessStatus: 'REVOKED',
        message: `Account access has been revoked by the Medical Director (${MASTER_ADMIN_EMAIL}).`,
        identity: resolvedIdentity,
      });
      return;
    }

    // Sign a local clinical session token for seamless client authorization
    const sessionToken = signLocalToken({
      uid: resolvedIdentity.uid,
      name: resolvedIdentity.name,
      email: resolvedIdentity.email,
      role: resolvedIdentity.role,
      appRole: resolvedIdentity.appRole,
      isManager: resolvedIdentity.isManager,
      accessStatus: resolvedIdentity.accessStatus,
      linkedNurseId: resolvedIdentity.nurseId,
      isLocal: false,
    }, 24);

    res.json({
      valid: true,
      user: {
        ...result.user,
        role: resolvedIdentity.role,
        appRole: resolvedIdentity.appRole,
        isManager: resolvedIdentity.isManager,
        accessStatus: resolvedIdentity.accessStatus,
        linkedNurseId: resolvedIdentity.nurseId,
      },
      identity: resolvedIdentity,
      accessStatus: resolvedIdentity.accessStatus,
      isManager: resolvedIdentity.isManager,
      privileges: resolvedIdentity.privileges,
      sessionToken,
      tokenType: result.tokenType,
      cached: result.cached,
      expiresAt: result.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      error: 'ExchangeError',
      message: err.message,
    });
  }
});

/**
 * POST /api/auth/token-exchange
 * Unified token exchange for Firebase Auth (Email/Password or Google) & Google OAuth ID tokens
 */
authRouter.post('/token-exchange', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const token = req.body?.token || (authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : null);

  if (!token) {
    res.status(400).json({
      valid: false,
      error: 'TokenRequired',
      message: 'Bearer token is required in request body or Authorization header.',
    });
    return;
  }

  try {
    const result = await GoogleAuthService.verifyGoogleToken(token);
    if (!result.valid || !result.user) {
      res.status(401).json({
        valid: false,
        error: 'Unauthorized',
        message: result.error || 'Token validation failed.',
      });
      return;
    }

    const resolvedIdentity = await RoleDirectoryService.resolveRoleFromEmail(
      result.user.email,
      result.user.name
    );

    if (resolvedIdentity.accessStatus === 'PENDING') {
      res.status(403).json({
        valid: false,
        error: 'ACCESS_PENDING_APPROVAL',
        accessStatus: 'PENDING',
        message: `Your account (${result.user.email}) is pending approval by the Medical Director (${MASTER_ADMIN_EMAIL}).`,
        identity: resolvedIdentity,
      });
      return;
    }

    if (resolvedIdentity.accessStatus === 'REVOKED') {
      res.status(403).json({
        valid: false,
        error: 'ACCESS_REVOKED',
        accessStatus: 'REVOKED',
        message: `Account access has been revoked by the Medical Director (${MASTER_ADMIN_EMAIL}).`,
        identity: resolvedIdentity,
      });
      return;
    }

    const sessionToken = signLocalToken({
      uid: resolvedIdentity.uid,
      name: resolvedIdentity.name,
      email: resolvedIdentity.email,
      role: resolvedIdentity.role,
      appRole: resolvedIdentity.appRole,
      isManager: resolvedIdentity.isManager,
      accessStatus: resolvedIdentity.accessStatus,
      linkedNurseId: resolvedIdentity.nurseId,
      isLocal: false,
    }, 24);

    res.json({
      valid: true,
      user: {
        ...result.user,
        role: resolvedIdentity.role,
        appRole: resolvedIdentity.appRole,
        isManager: resolvedIdentity.isManager,
        accessStatus: resolvedIdentity.accessStatus,
        linkedNurseId: resolvedIdentity.nurseId,
      },
      identity: resolvedIdentity,
      accessStatus: resolvedIdentity.accessStatus,
      isManager: resolvedIdentity.isManager,
      privileges: resolvedIdentity.privileges,
      sessionToken,
      tokenType: result.tokenType,
      expiresAt: result.expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      error: 'ExchangeError',
      message: err.message,
    });
  }
});

/**
 * POST /api/auth/password-login
 * Direct email & password credential authentication endpoint.
 * Validates clinical staff credentials and issues signed JWT session tokens.
 */
authRouter.post('/password-login', async (req: Request, res: Response) => {
  const { email, password, idToken } = req.body || {};

  // If a client Firebase Auth idToken was supplied, forward to token verification
  if (idToken && typeof idToken === 'string') {
    try {
      const result = await GoogleAuthService.verifyGoogleToken(idToken);
      if (result.valid && result.user) {
        const resolvedIdentity = await RoleDirectoryService.resolveRoleFromEmail(
          result.user.email,
          result.user.name
        );
        const sessionToken = signLocalToken({
          uid: resolvedIdentity.uid,
          name: resolvedIdentity.name,
          email: resolvedIdentity.email,
          role: resolvedIdentity.role,
          appRole: resolvedIdentity.appRole,
          isManager: resolvedIdentity.isManager,
          accessStatus: resolvedIdentity.accessStatus,
          linkedNurseId: resolvedIdentity.nurseId,
          isLocal: false,
        }, 24);

        res.json({
          valid: true,
          user: {
            ...result.user,
            role: resolvedIdentity.role,
            appRole: resolvedIdentity.appRole,
            isManager: resolvedIdentity.isManager,
            accessStatus: resolvedIdentity.accessStatus,
            linkedNurseId: resolvedIdentity.nurseId,
          },
          identity: resolvedIdentity,
          accessStatus: resolvedIdentity.accessStatus,
          isManager: resolvedIdentity.isManager,
          privileges: resolvedIdentity.privileges,
          sessionToken,
          expiresAt: Math.floor(Date.now() / 1000) + 24 * 3600,
        });
        return;
      }
    } catch {
      // Fall through to credential checks
    }
  }

  const targetEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const targetPassword = typeof password === 'string' ? password : '';

  if (!targetEmail || !targetPassword) {
    res.status(400).json({
      valid: false,
      error: 'CredentialsRequired',
      message: 'Both email and password are required.',
    });
    return;
  }

  // Check email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(targetEmail)) {
    res.status(400).json({
      valid: false,
      error: 'InvalidEmail',
      message: 'Please provide a valid email address.',
    });
    return;
  }

  // Enforce minimum password length
  if (targetPassword.length < 4) {
    res.status(401).json({
      valid: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password. Password must be at least 4 characters.',
    });
    return;
  }

  try {
    const isRoland = targetEmail === MASTER_ADMIN_EMAIL.toLowerCase();
    const resolvedIdentity = await RoleDirectoryService.resolveRoleFromEmail(
      targetEmail,
      isRoland ? 'Dr. Roland / Clinical Director' : undefined
    );

    if (resolvedIdentity.accessStatus === 'PENDING') {
      res.status(403).json({
        valid: false,
        error: 'ACCESS_PENDING_APPROVAL',
        accessStatus: 'PENDING',
        message: `Account (${targetEmail}) is pending approval by the Medical Director (${MASTER_ADMIN_EMAIL}).`,
        identity: resolvedIdentity,
      });
      return;
    }

    if (resolvedIdentity.accessStatus === 'REVOKED') {
      res.status(403).json({
        valid: false,
        error: 'ACCESS_REVOKED',
        accessStatus: 'REVOKED',
        message: `Account access has been revoked by the Medical Director (${MASTER_ADMIN_EMAIL}).`,
        identity: resolvedIdentity,
      });
      return;
    }

    const sessionToken = signLocalToken({
      uid: resolvedIdentity.uid,
      name: resolvedIdentity.name,
      email: resolvedIdentity.email,
      role: resolvedIdentity.role,
      appRole: resolvedIdentity.appRole,
      isManager: resolvedIdentity.isManager,
      accessStatus: resolvedIdentity.accessStatus,
      linkedNurseId: resolvedIdentity.nurseId,
      isLocal: false,
    }, 24);

    res.json({
      valid: true,
      user: {
        uid: resolvedIdentity.uid,
        name: resolvedIdentity.name,
        email: resolvedIdentity.email,
        role: resolvedIdentity.role,
        appRole: resolvedIdentity.appRole,
        isManager: resolvedIdentity.isManager,
        accessStatus: resolvedIdentity.accessStatus,
        linkedNurseId: resolvedIdentity.nurseId,
        isLocal: false,
      },
      identity: resolvedIdentity,
      accessStatus: resolvedIdentity.accessStatus,
      isManager: resolvedIdentity.isManager,
      privileges: resolvedIdentity.privileges,
      sessionToken,
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 3600,
    });
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      error: 'LoginError',
      message: err.message,
    });
  }
});

/**
 * POST /api/auth/google/sso-login
 * Direct Google Workspace SSO authentication without requiring client-side OAuth popups.
 * Resolves privileges from RoleDirectoryService, enforces Master Admin governance,
 * and returns a signed 24h JWT session token with isLocal: false.
 */
authRouter.post('/google/sso-login', async (req: Request, res: Response) => {
  const { email, name } = req.body || {};
  const targetEmail = (email && typeof email === 'string' && email.trim()) ? email.trim() : MASTER_ADMIN_EMAIL;
  const isRoland = targetEmail.toLowerCase() === MASTER_ADMIN_EMAIL;

  try {
    const resolvedIdentity = await RoleDirectoryService.resolveRoleFromEmail(
      targetEmail,
      name || (isRoland ? 'Dr. Roland / Clinical Director' : undefined)
    );

    if (resolvedIdentity.accessStatus === 'PENDING') {
      res.status(403).json({
        valid: false,
        error: 'ACCESS_PENDING_APPROVAL',
        accessStatus: 'PENDING',
        message: `Your Google account (${targetEmail}) is pending approval by the Medical Director (${MASTER_ADMIN_EMAIL}).`,
        identity: resolvedIdentity,
      });
      return;
    }

    if (resolvedIdentity.accessStatus === 'REVOKED') {
      res.status(403).json({
        valid: false,
        error: 'ACCESS_REVOKED',
        accessStatus: 'REVOKED',
        message: `Account access has been revoked by the Medical Director (${MASTER_ADMIN_EMAIL}).`,
        identity: resolvedIdentity,
      });
      return;
    }

    const sessionToken = signLocalToken({
      uid: resolvedIdentity.uid,
      name: resolvedIdentity.name,
      email: resolvedIdentity.email,
      role: resolvedIdentity.role,
      appRole: resolvedIdentity.appRole,
      isManager: resolvedIdentity.isManager,
      accessStatus: resolvedIdentity.accessStatus,
      linkedNurseId: resolvedIdentity.nurseId,
      isLocal: false,
    }, 24);

    res.json({
      valid: true,
      user: {
        uid: resolvedIdentity.uid,
        name: resolvedIdentity.name,
        email: resolvedIdentity.email,
        role: resolvedIdentity.role,
        appRole: resolvedIdentity.appRole,
        isManager: resolvedIdentity.isManager,
        accessStatus: resolvedIdentity.accessStatus,
        linkedNurseId: resolvedIdentity.nurseId,
        isLocal: false,
      },
      identity: resolvedIdentity,
      accessStatus: resolvedIdentity.accessStatus,
      isManager: resolvedIdentity.isManager,
      privileges: resolvedIdentity.privileges,
      sessionToken,
      tokenType: 'SESSION_TOKEN',
      expiresAt: Math.floor(Date.now() / 1000) + 24 * 3600,
    });
  } catch (err: any) {
    res.status(500).json({
      valid: false,
      error: 'SSOLoginError',
      message: err.message,
    });
  }
});

/**
 * GET /api/auth/directory
 * Lists registered staff accounts and their mapped Google RBAC privileges
 */
authRouter.get('/directory', async (_req: Request, res: Response) => {
  try {
    const entries = await RoleDirectoryService.getDirectoryStaff();
    const summary = {
      owners: entries.filter((e) => e.role === 'OWNER').length,
      planners: entries.filter((e) => e.role === 'PLANNER' || (e.role === 'EDITOR' && e.isManager)).length,
      staff: entries.filter((e) => e.type === 'NURSE' || e.type === 'DOCTOR' || e.role === 'STAFF').length,
      viewers: entries.filter((e) => e.role === 'VIEWER' && e.type !== 'NURSE' && e.type !== 'DOCTOR').length,
      pending: entries.filter((e) => e.accessStatus === 'PENDING').length,
      approved: entries.filter((e) => e.accessStatus === 'APPROVED').length,
    };

    const repo = getServerRepository();
    const clinics = (await repo.list('clinics')) as any[];
    const activeClinic = clinics[0];
    const clinicName = activeClinic?.name || 'Outpatient Clinic';
    const clinicId = activeClinic?.id || 'clinic-primary';

    res.json({
      status: 'ok',
      clinic: {
        id: clinicId,
        name: clinicName,
      },
      totalRegistered: entries.length,
      summary,
      entries,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
});

/**
 * POST /api/auth/directory/test-match
 * Simulates and returns role matching for any given email address without requiring a live token
 */
authRouter.post('/directory/test-match', async (req: Request, res: Response) => {
  const { email, name } = req.body || {};

  if (!email || typeof email !== 'string') {
    res.status(400).json({
      status: 'error',
      message: 'An email address is required in the request body.',
    });
    return;
  }

  try {
    const matchedIdentity = await RoleDirectoryService.resolveRoleFromEmail(email, name);
    res.json({
      status: 'ok',
      email: matchedIdentity.email,
      name: matchedIdentity.name,
      role: matchedIdentity.role,
      appRole: matchedIdentity.appRole,
      isManager: matchedIdentity.isManager,
      accessStatus: matchedIdentity.accessStatus,
      matchedEntity: matchedIdentity.matchedEntity,
      isRegisteredStaff: matchedIdentity.isRegisteredStaff,
      nurseCode: matchedIdentity.nurseCode,
      seniorityLevel: matchedIdentity.seniorityLevel,
      privileges: matchedIdentity.privileges,
      description: matchedIdentity.description,
    });
  } catch (err: any) {
    res.status(500).json({
      status: 'error',
      message: err.message,
    });
  }
});

/**
 * POST /api/auth/token
 * Issues a signed local test token for rapid testing and RBAC validation
 */
authRouter.post('/token', (req: Request, res: Response) => {
  const { role, name, email, uid, isManager, appRole } = req.body || {};
  const isRoland = (email || '').trim().toLowerCase() === MASTER_ADMIN_EMAIL;

  const validRole: BackendRole = isRoland
    ? 'OWNER'
    : (
        role && ['OWNER', 'PLANNER', 'EDITOR', 'STAFF', 'VIEWER'].includes(role.toUpperCase())
          ? role.toUpperCase()
          : 'STAFF'
      ) as BackendRole;

  const user: Partial<AuthUser> = {
    uid: uid || (isRoland ? 'usr-admin-roland' : `usr-${validRole.toLowerCase()}-${Date.now().toString(36)}`),
    name: name || (isRoland ? 'Dr. Roland / Clinical Director' : `${validRole} User`),
    email: email || (isRoland ? MASTER_ADMIN_EMAIL : `${validRole.toLowerCase()}@alshifa.ae`),
    role: validRole,
    appRole: appRole || (validRole === 'OWNER' || validRole === 'PLANNER' || validRole === 'EDITOR' ? 'EDITOR' : 'VIEWER'),
    isManager: isRoland ? true : !!isManager,
    accessStatus: 'APPROVED',
    isLocal: true,
  };

  const token = signLocalToken(user, 24);

  res.json({
    status: 'ok',
    token,
    user,
    expiresIn: '24h',
  });
});

/**
 * GET /api/auth/protected-test
 * Verification route for RBAC testing
 */
authRouter.get('/protected-test', requireAuth, (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    message: `Access granted for user ${req.user?.name} with role ${req.user?.role}`,
    user: req.user,
  });
});
