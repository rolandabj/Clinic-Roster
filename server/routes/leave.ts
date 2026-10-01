/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Nurse Leave Self-Service API (Phase 3)
 * Allows nurses to submit their own leave requests (Annual, Sick, Public Holiday, etc.)
 * with strict nurse isolation and manager approval workflow.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { requireAuth } from '../middleware/auth';
import { LeaveEntry, LeaveType, Nurse } from '../../src/types';
import { MASTER_ADMIN_EMAIL } from '../services/auth/roleDirectoryService';

export const leaveRouter = Router();

/**
 * Helper to resolve the authenticated user's linked nurse ID
 */
async function resolveUserNurseId(req: Request): Promise<string | null> {
  if (!req.user) return null;
  if (req.user.linkedNurseId) return req.user.linkedNurseId;

  const repo = getServerRepository();
  const nurses = (await repo.list('nurses')) as Nurse[];
  const matched = nurses.find(
    (n) => n.gmail && n.gmail.trim().toLowerCase() === req.user?.email.trim().toLowerCase()
  );

  return matched ? matched.id : null;
}

/**
 * GET /api/leave/my
 * Returns leave records for the authenticated nurse
 */
leaveRouter.get('/leave/my', requireAuth, async (req: Request, res: Response) => {
  try {
    const nurseId = await resolveUserNurseId(req);
    const repo = getServerRepository();
    const allLeaves = (await repo.list('leaveEntries')) as LeaveEntry[];

    if (!nurseId) {
      if (req.user?.role === 'OWNER' || req.user?.email === MASTER_ADMIN_EMAIL) {
        res.json({ status: 'ok', data: allLeaves });
        return;
      }
      res.json({ status: 'ok', data: [] });
      return;
    }

    const myLeaves = allLeaves.filter((l) => l.nurseId === nurseId);
    res.json({ status: 'ok', data: myLeaves });
  } catch (err: any) {
    console.error('[LeaveAPI] GET /my error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/leave/nurse/:nurseId
 * Returns leave records for a specific nurse (self or manager/admin)
 */
leaveRouter.get('/leave/nurse/:nurseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const targetNurseId = req.params.nurseId;
    const userNurseId = await resolveUserNurseId(req);
    const isMasterAdmin = req.user?.role === 'OWNER' || req.user?.email === MASTER_ADMIN_EMAIL;
    const isManager = Boolean(req.user?.isManager);

    if (!isMasterAdmin && !isManager && userNurseId !== targetNurseId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own leave requests.',
      });
      return;
    }

    const repo = getServerRepository();
    const allLeaves = (await repo.list('leaveEntries')) as LeaveEntry[];
    const filtered = allLeaves.filter((l) => l.nurseId === targetNurseId);

    res.json({ status: 'ok', data: filtered });
  } catch (err: any) {
    console.error('[LeaveAPI] GET /nurse/:id error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/leave/request
 * Nurse submits a new leave request (marked PENDING approval)
 */
leaveRouter.post('/leave/request', requireAuth, async (req: Request, res: Response) => {
  try {
    const { nurseId: requestedNurseId, leaveTypeId, startDate, endDate, note } = req.body;

    if (!leaveTypeId || !startDate || !endDate) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Leave type, start date, and end date are required.',
      });
      return;
    }

    const userNurseId = await resolveUserNurseId(req);
    const isMasterAdmin = req.user?.role === 'OWNER' || req.user?.email === MASTER_ADMIN_EMAIL;
    const isManager = Boolean(req.user?.isManager);

    const targetNurseId = requestedNurseId || userNurseId;

    if (!targetNurseId) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Could not associate request with a nurse profile.',
      });
      return;
    }

    // Nurse Isolation Rule
    if (!isMasterAdmin && !isManager && targetNurseId !== userNurseId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You are not authorized to submit leave requests for other nurses.',
      });
      return;
    }

    const repo = getServerRepository();
    const leaveTypes = (await repo.list('leaveTypes')) as LeaveType[];
    const matchedType = leaveTypes.find((lt) => lt.id === leaveTypeId);

    // Calculate approximate credited hours (8 hours per day standard if match_duty or fixed)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    const hoursPerDay = typeof matchedType?.creditedHours === 'number' ? matchedType.creditedHours : 8;
    const totalHoursCredited = diffDays * hoursPerDay;

    // Strict Annual Quota in Days Enforcement
    const nurses = (await repo.list('nurses')) as Nurse[];
    const targetNurse = nurses.find((n) => n.id === targetNurseId);
    const rawQuota = targetNurse?.leaveQuotas?.[leaveTypeId];

    if (typeof rawQuota === 'number' && rawQuota > 0) {
      const quotaDays = rawQuota > 40 && rawQuota % 8 === 0 ? rawQuota / 8 : rawQuota;
      const startYear = startDate.slice(0, 4);
      const allLeaves = (await repo.list('leaveEntries')) as LeaveEntry[];
      const existingYearLeaves = allLeaves.filter(
        (le) =>
          le.nurseId === targetNurseId &&
          le.leaveTypeId === leaveTypeId &&
          le.startDate.startsWith(`${startYear}-`) &&
          le.status !== 'REJECTED'
      );

      const existingDays = existingYearLeaves.reduce((sum, le) => {
        const s = new Date(le.startDate).getTime();
        const e = new Date(le.endDate).getTime();
        const d = Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1);
        return sum + d;
      }, 0);

      if (existingDays + diffDays > quotaDays) {
        res.status(400).json({
          error: 'QuotaExceeded',
          message: `Leave quota exceeded: ${targetNurse?.fullName || 'Staff'} has already requested or scheduled ${existingDays} of ${quotaDays} allowed ${matchedType?.name || 'leave'} days for ${startYear}. Requesting ${diffDays} day(s) exceeds the annual limit by ${existingDays + diffDays - quotaDays} day(s).`,
        });
        return;
      }
    }

    const now = new Date().toISOString();

    const newLeave: LeaveEntry = {
      id: `leave-req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      nurseId: targetNurseId,
      leaveTypeId,
      startDate,
      endDate,
      note: note || undefined,
      approved: false, // requires manager approval
      status: 'PENDING',
      hoursCredited: totalHoursCredited,
      submittedByNurseId: userNurseId || targetNurseId,
      submittedAt: now,
    };

    const created = await repo.create('leaveEntries', newLeave);

    res.json({
      status: 'ok',
      message: 'Leave request submitted successfully and is pending manager review.',
      data: created,
    });
  } catch (err: any) {
    console.error('[LeaveAPI] POST /request error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * DELETE /api/leave/request/:id
 * Nurse cancels their own pending leave request
 */
leaveRouter.delete('/leave/request/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = (await repo.get('leaveEntries', id)) as LeaveEntry | null;

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: 'Leave request not found.' });
      return;
    }

    const userNurseId = await resolveUserNurseId(req);
    const isMasterAdmin = req.user?.role === 'OWNER' || req.user?.email === MASTER_ADMIN_EMAIL;
    const isManager = Boolean(req.user?.isManager);

    if (!isMasterAdmin && !isManager && existing.nurseId !== userNurseId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You cannot cancel leave requests submitted for other nurses.',
      });
      return;
    }

    await repo.remove('leaveEntries', id);
    res.json({ status: 'ok', message: 'Leave request cancelled successfully.' });
  } catch (err: any) {
    console.error('[LeaveAPI] DELETE /request/:id error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
