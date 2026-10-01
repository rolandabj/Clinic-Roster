/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server-Side Schedule Validator Service
 * Audits shift assignments against all clinical constraints (H1-H6, S1-S7),
 * doctor-nurse ratios, rest intervals, leave clashes, and hourly coverage.
 */

import { IRepository } from '../../../src/services/repository/IRepository';
import {
  ScheduleValidator,
  type ValidationReport,
} from '../../../src/services/validation/ScheduleValidator';

export { ScheduleValidator };
export type { ValidationReport };

/**
 * Validates a schedule by ID by pulling all required relational context from the repository
 */
export async function validateScheduleById(
  scheduleId: string,
  repo: IRepository
): Promise<ValidationReport> {
  const schedule = await repo.get('schedules', scheduleId);
  if (!schedule) {
    throw new Error(`Schedule ${scheduleId} not found`);
  }

  // Load all relevant entities in parallel
  const [
    allAssignments,
    nurses,
    seniorityLevels,
    dutyWindows,
    allSessions,
    leaveEntries,
    locks,
    roles,
    rules,
  ] = await Promise.all([
    repo.list('assignments'),
    repo.list('nurses'),
    repo.list('seniorityLevels'),
    repo.list('dutyWindows'),
    repo.list('doctorSessions'),
    repo.list('leaveEntries'),
    repo.list('locks'),
    repo.list('clinicalRoles'),
    repo.list('rules'),
  ]);

  // Filter assignments for this specific schedule
  const scheduleAssignments = allAssignments.filter((a) => a.scheduleId === scheduleId);

  // Filter doctor sessions that fall within the schedule's date window
  const scheduleSessions = allSessions.filter(
    (s) => s.date >= schedule.startDate && s.date <= schedule.endDate
  );

  // Filter locks and leave entries that fall within the schedule date range
  const scheduleLocks = locks.filter(
    (l) => l.date >= schedule.startDate && l.date <= schedule.endDate
  );
  const scheduleLeaves = leaveEntries.filter(
    (le) => le.startDate <= schedule.endDate && le.endDate >= schedule.startDate
  );

  // Run the comprehensive validation audit
  const report = ScheduleValidator.validate(
    schedule,
    scheduleAssignments,
    nurses,
    seniorityLevels,
    dutyWindows,
    scheduleSessions,
    scheduleLeaves,
    scheduleLocks,
    roles,
    rules
  );

  return report;
}
