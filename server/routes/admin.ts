/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Admin Maintenance & User Management Routes (Phase 2)
 * Provides database statistics, health indicators, dataset re-seeding,
 * and Master Admin (rolandabj@gmail.com) exclusive user whitelist management.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import {
  getServerDatabaseStats,
  reseedServerDatabase,
  clearServerDatabase,
} from '../services/seed/serverSeedRunner';
import { requireOwner, requirePlanner } from '../middleware/auth';
import { acknowledgmentChaser } from '../services/jobs/acknowledgmentChaser';
import { MASTER_ADMIN_EMAIL } from '../services/auth/roleDirectoryService';
import { UserAccessRecord, Nurse, Doctor } from '../../src/types';

export const adminRouter = Router();

/**
 * GET /api/admin/stats
 * Returns document counts across all collections
 */
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const collectionCounts = await getServerDatabaseStats(repo);

    let totalRecords = 0;
    for (const count of Object.values(collectionCounts)) {
      totalRecords += count;
    }

    res.json({
      status: 'ok',
      totalRecords,
      counts: collectionCounts,
      storageType: 'file-backed-json',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[AdminAPI] Failed to fetch stats:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve database statistics',
      error: err.message,
    });
  }
});

/**
 * POST /api/admin/reseed
 * Permanently decommissioned for production compliance.
 */
adminRouter.post('/reseed', requireOwner, async (_req: Request, res: Response) => {
  res.status(410).json({
    status: 'error',
    message: 'Demo data re-seeding has been permanently decommissioned for production compliance.',
  });
});

/**
 * POST /api/admin/clear
 * Permanently wipes all database records across all server collections and records a CLEARED tombstone.
 * Guarded: Requires OWNER role (rolandabj@gmail.com).
 */
adminRouter.post('/clear', requireOwner, async (req: Request, res: Response) => {
  try {
    const userEmail = req.user?.email || 'Master Administrator';

    // Strict Master Admin verification: requires OWNER role and rolandabj@gmail.com (or local dev owner token)
    const isMasterAdmin =
      req.user?.role === 'OWNER' &&
      (req.user?.email?.toLowerCase() === MASTER_ADMIN_EMAIL.toLowerCase() || req.user?.isLocal);

    if (!isMasterAdmin) {
      res.status(403).json({
        error: 'Forbidden',
        message: `Clear database is strictly restricted to Master Administrator (${MASTER_ADMIN_EMAIL}).`,
      });
      return;
    }

    console.info(`[AdminAPI] Triggering server database wipe by ${userEmail}...`);
    const repo = getServerRepository();
    await clearServerDatabase(repo, userEmail);
    const updatedCounts = await getServerDatabaseStats(repo);

    let totalRecords = 0;
    for (const [col, count] of Object.entries(updatedCounts)) {
      if (col !== 'systemMetadata') {
        totalRecords += count;
      }
    }

    res.json({
      status: 'ok',
      message: 'All server database records have been permanently cleared and tombstoned.',
      totalRecords,
      counts: updatedCounts,
      tombstone: 'CLEARED',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('[AdminAPI] Failed to clear database:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to clear database records',
      error: err.message,
    });
  }
});

/**
 * GET /api/admin/users
 * Returns all whitelisted users, pending login requests, assigned roles, and manager designations.
 * Guarded: Exclusively accessible by the Master Admin (rolandabj@gmail.com).
 */
adminRouter.get('/users', requireOwner, async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const [userAccessList, nurses, doctors] = await Promise.all([
      (repo.list('userAccess') as Promise<UserAccessRecord[]>),
      (repo.list('nurses') as Promise<Nurse[]>),
      (repo.list('doctors') as Promise<Doctor[]>),
    ]);

    // Ensure rolandabj@gmail.com is listed as primary master admin
    const hasRoland = userAccessList.some(
      (u) => u.email.trim().toLowerCase() === MASTER_ADMIN_EMAIL
    );

    const fullUsers = hasRoland
      ? userAccessList
      : [
          {
            id: 'usr-access-roland',
            email: MASTER_ADMIN_EMAIL,
            name: 'Dr. Roland / Clinical Director',
            status: 'APPROVED' as const,
            appRole: 'EDITOR' as const,
            isManager: true,
            approvedBy: MASTER_ADMIN_EMAIL,
            approvedAt: '2026-09-20T08:00:00Z',
            createdAt: '2026-09-20T08:00:00Z',
          },
          ...userAccessList,
        ];

    res.json({
      status: 'ok',
      masterAdmin: MASTER_ADMIN_EMAIL,
      count: fullUsers.length,
      users: fullUsers,
      nurses,
      doctors,
    });
  } catch (err: any) {
    console.error('[AdminAPI] Failed to list users:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve user access directory',
      error: err.message,
    });
  }
});

