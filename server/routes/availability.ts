/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Nurse Availability & Preference Self-Service API (Phase 3)
 * Allows nurses to manage and submit their own availability and requested days off,
 * enforcing strict nurse isolation.
 */

import { Router, Request, Response } from 'express';
import { getServerRepository } from '../db/index';
import { requireAuth } from '../middleware/auth';
import { AvailabilityRequest, Nurse } from '../../src/types';
import { MASTER_ADMIN_EMAIL } from '../services/auth/roleDirectoryService';

export const availabilityRouter = Router();

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
 * GET /api/availability/my
 * Returns availability requests for the logged-in nurse
 */
availabilityRouter.get('/availability/my', requireAuth, async (req: Request, res: Response) => {
  try {
    const nurseId = await resolveUserNurseId(req);
    const repo = getServerRepository();
    const allRequests = (await repo.list('availabilityRequests')) as AvailabilityRequest[];

    if (!nurseId) {
      // If Master Admin, return all
      if (req.user?.role === 'OWNER' || req.user?.email === MASTER_ADMIN_EMAIL) {
        res.json({ status: 'ok', data: allRequests });
        return;
      }
      res.json({ status: 'ok', data: [] });
      return;
    }

    const myRequests = allRequests.filter((r) => r.nurseId === nurseId);
    res.json({ status: 'ok', data: myRequests });
  } catch (err: any) {
    console.error('[AvailabilityAPI] GET /my error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/availability/nurse/:nurseId
 * Returns availability requests for a specific nurse (self, or manager/admin)
 */
availabilityRouter.get('/availability/nurse/:nurseId', requireAuth, async (req: Request, res: Response) => {
  try {
    const targetNurseId = req.params.nurseId;
    const userNurseId = await resolveUserNurseId(req);
    const isMasterAdmin = req.user?.role === 'OWNER' || req.user?.email === MASTER_ADMIN_EMAIL;
    const isManager = Boolean(req.user?.isManager);

    // Enforce nurse isolation: only self, manager, or owner can view
    if (!isMasterAdmin && !isManager && userNurseId !== targetNurseId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own availability requests.',
      });
      return;
    }

    const repo = getServerRepository();
    const allRequests = (await repo.list('availabilityRequests')) as AvailabilityRequest[];
    const filtered = allRequests.filter((r) => r.nurseId === targetNurseId);

    res.json({ status: 'ok', data: filtered });
  } catch (err: any) {
    console.error('[AvailabilityAPI] GET /nurse/:id error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/availability/request
 * Nurse submits an availability preference or requested day off (PENDING approval)
 */
availabilityRouter.post('/availability/request', requireAuth, async (req: Request, res: Response) => {
  try {
    const { nurseId: requestedNurseId, date, available, preferredDutyWindowId, note } = req.body;

    if (!date) {
      res.status(400).json({ error: 'BadRequest', message: 'Date is required.' });
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
        message: 'You are not authorized to submit availability requests for other nurses.',
      });
      return;
    }

    const repo = getServerRepository();
    const now = new Date().toISOString();

    const newRequest: AvailabilityRequest = {
      id: `avail-req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      nurseId: targetNurseId,
      date,
      available: available !== undefined ? Boolean(available) : true,
      preferredDutyWindowId: preferredDutyWindowId || undefined,
      note: note || undefined,
      status: 'PENDING',
      submittedByNurseId: userNurseId || targetNurseId,
      submittedAt: now,
    };

    const created = await repo.create('availabilityRequests', newRequest);

    res.json({
      status: 'ok',
      message: 'Availability request submitted successfully and is pending review.',
      data: created,
    });
  } catch (err: any) {
    console.error('[AvailabilityAPI] POST /request error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * DELETE /api/availability/request/:id
 * Nurse cancels their own pending request
 */
availabilityRouter.delete('/availability/request/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const existing = (await repo.get('availabilityRequests', id)) as AvailabilityRequest | null;

    if (!existing) {
      res.status(404).json({ error: 'NotFound', message: 'Availability request not found.' });
      return;
    }

    const userNurseId = await resolveUserNurseId(req);
    const isMasterAdmin = req.user?.role === 'OWNER' || req.user?.email === MASTER_ADMIN_EMAIL;
    const isManager = Boolean(req.user?.isManager);

    if (!isMasterAdmin && !isManager && existing.nurseId !== userNurseId) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You cannot cancel availability requests submitted for other nurses.',
      });
      return;
    }

    await repo.remove('availabilityRequests', id);
    res.json({ status: 'ok', message: 'Availability request cancelled successfully.' });
  } catch (err: any) {
    console.error('[AvailabilityAPI] DELETE /request/:id error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
