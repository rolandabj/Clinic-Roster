/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Generation Pre-flight Diagnostic Service
 * Analyzes roster readiness, leaves, manual pins, and doctor session demands.
 */

import { IRepository } from '../../../src/services/repository/IRepository';
import { PreflightReport } from './types';
import { IsoDateString } from '../../../src/types';
import { generateDoctorSessionsForDateRange } from '../../../src/services/schedule/doctorScheduleService';
import { getInclusiveDays } from '../../../src/services/periods/workingHoursPeriodService';

export class GenerationPreflightService {
  public static async evaluate(
    scheduleId: string,
    repo: IRepository
  ): Promise<PreflightReport> {
    const schedule = await repo.get('schedules', scheduleId);
    if (!schedule) {
      throw new Error(`Schedule ${scheduleId} not found`);
    }

    const [
      allNurses,
      allDoctors,
      allSessions,
      allLocks,
      allLeaves,
      allRoles,
      allRules,
    ] = await Promise.all([
      repo.list('nurses'),
      repo.list('doctors'),
      repo.list('doctorSessions'),
      repo.list('locks'),
      repo.list('leaveEntries'),
      repo.list('clinicalRoles'),
      repo.list('rules'),
    ]);

    const activeNurses = allNurses.filter((n) => n.active);
    const activeDoctors = allDoctors.filter((d) => d.active);

    const start = new Date(schedule.startDate);
    const end = new Date(schedule.endDate);
    const totalDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const totalBlocks = Math.ceil(totalDays / (schedule.blockWeeks * 7));

    const datesList: IsoDateString[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      datesList.push(d.toISOString().split('T')[0]);
    }

    // Filter relevant records within schedule window
    let scheduleSessions = allSessions.filter(
      (s) => !s.cancelled && s.date >= schedule.startDate && s.date <= schedule.endDate
    );

    // F-9: include active doctors' recurring weekly-pattern sessions that are not yet
    // materialized as stored records — the engine's own preflight does this, and the
    // generation pass will face this demand once sessions are populated. Without it,
    // the server preflight under-reported doctor demand.
    if (activeDoctors.length > 0 && schedule.startDate && schedule.endDate) {
      const recurringSessions = generateDoctorSessionsForDateRange(
        schedule.startDate,
        schedule.endDate,
        activeDoctors
      );
      const existingKeySet = new Set(
        scheduleSessions.map((s) => `${s.doctorId}_${s.date}_${s.startTime}`)
      );
      const missingRecurring = recurringSessions.filter(
        (s) => !existingKeySet.has(`${s.doctorId}_${s.date}_${s.startTime}`)
      );
      if (missingRecurring.length > 0) {
        scheduleSessions = [...scheduleSessions, ...missingRecurring];
      }
    }

    const scheduleLocks = allLocks.filter(
      (l) =>
        (l as any).scheduleId === scheduleId ||
        (l.date >= schedule.startDate && l.date <= schedule.endDate)
    );

    const approvedLeaves = allLeaves.filter(
      (le) =>
        le.approved &&
        !(le.endDate < schedule.startDate || le.startDate > schedule.endDate)
    );

    // Nurse Clinic Rule lookup
    const ncRule = allRules.find(
      (r) => r.templateKey === 'DEDICATED_NURSE_CLINIC' || r.id === 'rule-nurse-clinic'
    );
    const ncEnabled = ncRule ? ncRule.enabled : true;
    const ncQuota = ncEnabled ? (ncRule?.value ?? 1) : 0;
    const nurseClinicSlotsCount = totalDays * ncQuota;

    // Phlebotomy default quota
    const phlRole = allRoles.find((r) => r.acronym === 'PHL');
    const phlebotomySlotsCount = totalDays * (phlRole?.defaultDailyQuota || 1);

    // F-9: daily clinical-role demand the engine will actually schedule — ALL non-NC
    // roles' daily quotas (the engine creates slots per role), not just PHL.
    const isNcRole = (r: (typeof allRoles)[number]) =>
      r.id === 'role-nurse-clinic' || r.acronym === 'NC' || r.name.toLowerCase().includes('nurse clinic');
    const dailyRoleQuota = allRoles
      .filter((r) => !isNcRole(r))
      .reduce((sum, r) => sum + (r.defaultDailyQuota || 1), 0);

    // Evening doctor sessions
    const eveningSessions = scheduleSessions.filter((s) => s.endTime >= '19:00');
    let eveningCoverageAlert: string | undefined;
    if (eveningSessions.length > 0) {
      eveningCoverageAlert = `Detected ${eveningSessions.length} evening doctor sessions ending up to 21:00. Prioritizing Full Day (D) and Late (L) duties.`;
    }

    let staffingScaleWarning: string | undefined;
    if (activeNurses.length < activeDoctors.length) {
      staffingScaleWarning = `Clinic has ${activeNurses.length} active nurses vs ${activeDoctors.length} clinic doctors — expect pairing float on peak days.`;
    }

    // Daily Demand vs Supply Analysis
    const warnings: string[] = [];
    if (staffingScaleWarning) warnings.push(staffingScaleWarning);
    if (eveningCoverageAlert) warnings.push(eveningCoverageAlert);

    let deficitDaysCount = 0;
    const doctorCoverageDemand = datesList.map((date) => {
      const sessionsOnDate = scheduleSessions.filter((s) => s.date === date);
      // F-9: the engine fills one nurse per doctor session PLUS the clinical-role
      // quotas (e.g. phlebotomy) PLUS the dedicated nurse-clinic quota every day —
      // counting sessions alone understated demand and could report OPTIMAL
      // readiness for a generation that ends with unmet slots.
      const requiredNurses = sessionsOnDate.length + dailyRoleQuota + ncQuota;

      // Available nurses on this date (not on approved leave and not pinned OFF)
      const nursesOnLeave = new Set(
        approvedLeaves
          .filter((le) => le.startDate <= date && le.endDate >= date)
          .map((le) => le.nurseId)
      );

      const nursesPinnedOff = new Set(
        scheduleLocks
          .filter((l) => l.date === date && l.mode === 'OFF')
          .map((l) => l.nurseId)
      );

      const availableNurses = activeNurses.filter(
        (n) => !nursesOnLeave.has(n.id) && !nursesPinnedOff.has(n.id)
      ).length;

      const surplusOrDeficit = availableNurses - requiredNurses;
      if (surplusOrDeficit < 0) {
        deficitDaysCount++;
        warnings.push(`Staffing deficit on ${date}: ${requiredNurses} doctor sessions vs ${availableNurses} available nurses.`);
      }

      return {
        date,
        requiredNurses,
        availableNurses,
        surplusOrDeficit,
      };
    });

    // Calculate readiness score
    let score = 100;
    score -= Math.min(40, deficitDaysCount * 10);
    if (activeNurses.length < activeDoctors.length) score -= 15;
    if (eveningSessions.length > 0) score -= 5;
    if (scheduleLocks.length > activeNurses.length * 5) score -= 10;
    score = Math.max(10, Math.min(100, score));

    let readinessStatus: 'OPTIMAL' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL' = 'OPTIMAL';
    if (score < 50) readinessStatus = 'CRITICAL';
    else if (score < 75) readinessStatus = 'WARNING';
    else if (score < 90) readinessStatus = 'ACCEPTABLE';

    return {
      scheduleId,
      scheduleName: schedule.name,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      readinessScore: score,
      readinessStatus,
      totalDays,
      totalBlocks,
      activeNursesCount: activeNurses.length,
      activeDoctorsCount: activeDoctors.length,
      doctorSessionsCount: scheduleSessions.length,
      phlebotomySlotsCount,
      nurseClinicSlotsCount,
      existingLocksCount: scheduleLocks.length,
      // F-19: count leave DAYS inside the schedule window, not leave entries — a
      // single 14-day leave previously reported as 1.
      existingLeaveDaysCount: approvedLeaves.reduce((acc, le) => {
        const overlapStart = le.startDate > schedule.startDate ? le.startDate : schedule.startDate;
        const overlapEnd = le.endDate < schedule.endDate ? le.endDate : schedule.endDate;
        return acc + Math.max(0, getInclusiveDays(overlapStart, overlapEnd));
      }, 0),
      estimatedTotalAssignments:
        scheduleSessions.length + totalDays * dailyRoleQuota + nurseClinicSlotsCount,
      eveningCoverageAlert,
      staffingScaleWarning,
      warnings,
      doctorCoverageDemand,
    };
  }
}