/**
 * POST /api/admin/users/approve
 * Allows rolandabj@gmail.com to approve pending emails and assign their role (VIEWER vs EDITOR),
 * manager status (isManager), and associated nurse profile.
 * Guarded: Requires OWNER role.
 */
adminRouter.post('/users/approve', requireOwner, async (req: Request, res: Response) => {
  const { email, appRole, isManager, linkedNurseId, name } = req.body || {};

  if (!email || typeof email !== 'string') {
    res.status(400).json({
      status: 'error',
      message: 'A valid email address is required to approve access.',
    });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const repo = getServerRepository();
    const userAccessList = (await repo.list('userAccess')) as UserAccessRecord[];
    const existing = userAccessList.find(
      (u) => u.email && u.email.trim().toLowerCase() === normalizedEmail
    );

    const now = new Date().toISOString();
    const assignedRole = appRole === 'EDITOR' ? 'EDITOR' : 'VIEWER';
    const managerFlag = Boolean(isManager);

    let record: UserAccessRecord;

    if (existing) {
      record = await repo.update('userAccess', existing.id, {
        name: name || existing.name,
        status: 'APPROVED',
        appRole: assignedRole,
        isManager: managerFlag,
        linkedNurseId: linkedNurseId !== undefined ? linkedNurseId : existing.linkedNurseId,
        approvedBy: MASTER_ADMIN_EMAIL,
        approvedAt: now,
        updatedAt: now,
      });
    } else {
      record = await repo.create('userAccess', {
        id: `usr-access-${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`,
        email: normalizedEmail,
        name: name || normalizedEmail.split('@')[0],
        status: 'APPROVED',
        appRole: assignedRole,
        isManager: managerFlag,
        linkedNurseId: linkedNurseId || undefined,
        approvedBy: MASTER_ADMIN_EMAIL,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    res.json({
      status: 'ok',
      message: `User access approved for ${normalizedEmail} as ${assignedRole} (Manager Approver: ${managerFlag ? 'YES' : 'NO'}).`,
      user: record,
    });
  } catch (err: any) {
    console.error('[AdminAPI] Failed to approve user access:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to approve user access',
      error: err.message,
    });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Allows modifying a user's role (VIEWER vs EDITOR), manager approver status, or linked nurse.
 * Guarded: Requires OWNER role.
 */
adminRouter.put('/users/:id/role', requireOwner, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { appRole, isManager, linkedNurseId, status, name } = req.body || {};

  try {
    const repo = getServerRepository();
    const existing = await repo.get('userAccess', id);

    if (!existing) {
      res.status(404).json({
        status: 'error',
        message: `User access record with ID '${id}' was not found.`,
      });
      return;
    }

    // Protect Master Admin from being revoked or degraded
    if (existing.email.trim().toLowerCase() === MASTER_ADMIN_EMAIL) {
      res.status(400).json({
        status: 'error',
        message: 'The Master Administrator account cannot be modified or degraded.',
      });
      return;
    }

    const updates: Partial<UserAccessRecord> = {
      updatedAt: new Date().toISOString(),
    };

    if (name) updates.name = name;
    if (appRole) updates.appRole = appRole === 'EDITOR' ? 'EDITOR' : 'VIEWER';
    if (isManager !== undefined) updates.isManager = Boolean(isManager);
    if (linkedNurseId !== undefined) updates.linkedNurseId = linkedNurseId;
    if (status) updates.status = status;

    const updated = await repo.update('userAccess', id, updates);

    res.json({
      status: 'ok',
      message: `User ${existing.email} updated successfully.`,
      user: updated,
    });
  } catch (err: any) {
    console.error('[AdminAPI] Failed to update user access:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update user access record',
      error: err.message,
    });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Revokes access immediately for a user.
 * Guarded: Requires OWNER role.
 */
adminRouter.delete('/users/:id', requireOwner, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const repo = getServerRepository();
    const existing = await repo.get('userAccess', id);

    if (!existing) {
      res.status(404).json({
        status: 'error',
        message: `User access record with ID '${id}' was not found.`,
      });
      return;
    }

    if (existing.email.trim().toLowerCase() === MASTER_ADMIN_EMAIL) {
      res.status(400).json({
        status: 'error',
        message: 'The Master Administrator account cannot be revoked.',
      });
      return;
    }

    const updated = await repo.update('userAccess', id, {
      status: 'REVOKED',
      updatedAt: new Date().toISOString(),
    });

    res.json({
      status: 'ok',
      message: `Access revoked for ${existing.email}.`,
      user: updated,
    });
  } catch (err: any) {
    console.error('[AdminAPI] Failed to revoke user access:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to revoke user access',
      error: err.message,
    });
  }
});

/**
 * POST /api/admin/users/purge-non-master
 * Purges all user access records other than the Master Administrator (rolandabj@gmail.com).
 * Guarded: Exclusively accessible by the Master Admin.
 */
adminRouter.post('/users/purge-non-master', requireOwner, async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const userAccessList = (await repo.list('userAccess')) as UserAccessRecord[];
    let deletedCount = 0;

    for (const user of userAccessList) {
      if (user.email.trim().toLowerCase() !== MASTER_ADMIN_EMAIL) {
        await repo.remove('userAccess', user.id);
        deletedCount++;
      }
    }

    const existingRoland = await repo.get('userAccess', 'usr-access-roland');
    if (!existingRoland) {
      await repo.create('userAccess', {
        id: 'usr-access-roland',
        email: MASTER_ADMIN_EMAIL,
        name: 'Dr. Roland / Clinical Director',
        status: 'APPROVED',
        appRole: 'EDITOR',
        isManager: true,
        approvedBy: MASTER_ADMIN_EMAIL,
        approvedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      status: 'ok',
      message: `Purged ${deletedCount} non-master user access records. Master admin preserved.`,
      deletedCount,
      masterAdmin: MASTER_ADMIN_EMAIL,
    });
  } catch (err: any) {
    console.error('[AdminAPI] Failed to purge non-master users:', err);
    res.status(500).json({
      status: 'error',
      message: 'Failed to purge non-master users',
      error: err.message,
    });
  }
});

/**
 * GET /api/admin/chaser/status
 * Returns current status, run counts, and statistics of the Acknowledgment Chaser job
 */
adminRouter.get('/chaser/status', requirePlanner, async (_req: Request, res: Response) => {
  try {
    const status = acknowledgmentChaser.getStatus();
    res.json({ status: 'ok', data: status });
  } catch (err: any) {
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/admin/chaser/run
 * Manually invokes a chaser cycle with optional custom threshold
 * Guarded: Requires Planner or Owner
 */
adminRouter.post('/chaser/run', requirePlanner, async (req: Request, res: Response) => {
  try {
    const thresholdHours = req.body?.thresholdHours !== undefined ? Number(req.body.thresholdHours) : undefined;
    const result = await acknowledgmentChaser.runChaserCycle(thresholdHours);
    res.json({ status: 'ok', data: result });
  } catch (err: any) {
    console.error('[AdminAPI] Chaser run failed:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/admin/chaser/configure
 * Dynamically updates interval, threshold, or enabled status
 * Guarded: Requires Owner
 */
adminRouter.post('/chaser/configure', requireOwner, async (req: Request, res: Response) => {
  try {
    const { intervalMinutes, thresholdHours, enabled } = req.body;
    const status = acknowledgmentChaser.configure({
      intervalMinutes: intervalMinutes !== undefined ? Number(intervalMinutes) : undefined,
      thresholdHours: thresholdHours !== undefined ? Number(thresholdHours) : undefined,
      enabled: enabled !== undefined ? Boolean(enabled) : undefined,
    });
    res.json({ status: 'ok', data: status });
  } catch (err: any) {
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
