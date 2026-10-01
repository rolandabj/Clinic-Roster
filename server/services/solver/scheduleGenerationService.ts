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
    ]);

    const scheduleAssignments = allAssignments.filter((a) => a.scheduleId === scheduleId);
    const scheduleSessions = allSessions.filter(
      (s) => !s.cancelled && s.date >= schedule.startDate && s.date <= schedule.endDate
    );

    // Filter locks: if preserveManualLocks is false, exclude them
    let scheduleLocks: LockEntry[] = [];
    if (preserveManualLocks) {
      scheduleLocks = allLocks.filter(
        (l) =>
          (l as any).scheduleId === scheduleId ||
          (l.date >= schedule.startDate && l.date <= schedule.endDate)
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
    } else if (mode === 'REGENERATE_BLOCK' && options.blockIndex !== undefined) {
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

    // Run solver engine
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
      rules
    );

    // Atomically persist results
    const oldIds = scheduleAssignments.map((a) => a.id);
    if (oldIds.length > 0) {
      await repo.bulkRemove('assignments', oldIds);
    }
    if (engineResult.assignments.length > 0) {
      await repo.bulkUpsert('assignments', engineResult.assignments);
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
