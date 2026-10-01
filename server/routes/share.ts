/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Tokenized Public Schedule Sharing API
 * Manages secure share links with expiration, restricted email access, and revocation.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getServerRepository } from '../db/index';
import { requirePlanner } from '../middleware/auth';
import { ShareLink, Schedule, ScheduleVersion } from '../../src/types';

export const shareRouter = Router();

/**
 * POST /api/share
 * Create a secure tokenized share link with optional expiration and allowed emails list
 * Guarded: Requires Planner or Owner role
 */
shareRouter.post('/share', requirePlanner, async (req: Request, res: Response) => {
  try {
    const {
      scheduleId,
      allowedEmails = [],
      expiresAt,
      pointsToVersionId,
      public: isPublic = true,
    } = req.body;

    if (!scheduleId) {
      res.status(400).json({ error: 'BadRequest', message: 'scheduleId is required.' });
      return;
    }

    const repo = getServerRepository();
    const schedule = await repo.get('schedules', scheduleId);
    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: `Schedule ${scheduleId} not found.` });
      return;
    }

    // Verify version if provided
    let versionId = pointsToVersionId;
    if (!versionId) {
      const versions = await repo.list('versions');
      const latestPublished = versions
        .filter((v) => v.scheduleId === scheduleId && v.isPublished)
        .sort((a, b) => b.number - a.number)[0];
      versionId = latestPublished?.id || '';
    }

    const now = new Date().toISOString();
    const token = `sh_${uuidv4().replace(/-/g, '')}`;

    const shareLink: ShareLink = {
      id: `share-${uuidv4().slice(0, 8)}`,
      scheduleId,
      token,
      role: 'VIEWER',
      public: isPublic && allowedEmails.length === 0,
      allowedEmails: Array.isArray(allowedEmails) ? allowedEmails.map((e: string) => e.trim().toLowerCase()) : [],
      createdAt: now,
      revoked: false,
      pointsToVersionId: versionId,
      ...(expiresAt ? { expiresAt } : {}),
    };

    const created = await repo.create('shareLinks', shareLink);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized Planner',
      action: 'CREATE',
      entity: 'ShareLink',
      entityId: created.id,
      note: `Created share link for schedule ${schedule.name} (token: ${token.slice(0, 8)}...)`,
      timestamp: now,
    });

    res.status(201).json({ status: 'ok', data: created });
  } catch (err: any) {
    console.error('[ShareAPI] POST /api/share error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/share/:token
 * Public endpoint returning read-only schedule, versions, and assignments
 * Guarded by revocation status, expiration, and optional allowed emails list
 */
shareRouter.get('/share/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const requestedEmail = (req.query.email as string)?.trim().toLowerCase() || req.user?.email?.toLowerCase();

    const repo = getServerRepository();
    const allShares = await repo.list('shareLinks');
    const shareLink = allShares.find((s) => s.token === token);

    if (!shareLink) {
      res.status(404).json({ error: 'NotFound', message: 'Share link not found or invalid token.' });
      return;
    }

    if (shareLink.revoked) {
      res.status(410).json({ error: 'Gone', message: 'This share link has been revoked by the clinic planner.' });
      return;
    }

    // Check expiration
    if ((shareLink as any).expiresAt) {
      const expirationDate = new Date((shareLink as any).expiresAt);
      if (new Date() > expirationDate) {
        res.status(410).json({ error: 'Expired', message: 'This share link has expired.' });
        return;
      }
    }

    // Allowed emails verification
    if (shareLink.allowedEmails && shareLink.allowedEmails.length > 0) {
      if (!requestedEmail || !shareLink.allowedEmails.includes(requestedEmail)) {
        res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied: your email address is not authorized for this private share link.',
          requiresEmailAuth: true,
        });
        return;
      }
    }

    // Load schedule and relational data
    const schedule = await repo.get('schedules', shareLink.scheduleId);
    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: 'Associated schedule not found.' });
      return;
    }

    const [allVersions, allAssignments, dutyWindows, doctors, roles, specialties, nurses] =
      await Promise.all([
        repo.list('versions'),
        repo.list('assignments'),
        repo.list('dutyWindows'),
        repo.list('doctors'),
        repo.list('clinicalRoles'),
        repo.list('specialties'),
        repo.list('nurses'),
      ]);

    let targetVersion: ScheduleVersion | undefined;
    if (shareLink.pointsToVersionId) {
      targetVersion = allVersions.find((v) => v.id === shareLink.pointsToVersionId);
    }
    if (!targetVersion) {
      const schedulePublishedVersions = allVersions
        .filter((v) => v.scheduleId === schedule.id && v.isPublished)
        .sort((a, b) => b.number - a.number);
      targetVersion = schedulePublishedVersions[0];
    }

    // Use assignments from target version snapshot if present, else fallback to live schedule assignments
    const assignments = targetVersion?.snapshot?.assignments ||
      allAssignments.filter((a) => a.scheduleId === schedule.id);

    // Sanitize nurses for public viewer (strip sensitive notes, phone, DOB)
    const sanitizedNurses = nurses.map((n) => ({
      id: n.id,
      fullName: n.fullName,
      employeeCode: n.employeeCode,
      seniorityLevelId: n.seniorityLevelId,
      contractPercent: n.contractPercent,
      active: n.active,
    }));

    res.json({
      status: 'ok',
      data: {
        shareLink: {
          id: shareLink.id,
          token: shareLink.token,
          role: shareLink.role,
          public: shareLink.public,
          createdAt: shareLink.createdAt,
          expiresAt: (shareLink as any).expiresAt,
        },
        schedule: {
          id: schedule.id,
          name: schedule.name,
          startDate: schedule.startDate,
          endDate: schedule.endDate,
          blockWeeks: schedule.blockWeeks,
          status: schedule.status,
          activeVersionNumber: schedule.activeVersionNumber,
        },
        version: targetVersion
          ? {
              id: targetVersion.id,
              number: targetVersion.number,
              timestamp: targetVersion.timestamp,
              note: targetVersion.note,
              publishedAt: targetVersion.publishedAt,
            }
          : null,
        assignments,
        dutyWindows,
        doctors,
        roles,
        specialties,
        nurses: sanitizedNurses,
      },
    });
  } catch (err: any) {
    console.error(`[ShareAPI] GET /api/share/${req.params.token} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * DELETE /api/share/:id
 * Revoke an active share link
 * Guarded: Requires Planner or Owner role
 */
shareRouter.delete('/share/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const shareLink = await repo.get('shareLinks', id);

    if (!shareLink) {
      res.status(404).json({ error: 'NotFound', message: `Share link ${id} not found.` });
      return;
    }

    await repo.update('shareLinks', id, { revoked: true });

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized Planner',
      action: 'UPDATE',
      entity: 'ShareLink',
      entityId: id,
      note: `Revoked share link token ${shareLink.token.slice(0, 8)}...`,
      timestamp: new Date().toISOString(),
    });

    res.json({
      status: 'ok',
      message: `Share link ${id} has been revoked successfully.`,
    });
  } catch (err: any) {
    console.error(`[ShareAPI] DELETE /api/share/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
