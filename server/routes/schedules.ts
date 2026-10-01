/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Schedule Management, Assignment Sync & Validation API
 * Manages schedule lifecycle, cascade deletion, atomic assignment sync,
 * manual cell locks, and clinical rule validation.
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getServerRepository } from '../db/index';
import { requirePlanner } from '../middleware/auth';
import { Schedule, Assignment, LockEntry, BlockWeeks, ClinicProfile } from '../../src/types';
import { validateScheduleById } from '../services/validation/scheduleValidator';
import { GenerationPreflightService } from '../services/solver/generationPreflightService';
import { ScheduleGenerationService } from '../services/solver/scheduleGenerationService';
import { SolverOptions } from '../services/solver/types';
import { WebhookService } from '../services/notifications/webhookService';

export const scheduleRouter = Router();

// ==========================================
// Schedules CRUD
// ==========================================

/**
 * GET /api/schedules
 * List all schedules, sorted newest to oldest
 */
scheduleRouter.get('/schedules', async (_req: Request, res: Response) => {
  try {
    const repo = getServerRepository();
    const schedules = await repo.list('schedules');
    schedules.sort((a, b) => b.startDate.localeCompare(a.startDate));
    res.json({ status: 'ok', data: schedules });
  } catch (err: any) {
    console.error('[ScheduleAPI] GET /api/schedules error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/schedules
 * Create a new roster schedule
 * Guarded: Requires Planner or Owner role
 */
scheduleRouter.post('/schedules', requirePlanner, async (req: Request, res: Response) => {
  try {
    const {
      name,
      startDate,
      endDate,
      blockWeeks = 2,
      hoursTargetFullTime = 160,
      createdFromTemplateId,
    } = req.body;

    if (!name || !startDate || !endDate) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Schedule name, startDate, and endDate are required.',
      });
      return;
    }

    const repo = getServerRepository();
    const id = req.body.id || `sched-${startDate.replace(/-/g, '').slice(0, 6)}-${uuidv4().slice(0, 6)}`;
    const now = new Date().toISOString();

    const newSchedule: Schedule = {
      id,
      name,
      startDate,
      endDate,
      blockWeeks: Number(blockWeeks) as BlockWeeks,
      hoursTargetFullTime: Number(hoursTargetFullTime) || 160,
      status: 'DRAFT',
      createdFromTemplateId,
      activeVersionNumber: 1,
      createdAt: now,
      updatedAt: now,
    };

    const created = await repo.create('schedules', newSchedule);

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized Planner',
      action: 'CREATE',
      entity: 'Schedule',
      entityId: created.id,
      after: created,
      note: `Created new schedule: ${name} (${startDate} to ${endDate})`,
      timestamp: now,
    });

    res.status(201).json({ status: 'ok', data: created });
  } catch (err: any) {
    console.error('[ScheduleAPI] POST /api/schedules error:', err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * DELETE /api/schedules/:id
 * Cascade-delete schedule and all related records (assignments, versions, locks, share links, acks, swaps)
 * Guarded: Requires Planner or Owner role
 */
scheduleRouter.delete('/schedules/:id', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const schedule = await repo.get('schedules', id);

    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: `Schedule ${id} not found.` });
      return;
    }

    // 1. Find and remove matching assignments
    const assignments = await repo.list('assignments');
    const assignmentIds = assignments.filter((a) => a.scheduleId === id).map((a) => a.id);
    if (assignmentIds.length > 0) {
      await repo.bulkRemove('assignments', assignmentIds);
    }

    // 2. Find and remove matching versions
    const versions = await repo.list('versions');
    const versionIds = versions.filter((v) => v.scheduleId === id).map((v) => v.id);
    if (versionIds.length > 0) {
      await repo.bulkRemove('versions', versionIds);
    }

    // 3. Find and remove matching locks (by scheduleId or date within schedule range)
    const locks = await repo.list('locks');
    const lockIds = locks
      .filter(
        (l) => (l as any).scheduleId === id || (l.date >= schedule.startDate && l.date <= schedule.endDate)
      )
      .map((l) => l.id);
    if (lockIds.length > 0) {
      await repo.bulkRemove('locks', lockIds);
    }

    // 4. Find and remove matching share links
    const shareLinks = await repo.list('shareLinks');
    const shareIds = shareLinks.filter((s) => s.scheduleId === id).map((s) => s.id);
    if (shareIds.length > 0) {
      await repo.bulkRemove('shareLinks', shareIds);
    }

    // 5. Find and remove matching invitations
    const invitations = await repo.list('invitations');
    const invitationIds = invitations.filter((inv) => inv.scheduleId === id).map((inv) => inv.id);
    if (invitationIds.length > 0) {
      await repo.bulkRemove('invitations', invitationIds);
    }

    // 6. Find and remove matching acknowledgments
    const acks = await repo.list('acknowledgments');
    const ackIds = acks.filter((a) => a.scheduleId === id).map((a) => a.id);
    if (ackIds.length > 0) {
      await repo.bulkRemove('acknowledgments', ackIds);
    }

    // 7. Find and remove matching swap requests
    const swaps = await repo.list('swaps');
    const swapIds = swaps.filter((s) => s.scheduleId === id).map((s) => s.id);
    if (swapIds.length > 0) {
      await repo.bulkRemove('swaps', swapIds);
    }

    // 8. Delete schedule document
    await repo.remove('schedules', id);

    // Record audit event
    await repo.create('audit', {
      actor: req.user?.name || 'Authorized Planner',
      action: 'DELETE',
      entity: 'Schedule',
      entityId: id,
      before: schedule,
      note: `Cascade deleted schedule ${schedule.name} with ${assignmentIds.length} assignments, ${versionIds.length} versions.`,
      timestamp: new Date().toISOString(),
    });

    res.json({
      status: 'ok',
      message: `Schedule ${id} and all related records deleted successfully.`,
      deletedCounts: {
        assignments: assignmentIds.length,
        versions: versionIds.length,
        locks: lockIds.length,
        shareLinks: shareIds.length,
        invitations: invitationIds.length,
        acknowledgments: ackIds.length,
        swaps: swapIds.length,
      },
    });
  } catch (err: any) {
    console.error(`[ScheduleAPI] DELETE /api/schedules/${req.params.id} error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Schedule Assignments Sync
// ==========================================

/**
 * GET /api/schedules/:id/assignments
 * Load all shift assignments for the schedule
 */
scheduleRouter.get('/schedules/:id/assignments', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const allAssignments = await repo.list('assignments');
    const scheduleAssignments = allAssignments.filter((a) => a.scheduleId === id);

    res.json({
      status: 'ok',
      count: scheduleAssignments.length,
      data: scheduleAssignments,
    });
  } catch (err: any) {
    console.error(`[ScheduleAPI] GET /api/schedules/${req.params.id}/assignments error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * PUT /api/schedules/:id/assignments
 * Atomic bulk update of shift assignments for the schedule
 * Guarded: Requires Planner or Owner role
 */
scheduleRouter.put('/schedules/:id/assignments', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const schedule = await repo.get('schedules', id);

    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: `Schedule ${id} not found.` });
      return;
    }

    const rawList = Array.isArray(req.body) ? req.body : req.body.assignments;
    if (!Array.isArray(rawList)) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Expected array of assignments or { assignments: Assignment[] } payload.',
      });
      return;
    }

    // 1. Fetch current assignments for this schedule
    const allExisting = await repo.list('assignments');
    const oldIds = allExisting.filter((a) => a.scheduleId === id).map((a) => a.id);

    // 2. Prepare new assignments, ensuring correct scheduleId and unique IDs
    const preparedAssignments: Assignment[] = rawList.map((item: any) => ({
      ...item,
      id: item.id || `asgn-${id}-${uuidv4().slice(0, 8)}`,
      scheduleId: id,
    }));

    // 3. Atomically remove stale assignments and upsert new assignments
    if (oldIds.length > 0) {
      await repo.bulkRemove('assignments', oldIds);
    }
    if (preparedAssignments.length > 0) {
      await repo.bulkUpsert('assignments', preparedAssignments);
    }

    // 4. Update schedule updatedAt timestamp
    const now = new Date().toISOString();
    await repo.update('schedules', id, { updatedAt: now });

    // 5. Record audit trail
    await repo.create('audit', {
      actor: req.user?.name || 'Authorized Planner',
      action: 'UPDATE',
      entity: 'Assignment',
      entityId: id,
      note: `Atomic bulk sync: updated ${preparedAssignments.length} shift assignments for ${schedule.name}`,
      timestamp: now,
    });

    res.json({
      status: 'ok',
      count: preparedAssignments.length,
      data: preparedAssignments,
    });
  } catch (err: any) {
    console.error(`[ScheduleAPI] PUT /api/schedules/${req.params.id}/assignments error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Manual Cell Locks
// ==========================================

/**
 * GET /api/schedules/:id/locks
 * Load all manual cell locks associated with this schedule
 */
scheduleRouter.get('/schedules/:id/locks', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const schedule = await repo.get('schedules', id);

    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: `Schedule ${id} not found.` });
      return;
    }

    const allLocks = await repo.list('locks');
    const scheduleLocks = allLocks.filter(
      (l) => (l as any).scheduleId === id || (l.date >= schedule.startDate && l.date <= schedule.endDate)
    );

    res.json({
      status: 'ok',
      count: scheduleLocks.length,
      data: scheduleLocks,
    });
  } catch (err: any) {
    console.error(`[ScheduleAPI] GET /api/schedules/${req.params.id}/locks error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * PUT /api/schedules/:id/locks
 * Atomic update of manual cell locks for this schedule
 * Guarded: Requires Planner or Owner role
 */
scheduleRouter.put('/schedules/:id/locks', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const schedule = await repo.get('schedules', id);

    if (!schedule) {
      res.status(404).json({ error: 'NotFound', message: `Schedule ${id} not found.` });
      return;
    }

    const rawList = Array.isArray(req.body) ? req.body : req.body.locks;
    if (!Array.isArray(rawList)) {
      res.status(400).json({
        error: 'BadRequest',
        message: 'Expected array of locks or { locks: LockEntry[] } payload.',
      });
      return;
    }

    // 1. Fetch current locks for this schedule date window
    const allLocks = await repo.list('locks');
    const oldIds = allLocks
      .filter(
        (l) => (l as any).scheduleId === id || (l.date >= schedule.startDate && l.date <= schedule.endDate)
      )
      .map((l) => l.id);

    // 2. Prepare new locks
    const preparedLocks: LockEntry[] = rawList.map((item: any) => ({
      ...item,
      id: item.id || `lock-${uuidv4().slice(0, 8)}`,
      createdAt: item.createdAt || new Date().toISOString(),
    }));

    // 3. Atomically replace
    if (oldIds.length > 0) {
      await repo.bulkRemove('locks', oldIds);
    }
    if (preparedLocks.length > 0) {
      await repo.bulkUpsert('locks', preparedLocks);
    }

    await repo.create('audit', {
      actor: req.user?.name || 'Authorized Planner',
      action: 'LOCK',
      entity: 'LockEntry',
      entityId: id,
      note: `Updated ${preparedLocks.length} manual cell locks for ${schedule.name}`,
      timestamp: new Date().toISOString(),
    });

    res.json({
      status: 'ok',
      count: preparedLocks.length,
      data: preparedLocks,
    });
  } catch (err: any) {
    console.error(`[ScheduleAPI] PUT /api/schedules/${req.params.id}/locks error:`, err);
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Schedule Validation
// ==========================================

/**
 * POST /api/schedules/:id/validate
 * Run comprehensive server-side clinical validation across hard/soft constraints
 */
scheduleRouter.post('/schedules/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const report = await validateScheduleById(id, repo);

    // If severe rule violations are detected, dispatch ChatOps webhook alert
    if (report && report.errorCount > 0) {
      const [clinics, schedules] = await Promise.all([
        repo.list('clinics'),
        repo.list('schedules'),
      ]);
      const clinicName = (clinics[0] as ClinicProfile)?.name || 'American Hospital Nad Al Sheba OutPatient clinic';
      const schedule = schedules.find((s) => s.id === id);
      const scheduleName = schedule ? schedule.name : `Schedule ${id}`;
      const criticalIssues = (report.findings || [])
        .filter((f: any) => f.severity === 'HARD' || f.category === 'HARD_RULE')
        .map((f: any) => f.description || f.message || f.id)
        .slice(0, 5);

      if (criticalIssues.length > 0) {
        WebhookService.notifySevereRuleViolation(
          {
            clinicName,
            scheduleName,
            violationCount: report.errorCount,
            criticalIssues,
            detectedBy: req.user?.name || 'Schedule Validation Engine',
          },
          repo
        ).catch((err) => console.warn('[Webhook] Failed to dispatch severe violation alert:', err));
      }
    }

    res.json({
      status: 'ok',
      data: report,
    });
  } catch (err: any) {
    console.error(`[ScheduleAPI] POST /api/schedules/${req.params.id}/validate error:`, err);
    if (err.message && err.message.includes('not found')) {
      res.status(404).json({ error: 'NotFound', message: err.message });
      return;
    }
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

// ==========================================
// Automated Solver & Generation Endpoints
// ==========================================

/**
 * POST /api/schedules/:id/preflight
 * Evaluates nurse availability, leave conflicts, doctor session demands, and generates readiness score/warnings
 */
scheduleRouter.post('/schedules/:id/preflight', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = getServerRepository();
    const preflight = await GenerationPreflightService.evaluate(id, repo);

    res.json({
      status: 'ok',
      data: preflight,
    });
  } catch (err: any) {
    console.error(`[ScheduleAPI] POST /api/schedules/${req.params.id}/preflight error:`, err);
    if (err.message && err.message.includes('not found')) {
      res.status(404).json({ error: 'NotFound', message: err.message });
      return;
    }
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

/**
 * POST /api/schedules/:id/generate
 * Runs automated roster solver, enforcing locks, doctor coverage, and fairness
 * Guarded: Requires Planner or Owner role
 */
scheduleRouter.post('/schedules/:id/generate', requirePlanner, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const options: SolverOptions = req.body || {};
    const repo = getServerRepository();

    const result = await ScheduleGenerationService.execute(
      id,
      options,
      repo,
      req.user?.name || 'Authorized Planner'
    );

    res.json({
      status: 'ok',
      data: result,
    });
  } catch (err: any) {
    console.error(`[ScheduleAPI] POST /api/schedules/${req.params.id}/generate error:`, err);
    if (err.message && err.message.includes('not found')) {
      res.status(404).json({ error: 'NotFound', message: err.message });
      return;
    }
    res.status(500).json({ error: 'ServerError', message: err.message });
  }
});

