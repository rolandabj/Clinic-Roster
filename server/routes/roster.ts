/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Roster Publishing, Version Management, Shift Swaps & Acknowledgments API
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getServerRepository } from '../db/index';
import { requirePlanner } from '../middleware/auth';
import {
  ScheduleVersion,
  Acknowledgment,
  SwapRequest,
  Assignment,
  ClinicProfile,
} from '../../src/types';
import { computeScheduleDiff } from '../../src/services/history/diffEngine';
import { WebhookService } from '../services/notifications/webhookService';

export const rosterRouter = Router();

// ==========================================
// Publishing & Snapshot Versioning
// ==========================================

/**
 * POST /api/schedules/:id/publish
 * Creates an immutable ScheduleVersion record with full JSON snapshot,
 * calculates shift diffs against previous published version, increments version number,
 * generates digital acknowledgment tokens, and marks the roster published.
 * Guarded: Requires Planner or Owner role
 */
rosterRouter.post('/schedules/:id/publish', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { note = 'Published roster version' } = req.body;
    const repo = getServerRepository();

    const schedule = await repo.get('schedules', id);
    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: `Schedule ${id} not found.` });
      return;
    }

    // Parallel fetch of current snapshot components
    const [
      allAssignments,
      allLeaves,
      allLocks,
      rules,
      nurses,
      dutyWindows,
      doctors,
      roles,
      specialties,
      allVersions,
    ] = await Promise.all([
      repo.list('assignments'),
      repo.list('leaveEntries'),
      repo.list('locks'),
      repo.list('rules'),
      repo.list('nurses'),
      repo.list('dutyWindows'),
      repo.list('doctors'),
      repo.list('clinicalRoles'),
      repo.list('specialties'),
      repo.list('versions'),
    ]);

    const scheduleAssignments = allAssignments.filter((a) => a.scheduleId === id);
    const scheduleLeaves = allLeaves.filter(
      (le) =>
        le.approved &&
        !(le.endDate < schedule.startDate || le.startDate > schedule.endDate)
    );
    const scheduleLocks = allLocks.filter(
      (l) =>
        (l as any).scheduleId === id ||
        (l.date >= schedule.startDate && l.date <= schedule.endDate)
    );

    // Filter existing versions for this schedule
    const scheduleVersions = allVersions
      .filter((v) => v.scheduleId === id)
      .sort((a, b) => a.number - b.number);

    const nextNumber =
      scheduleVersions.length > 0
        ? Math.max(...scheduleVersions.map((v) => v.number)) + 1
        : 1;

    // Find previous published version for shift diffing
    const previousPublishedVersion = [...scheduleVersions]
      .reverse()
      .find((v) => v.isPublished);

    let diff = null;
    if (previousPublishedVersion) {
      diff = computeScheduleDiff(
        previousPublishedVersion.snapshot.assignments,
        scheduleAssignments,
        nurses,
        dutyWindows,
        doctors,
        roles,
        specialties,
        `Version ${previousPublishedVersion.number}`,
        `Version ${nextNumber}`,
        previousPublishedVersion.number,
        nextNumber
      );
    }

    const now = new Date().toISOString();
    const versionId = `ver-${id}-v${nextNumber}-${uuidv4().slice(0, 6)}`;

    // Create immutable ScheduleVersion snapshot
    const newVersion: ScheduleVersion = {
      id: versionId,
      scheduleId: id,
      number: nextNumber,
      timestamp: now,
      author: req.user?.name || 'Authorized Planner',
      note,
      snapshot: {
        schedule: {
          ...schedule,
          status: 'PUBLISHED',
          activeVersionNumber: nextNumber,
          updatedAt: now,
        },
        assignments: JSON.parse(JSON.stringify(scheduleAssignments)),
        leaveEntries: JSON.parse(JSON.stringify(scheduleLeaves)),
        locks: JSON.parse(JSON.stringify(scheduleLocks)),
        rulesSnapshot: JSON.parse(JSON.stringify(rules)),
      },
      isPublished: true,
      publishedAt: now,
    };

    await repo.create('versions', newVersion);

    // Update active schedule status and version
    await repo.update('schedules', id, {
      status: 'PUBLISHED',
      activeVersionNumber: nextNumber,
      updatedAt: now,
    });

    // Create digital acknowledgment records for all active nurses
    const activeNurses = nurses.filter((n) => n.active);
    const acksToCreate: Acknowledgment[] = activeNurses.map((nurse) => ({
      id: `ack-${id}-${nurse.id}-${uuidv4().slice(0, 6)}`,
      scheduleId: id,
      nurseId: nurse.id,
      versionId: newVersion.id,
      token: `ack_${uuidv4().replace(/-/g, '')}`,
      sentAt: now,
    }));

    if (acksToCreate.length > 0) {
      await repo.bulkUpsert('acknowledgments', acksToCreate);
    }

    // Record audit event
    await repo.create('audit', {
      actor: req.user?.name || 'Authorized Planner',
      action: 'PUBLISH',
      entity: 'Schedule',
      entityId: id,
      note: `Published version ${nextNumber} with ${scheduleAssignments.length} shifts. ${acksToCreate.length} acknowledgment tokens issued.`,
      timestamp: now,
    });

    // Trigger ChatOps Webhooks
    const clinics = await repo.list('clinics');
    const clinicName = (clinics[0] as ClinicProfile)?.name || 'American Hospital Nad Al Sheba OutPatient clinic';
    WebhookService.notifyRosterPublished(
      {
        clinicName,
        scheduleId: id,
        scheduleName: schedule.name,
        versionNumber: nextNumber,
        period: `${schedule.startDate} to ${schedule.endDate}`,
        totalNursesAssigned: activeNurses.length,
        publishedBy: req.user?.name || 'Authorized Planner',
      },
      repo
    ).catch((err) => console.warn('[Webhook] Failed to dispatch roster published alert:', err));

    res.status(201).json({
      status: 'ok',
      data: {
        version: newVersion,
        diff,
        acknowledgmentsGenerated: acksToCreate.length,
      },
    });
  } catch (err: any) {
    console.error(`[RosterAPI] POST /api/schedules/${req.params.id}/publish error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/schedules/:id/versions
 * Fetch version history for a schedule
 */
rosterRouter.get('/schedules/:id/versions', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const allVersions = await repo.list('versions');
    const scheduleVersions = allVersions
      .filter((v) => v.scheduleId === id)
      .sort((a, b) => b.number - a.number);

    res.json({
      status: 'ok',
      count: scheduleVersions.length,
      data: scheduleVersions,
    });
  } catch (err: any) {
    console.error(`[RosterAPI] GET /api/schedules/${req.params.id}/versions error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * GET /api/schedules/:id/versions/:versionId
 * Fetch a frozen snapshot for comparison or inspection
 */
rosterRouter.get('/schedules/:id/versions/:versionId', async (req: Request, res: Response) => {
  try {
    const { id, versionId } = req.params;
    const repo = getServerRepository();
    const version = await repo.get('versions', versionId);

    if (!version || version.scheduleId !== id) {
      res.status(404).json({ error: 'NotFound', message: `Version ${versionId} for schedule ${id} not found.` });
      return;
    }

    res.json({ status: 'ok', data: version });
  } catch (err: any) {
    console.error(`[RosterAPI] GET /api/schedules/${req.params.id}/versions/${req.params.versionId} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/schedules/:id/versions/:versionId/rollback
 * Roll back active assignments to the target snapshot
 * Guarded: Requires Planner or Owner role
 */
rosterRouter.post('/schedules/:id/versions/:versionId/rollback', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id, versionId } = req.params;
    const repo = getServerRepository();

    const [schedule, version] = await Promise.all([
      repo.get('schedules', id),
      repo.get('versions', versionId),
    ]);

    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: `Schedule ${id} not found.` });
      return;
    }
    if (!version || version.scheduleId !== id) {
      res.status(404).json({ error: 'NotFound', message: `Version ${versionId} not found.` });
      return;
    }

    const snapshotAssignments: Assignment[] = version.snapshot?.assignments || [];

    // Atomically replace current assignments with snapshot
    const currentAssignments = await repo.list('assignments');
    const oldIds = currentAssignments.filter((a) => a.scheduleId === id).map((a) => a.id);

    if (oldIds.length > 0) {
      await repo.bulkRemove('assignments', oldIds);
    }
    if (snapshotAssignments.length > 0) {
      await repo.bulkUpsert('assignments', snapshotAssignments);
    }

    const now = new Date().toISOString();
    await repo.update('schedules', id, {
      activeVersionNumber: version.number,
      updatedAt: now,
    });

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized Planner',
      action: 'RESTORE',
      entity: 'Schedule',
      entityId: id,
      note: `Rolled back active schedule to version ${version.number} (${snapshotAssignments.length} shifts restored).`,
      timestamp: now,
    });

    res.json({
      status: 'ok',
      message: `Schedule successfully rolled back to version ${version.number}.`,
      versionNumber: version.number,
      assignmentsCount: snapshotAssignments.length,
      data: snapshotAssignments,
    });
  } catch (err: any) {
    console.error(`[RosterAPI] POST /api/schedules/${req.params.id}/versions/${req.params.versionId}/rollback error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Peer Shift Swaps Endpoint
// ==========================================

/**
 * POST /api/roster/swap
 * Validates and executes a peer two-way nurse shift swap
 * Checks leave conflicts, locks, updates assignments, and writes an audit log
 */
rosterRouter.post('/roster/swap', async (req: Request, res: Response) => {
  try {
    const {
      scheduleId,
      nurseAId,
      dateA,
      assignmentAId,
      nurseBId,
      dateB,
      assignmentBId,
      reason = 'Peer shift swap',
    } = req.body;

    if (!scheduleId || !nurseAId || !nurseBId || !dateA || !dateB) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'scheduleId, nurseAId, nurseBId, dateA, and dateB are required.',
      });
      return;
    }

    if (nurseAId === nurseBId) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Cannot swap shifts with the same nurse.',
      });
      return;
    }

    const repo = getServerRepository();

    // 1. Fetch relevant relational data
    const [allAssignments, allLeaves, allLocks, nurses] = await Promise.all([
      repo.list('assignments'),
      repo.list('leaveEntries'),
      repo.list('locks'),
      repo.list('nurses'),
    ]);

    const nurseA = nurses.find((n) => n.id === nurseAId);
    const nurseB = nurses.find((n) => n.id === nurseBId);
    if (!nurseA || !nurseB) {
      res.status(404).json({ error: 'NotFound', message: 'One or both nurses not found.' });
      return;
    }

    // 2. Identify target assignments
    const asgnA =
      (assignmentAId ? allAssignments.find((a) => a.id === assignmentAId) : null) ||
      allAssignments.find((a) => a.scheduleId === scheduleId && a.nurseId === nurseAId && a.date === dateA);

    const asgnB =
      (assignmentBId ? allAssignments.find((a) => a.id === assignmentBId) : null) ||
      allAssignments.find((a) => a.scheduleId === scheduleId && a.nurseId === nurseBId && a.date === dateB);

    if (!asgnA || !asgnB) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Valid shift assignments could not be found for both nurses on the specified dates.',
      });
      return;
    }

    // 3. Check for manual lock conflicts
    if (asgnA.locked || asgnB.locked) {
      res.status(400).json({
        error: 'Conflict',
        message: 'One or both of the selected shifts are pinned/locked against changes.',
      });
      return;
    }

    // 4. Validate leave conflicts on swapped dates
    const nurseAOnLeaveOnDateB = allLeaves.some(
      (l) => l.approved && l.nurseId === nurseAId && l.startDate <= dateB && l.endDate >= dateB
    );
    if (nurseAOnLeaveOnDateB) {
      res.status(400).json({
        error: 'Conflict',
        message: `${nurseA.fullName} has approved leave on ${dateB}. Swap rejected.`,
      });
      return;
    }

    const nurseBOnLeaveOnDateA = allLeaves.some(
      (l) => l.approved && l.nurseId === nurseBId && l.startDate <= dateA && l.endDate >= dateA
    );
    if (nurseBOnLeaveOnDateA) {
      res.status(400).json({
        error: 'Conflict',
        message: `${nurseB.fullName} has approved leave on ${dateA}. Swap rejected.`,
      });
      return;
    }

    // 5. Validate lock 'OFF' conflicts
    const nurseALockedOffOnDateB = allLocks.some(
      (l) => l.nurseId === nurseAId && l.date === dateB && l.mode === 'OFF'
    );
    if (nurseALockedOffOnDateB) {
      res.status(400).json({
        error: 'Conflict',
        message: `${nurseA.fullName} is pinned OFF on ${dateB}. Swap rejected.`,
      });
      return;
    }

    const nurseBLockedOffOnDateA = allLocks.some(
      (l) => l.nurseId === nurseBId && l.date === dateA && l.mode === 'OFF'
    );
    if (nurseBLockedOffOnDateA) {
      res.status(400).json({
        error: 'Conflict',
        message: `${nurseB.fullName} is pinned OFF on ${dateA}. Swap rejected.`,
      });
      return;
    }

    // 6. Execute atomic swap of assignments
    const nowIso = new Date().toISOString();
    const updatedA: Assignment = {
      ...asgnA,
      nurseId: nurseBId,
      source: 'MANUAL',
      note: `Swapped with ${nurseA.fullName} (${dateA} <-> ${dateB}): ${reason}`,
    };

    const updatedB: Assignment = {
      ...asgnB,
      nurseId: nurseAId,
      source: 'MANUAL',
      note: `Swapped with ${nurseB.fullName} (${dateA} <-> ${dateB}): ${reason}`,
    };

    await repo.update('assignments', updatedA.id, updatedA);
    await repo.update('assignments', updatedB.id, updatedB);

    // 7. Create SwapRequest record
    const swapRecord: SwapRequest = {
      id: uuidv4(),
      scheduleId,
      nurseAId,
      dateA: asgnA.date,
      assignmentAId: asgnA.id,
      dutyWindowAId: asgnA.dutyWindowId,
      nurseBId,
      dateB: asgnB.date,
      assignmentBId: asgnB.id,
      dutyWindowBId: asgnB.dutyWindowId,
      reason,
      status: 'APPROVED',
      requestedBy: req.user?.name || nurseA.fullName,
      createdAt: nowIso,
      resolvedAt: nowIso,
    };

    await repo.create('swaps', swapRecord);

    // 8. Record audit event
    await repo.create('audit', {
      actor: req.user?.name || nurseA.fullName,
      action: 'SWAP',
      entity: 'Assignment',
      entityId: `${asgnA.id}<->${asgnB.id}`,
      before: { nurseA: nurseAId, nurseB: nurseBId },
      after: { nurseA: nurseBId, nurseB: nurseAId },
      note: `Shift swap between ${nurseA.fullName} (${dateA}) and ${nurseB.fullName} (${dateB}): ${reason}`,
      timestamp: nowIso,
    });

    // Trigger ChatOps Webhooks
    const [schedules, dutyWindows, clinics] = await Promise.all([
      repo.list('schedules'),
      repo.list('dutyWindows'),
      repo.list('clinics'),
    ]);
    const schedule = schedules.find((s) => s.id === scheduleId);
    const scheduleName = schedule ? schedule.name : 'Outpatient Clinic Roster';
    const clinicName = (clinics[0] as ClinicProfile)?.name || 'American Hospital Nad Al Sheba OutPatient clinic';
    const dutyA = dutyWindows.find((d) => d.id === asgnA.dutyWindowId)?.name || 'Duty Window';
    const dutyB = dutyWindows.find((d) => d.id === asgnB.dutyWindowId)?.name || 'Duty Window';

    WebhookService.notifyShiftSwapFinalized(
      {
        clinicName,
        scheduleName,
        nurseAName: nurseA.fullName,
        dateA: asgnA.date,
        dutyA,
        nurseBName: nurseB.fullName,
        dateB: asgnB.date,
        dutyB,
        reason,
        approvedBy: req.user?.name || nurseA.fullName,
      },
      repo
    ).catch((err) => console.warn('[Webhook] Failed to dispatch shift swap alert:', err));

    res.json({
      status: 'ok',
      message: `Shift swap completed between ${nurseA.fullName} and ${nurseB.fullName}.`,
      data: {
        swap: swapRecord,
        updatedAssignments: [updatedA, updatedB],
      },
    });
  } catch (err: any) {
    console.error('[RosterAPI] POST /api/roster/swap error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Digital Acknowledgment Endpoint
// ==========================================

/**
 * POST /api/roster/acknowledge
 * Validates acknowledgment token, marks the receipt as acknowledged, records UTC timestamp,
 * and updates audit records.
 */
rosterRouter.post('/roster/acknowledge', async (req: Request, res: Response) => {
  try {
    const { token, scheduleId, nurseId } = req.body;

    if (!token && (!scheduleId || !nurseId)) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Either acknowledgment token or (scheduleId and nurseId) is required.',
      });
      return;
    }

    const repo = getServerRepository();
    const allAcks = await repo.list('acknowledgments');

    let matched: Acknowledgment | undefined;
    if (token) {
      matched = allAcks.find((a) => a.token === token);
    } else {
      matched = allAcks.find(
        (a) => a.scheduleId === scheduleId && a.nurseId === nurseId
      );
    }

    if (!matched) {
      res.status(404).json({
        error: 'NotFound',
        message: 'Acknowledgment record not found or token is invalid.',
      });
      return;
    }

    if (matched.ackAt) {
      res.json({
        status: 'ok',
        message: 'Roster was already acknowledged.',
        data: matched,
      });
      return;
    }

    const now = new Date().toISOString();
    const updatedAck = await repo.update('acknowledgments', matched.id, {
      ackAt: now,
    });

    // Record audit event
    await repo.create('audit', {
      actor: req.user?.name || `Nurse ${matched.nurseId}`,
      action: 'UPDATE',
      entity: 'Acknowledgment',
      entityId: matched.id,
      note: `Nurse ${matched.nurseId} digitally acknowledged schedule ${matched.scheduleId} (version ${matched.versionId}).`,
      timestamp: now,
    });

    res.json({
      status: 'ok',
      message: 'Roster acknowledged successfully.',
      data: updatedAck,
    });
  } catch (err: any) {
    console.error('[RosterAPI] POST /api/roster/acknowledge error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});
