/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Approvals Queue API (Phase 3)
 * Provides pending request listings and decision endpoints for the designated Manager / Charge Nurse.
 * Automatically synchronizes approved leave and day-off constraints with CP-SAT solver and locks.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { requireAuth } from '../middleware/auth';
import {
  LeaveEntry,
  AvailabilityRequest,
  Nurse,
  LeaveType,
  LockEntry,
  AuditEvent,
} from '../../src/types';
import { MASTER_ADMIN_EMAIL } from '../services/auth/roleDirectoryService';

export const approvalsRouter = Router();

/**
 * Middleware ensuring caller is either Master Admin or an appointed Manager
 */
function requireManagerOrAdmin(req: Request, res: Response, next: () => void) {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized', message: 'Authentication required.' });
    return;
  }

  const isMasterAdmin = req.user.role === 'OWNER' || req.user.email === MASTER_ADMIN_EMAIL;
  const isManager = Boolean(req.user.isManager);

  if (!isMasterAdmin && !isManager) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'Approvals queue is restricted to Clinical Managers and the Master Administrator.',
    });
    return;
  }

  next();
}

/**
 * GET /api/approvals/pending
 * Returns all pending leave and availability requests across all nurses
 */
approvalsRouter.get('/approvals/pending', requireAuth, requireManagerOrAdmin, async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const [allLeaves, allAvailability, nurses, leaveTypes] = await Promise.all([
      (repo.list('leaveEntries') as Promise<LeaveEntry[]>),
      (repo.list('availabilityRequests') as Promise<AvailabilityRequest[]>),
      (repo.list('nurses') as Promise<Nurse[]>),
      (repo.list('leaveTypes') as Promise<LeaveType[]>),
    ]);

    const nurseMap = new Map(nurses.map((n) => [n.id, n]));
    const leaveTypeMap = new Map(leaveTypes.map((lt) => [lt.id, lt]));

    // Filter pending leaves
    const pendingLeaves = allLeaves
      .filter((l) => l.status === 'PENDING' || (l.status === undefined && l.approved === false))
      .map((l) => {
        const nurse = nurseMap.get(l.nurseId);
        const leaveType = leaveTypeMap.get(l.leaveTypeId);
        return {
          ...l,
          nurseName: nurse?.fullName || 'Unknown Nurse',
          nurseEmail: nurse?.gmail || '',
          nurseCode: nurse?.employeeCode || '',
          leaveTypeName: leaveType?.name || 'Leave',
          leaveTypeColor: leaveType?.color || '#3b82f6',
        };
      });

    // Filter pending availability requests
    const pendingAvailability = allAvailability
      .filter((a) => a.status === 'PENDING')
      .map((a) => {
        const nurse = nurseMap.get(a.nurseId);
        return {
          ...a,
          nurseName: nurse?.fullName || 'Unknown Nurse',
          nurseEmail: nurse?.gmail || '',
          nurseCode: nurse?.employeeCode || '',
        };
      });

    res.json({
      status: 'ok',
      count: pendingLeaves.length + pendingAvailability.length,
      leavesCount: pendingLeaves.length,
      availabilityCount: pendingAvailability.length,
      data: {
        leaveRequests: pendingLeaves,
        availabilityRequests: pendingAvailability,
      },
    });
  } catch (err: any) {
    console.error('[ApprovalsAPI] GET /pending error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/approvals/decide
 * Approves or rejects a pending leave or availability request
 */
approvalsRouter.post('/approvals/decide', requireAuth, requireManagerOrAdmin, async (req: Request, res: Response) => {
  try {
    const { kind, requestId, decision, notes } = req.body;

    if (!kind || !requestId || !decision) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Request kind, requestId, and decision (APPROVED | REJECTED) are required.',
      });
      return;
    }

    if (decision !== 'APPROVED' && decision !== 'REJECTED') {
      res.status(400).json({
        error: 'BadRequest',
        message: "Decision must be either 'APPROVED' or 'REJECTED'.",
      });
      return;
    }

    const repo = getServerRepository();
    const reviewerId = req.user?.uid || 'usr-manager';
    const reviewerName = req.user?.name || req.user?.email || 'Manager';
    const now = new Date().toISOString();

    if (kind === 'LEAVE') {
      const existing = (await repo.get('leaveEntries', requestId)) as LeaveEntry | null;
      if (!existing) {
        res.status(404).json({ error: 'NotFound', message: `Leave request '${requestId}' not found.` });
        return;
      }

      const isApproved = decision === 'APPROVED';
      const updated = await repo.update('leaveEntries', requestId, {
        approved: isApproved,
        status: decision,
        reviewedByUserId: reviewerId,
        reviewedByUserName: reviewerName,
        reviewedAt: now,
        reviewNotes: notes || existing.reviewNotes,
      });

      // Audit Trail Record
      const audit: AuditEvent = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        actor: reviewerName,
        action: 'UPDATE',
        entity: 'LeaveEntry',
        entityId: requestId,
        note: `Leave request for Nurse ${existing.nurseId} (${existing.startDate} to ${existing.endDate}) was ${decision} by ${reviewerName}`,
        timestamp: now,
      };
      await repo.create('audit', audit);

      res.json({
        status: 'ok',
        message: `Leave request ${decision.toLowerCase()} successfully.`,
        data: updated,
      });
      return;
    }

    if (kind === 'AVAILABILITY') {
      const existing = (await repo.get('availabilityRequests', requestId)) as AvailabilityRequest | null;
      if (!existing) {
        res.status(404).json({ error: 'NotFound', message: `Availability request '${requestId}' not found.` });
        return;
      }

      const updated = await repo.update('availabilityRequests', requestId, {
        status: decision,
        reviewedByUserId: reviewerId,
        reviewedByUserName: reviewerName,
        reviewedAt: now,
        reviewNotes: notes || existing.reviewNotes,
      });

      // If approved and nurse requested DAY OFF (available === false), sync with Locks collection
      if (decision === 'APPROVED' && existing.available === false) {
        const locks = (await repo.list('locks')) as LockEntry[];
        const alreadyLocked = locks.some(
          (l) => l.nurseId === existing.nurseId && l.date === existing.date
        );

        if (!alreadyLocked) {
          const lockEntry: LockEntry = {
            id: `lock-off-${existing.nurseId}-${existing.date}`,
            nurseId: existing.nurseId,
            date: existing.date,
            mode: 'OFF',
            note: `Approved Day-Off request: ${existing.note || 'Rest day'}`,
            createdAt: now,
          };
          await repo.create('locks', lockEntry);
        }
      }

      // Audit Trail Record
      const audit: AuditEvent = {
        id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
        actor: reviewerName,
        action: 'UPDATE',
        entity: 'AvailabilityRequest',
        entityId: requestId,
        note: `Availability request for Nurse ${existing.nurseId} on ${existing.date} was ${decision} by ${reviewerName}`,
        timestamp: now,
      };
      await repo.create('audit', audit);

      res.json({
        status: 'ok',
        message: `Availability request ${decision.toLowerCase()} successfully.`,
        data: updated,
      });
      return;
    }

    res.status(400).json({ error: 'BadRequest', message: `Unknown request kind '${kind}'.` });
  } catch (err: any) {
    console.error('[ApprovalsAPI] POST /decide error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
