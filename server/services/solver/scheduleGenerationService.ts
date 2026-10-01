/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Schedule Generation Solver Service
 * Executes deterministic constraint-satisfaction schedule generation,
 * enforces manual locks, handles partial regeneration, and syncs assignments.
 */

import { IRepository } from '../../../src/services/repository/IRepository';
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import { RegenerateMode } from '../../../src/services/engine/types';
import { validateScheduleById } from '../validation/scheduleValidator';
import { SolverOptions, SolverResult, SolverMode } from './types';
import { Assignment, LockEntry } from '../../../src/types';

export class ScheduleGenerationService {
  public static async execute(
    scheduleId: string,
    options: SolverOptions = {},
    repo: IRepository,
    actorName: string = 'Authorized Planner'
  ): Promise<SolverResult> {
    const startTimeMs = Date.now();

    const schedule = await repo.get('schedules', scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    const mode: SolverMode = options.mode || 'GENERATE_ALL';
    const preserveManualLocks = options.preserveManualLocks ?? true;

    // Load relational context in parallel
    const [
      allAssignments,
      nurses,
      seniorityLevels,
      dutyWindows,
      roles,
      specialties,
      allSessions,
      allLocks,
      allLeaves,
      rules,
      workingHoursPeriods,
      doctors,
    ] = await Promise.all([
      repo.list('assignments'),
      repo.list('nurses'),
      repo.list('seniorityLevels'),
      repo.list('dutyWindows'),
      repo.list('clinicalRoles'),
      repo.list('specialties'),
      repo.list('doctorSessions'),
      repo.list('locks'),
      repo.list('leaveEntries'),
      repo.list('rules'),
      repo.list('workingHoursPeriods'),
      repo.list('doctors'),
    ]);

    const scheduleAssignments = allAssignments.filter((a) => a.scheduleId === scheduleId);

    // F-14: trailing window of assignments from BEFORE this schedule starts (any
    // schedule), so consecutive-day/late-duty streaks and day-1 rest checks can see
    // across the period boundary.
    const [hy, hm, hd] = schedule.startDate.split('-').map(Number);
    const historyWindowStart = new Date(Date.UTC(hy, hm - 1, hd - 30)).toISOString().split('T')[0];
    const priorPeriodAssignments = allAssignments.filter(
      (a) => a.date < schedule.startDate && a.date >= historyWindowStart
    );
    const scheduleSessions = allSessions.filter(
      (s) => !s.cancelled && s.date >= schedule.startDate && s.date <= schedule.endDate
    );

    // Filter locks: if preserveManualLocks is false, exclude them
    let scheduleLocks: LockEntry[] = [];
    if (preserveManualLocks) {
      // F-18: LockEntry has no scheduleId field — locks are date-scoped by design, so
      // overlapping schedules share the locks in their window. The old
      // `(l as any).scheduleId === scheduleId` clause was always false and only hid
      // that fact from the compiler.
      scheduleLocks = allLocks.filter(
        (l) => l.date >= schedule.startDate && l.date <= schedule.endDate
      );
    }

    const scheduleLeaves = allLeaves.filter(
      (le) =>
        le.approved &&
        !(le.endDate < schedule.startDate || le.startDate > schedule.endDate)
    );

    // Map solver modes to engine regenerate mode
    let engineMode: RegenerateMode = 'GENERATE_ALL';
    let workingExistingAssignments = [...scheduleAssignments];

    if (mode === 'FILL_UNASSIGNED') {
      engineMode = 'EMPTY_ONLY';
    } else if (mode === 'REBALANCE') {
      engineMode = 'REBALANCE';
    } else if (mode === 'CLEAR_GENERATED') {
      engineMode = 'CLEAR_GENERATED';
    } else if (mode === 'REGENERATE_BLOCK') {
      // F-21: validate the block bounds explicitly. The old guard silently degraded a
      // missing blockIndex into a FULL-ROSTER pass, and a missing/zero blockWeeks
      // produced a NaN epoch that threw an opaque RangeError from toISOString().
      if (
        options.blockIndex === undefined ||
        options.blockIndex === null ||
        !Number.isInteger(options.blockIndex) ||
        options.blockIndex < 0
      ) {
        throw new Error(
          `REGENERATE_BLOCK requires a non-negative integer blockIndex option (got ${options.blockIndex}).`
        );
      }
      if (!Number.isFinite(schedule.blockWeeks) || schedule.blockWeeks < 1) {
        throw new Error(
          `REGENERATE_BLOCK requires schedule.blockWeeks >= 1 (schedule ${schedule.id} has ${schedule.blockWeeks}).`
        );
      }
      // Calculate block start and end dates
      const blockDays = schedule.blockWeeks * 7;
      const blockStartMs =
        new Date(schedule.startDate).getTime() + options.blockIndex * blockDays * 86400000;
      const blockEndMs = blockStartMs + (blockDays - 1) * 86400000;
      const blockStart = new Date(blockStartMs).toISOString().split('T')[0];
      const blockEnd = new Date(blockEndMs).toISOString().split('T')[0];

      // Keep assignments outside this block
      workingExistingAssignments = scheduleAssignments.filter((a) => {
        if (a.date < blockStart || a.date > blockEnd) return true;
        // inside block: preserve if locked or manual
        return a.locked || a.source === 'LOCK' || a.source === 'MANUAL';
      });
      engineMode = 'EMPTY_ONLY';
    } else if (mode === 'REGENERATE_DATE_RANGE' && options.startDate && options.endDate) {
      const rangeStart = options.startDate;
      const rangeEnd = options.endDate;

      workingExistingAssignments = scheduleAssignments.filter((a) => {
        if (a.date < rangeStart || a.date > rangeEnd) return true;
        return a.locked || a.source === 'LOCK' || a.source === 'MANUAL';
      });
      engineMode = 'EMPTY_ONLY';
    }

    // Run solver engine.
    // workingHoursPeriods and doctors MUST be forwarded (F-3): omitting them made the
    // server path ignore dedicated-period hour targets and weakened H8 doctor-specialty
    // allocation, producing different rosters than the client path for identical data.
    const engineResult = await SchedulingEngine.generate(
      schedule,
      engineMode,
      workingExistingAssignments,
      nurses,
      seniorityLevels,
      dutyWindows,
      roles,
      specialties,
      scheduleSessions,
      scheduleLocks,
      scheduleLeaves,
      rules,
      undefined, // onProgress not needed server-side
      workingHoursPeriods,
      doctors,
      priorPeriodAssignments // F-14: cross-boundary streak & rest context
    );

    // Persist results (F-15): upsert the new roster FIRST, then remove only the
    // stale ids no longer present. The legacy delete-ALL-then-insert sequence left a
    // window where a crash (or a concurrent reader) saw an EMPTY schedule; with this
    // ordering a crash between the two writes leaves at worst a few stale extras,
    // which the next generation pass cleans up — never data loss.
    if (engineResult.assignments.length > 0) {
      await repo.bulkUpsert('assignments', engineResult.assignments);
    }
    const resultIds = new Set(engineResult.assignments.map((a) => a.id));
    const staleIds = scheduleAssignments.filter((a) => !resultIds.has(a.id)).map((a) => a.id);
    if (staleIds.length > 0) {
      await repo.bulkRemove('assignments', staleIds);
    }

    // Update schedule timestamp
    const now = new Date().toISOString();
    await repo.update('schedules', scheduleId, { updatedAt: now });

    // Validate the resulting schedule
    const validationReport = await validateScheduleById(scheduleId, repo);

    // Audit log
    await repo.create('audit', {
      actor: actorName,
      action: mode === 'REBALANCE' ? 'REBALANCE' : 'UPDATE',
      entity: 'Schedule',
      entityId: scheduleId,
      note: `Generated schedule via ${mode}: ${engineResult.createdCount} shifts created, ${engineResult.preservedLocksCount} locks preserved.`,
      timestamp: now,
    });

    const durationMs = Date.now() - startTimeMs;

    return {
      scheduleId,
      mode,
      assignmentsCount: engineResult.assignments.length,
      createdCount: engineResult.createdCount,
      preservedLocksCount: engineResult.preservedLocksCount,
      preservedManualCount: engineResult.preservedManualCount,
      unmetSlotsCount: engineResult.unmetSlotsCount,
      generationDurationMs: durationMs,
      validation: {
        errorCount: validationReport.errorCount,
        warnCount: validationReport.warnCount,
        infoCount: validationReport.infoCount,
      },
      summary: `Successfully generated ${engineResult.assignments.length} assignments in ${durationMs}ms with mode ${mode}.`,
      assignments: engineResult.assignments,
    };
  }
}
