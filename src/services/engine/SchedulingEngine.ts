/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Deterministic Scheduling Engine
 * Implements Phase 7 demand model, constraint presets (H1-H6, S1-S7),
 * and progressive chunked generation to never freeze the UI.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  Schedule,
  Assignment,
  LeaveEntry,
  LockEntry,
  DoctorSession,
  Doctor,
  Nurse,
  NursePreference,
  DutyWindow,
  ClinicalRole,
  Specialty,
  SeniorityLevel,
  Rule,
  IsoDateString,
  AssignmentSource,
  WorkingHoursPeriod,
} from '../../types';
import {
  GenerationProgressCallback,
  GenerationResult,
  RegenerateMode,
  GenerationPreflightSummary,
} from './types';
import { isExclusiveNurseClinic } from './nurseClinicUtils';
import { calculateWorkingHoursForDateRange } from '../periods/workingHoursPeriodService';
import { generateDoctorSessionsForDateRange } from '../schedule/doctorScheduleService';
import { calculateDutyDurationHours } from '../reports/hoursAccounting';

/**
 * Resiliently finds a rule by templateKey, id, or semantic keywords in its name.
 */
export function resolveRule(
  rules: Rule[],
  templateKey?: string,
  fallbackId?: string,
  semanticKeywords?: string[]
): Rule | undefined {
  if (!rules || rules.length === 0) return undefined;

  // 1. Direct templateKey match
  if (templateKey) {
    const byKey = rules.find((r) => r.templateKey === templateKey);
    if (byKey) return byKey;
  }

  // 2. Direct ID match
  if (fallbackId) {
    const byId = rules.find((r) => r.id === fallbackId);
    if (byId) return byId;
  }

  // 3. Semantic keywords match on rule name
  if (semanticKeywords && semanticKeywords.length > 0) {
    const lowerKeywords = semanticKeywords.map((k) => k.toLowerCase());
    const byName = rules.find((r) => {
      const lowerName = (r.name || '').toLowerCase();
      return lowerKeywords.some((keyword) => lowerName.includes(keyword));
    });
    if (byName) return byName;
  }

  return undefined;
}

interface InternalSlot {
  date: IsoDateString;
  kind: 'DOCTOR' | 'CLINICAL_ROLE' | 'SPECIALTY';
  targetId: string; // doctorId, clinicalRoleId, or specialtyId
  startTime: string; // 'HH:mm'
  endTime: string;   // 'HH:mm'
  priority: number;  // higher = fill first
}

interface NurseDayState {
  hasDuty: boolean;
  dutyWindowId?: string;
  assignmentKind?: 'DOCTOR' | 'SPECIALTY' | 'CLINICAL_ROLE';
  targetId?: string;
  source?: AssignmentSource;
  consecutiveWorkingDays: number;
  consecutiveLateEnds: number; // shifts ending at or after 21:00
  totalDutyHoursEarned: number;
  leaveHoursCredited?: number;
  initialLockedHours?: number;
  weekendsWorked: number;
  holidaysWorked: number;
  nurseClinicCount: number;
  lastDutyEndTime?: string; // 'YYYY-MM-DD HH:mm'
}

export class SchedulingEngine {
  /**
   * Produce pre-flight diagnostic summary before generation
   */
  public static computePreflight(
    schedule: Schedule,
    nurses: Nurse[],
    doctors: any[],
    sessions: DoctorSession[],
    locks: LockEntry[],
    leaveEntries: LeaveEntry[],
    roles: ClinicalRole[],
    rules: Rule[] = [],
    dutyWindows: DutyWindow[] = [],
    workingHoursPeriods: WorkingHoursPeriod[] = []
  ): GenerationPreflightSummary {
    if (!schedule || !schedule.startDate || !schedule.endDate) {
      return {
        scheduleName: schedule?.name || 'No Schedule',
        startDate: schedule?.startDate || '',
        endDate: schedule?.endDate || '',
        totalDays: 0,
        totalBlocks: 0,
        activeNursesCount: nurses?.length || 0,
        activeDoctorsCount: doctors?.length || 0,
        doctorSessionsCount: 0,
        phlebotomySlotsCount: 0,
        existingLocksCount: locks?.length || 0,
        existingLeaveDaysCount: leaveEntries?.length || 0,
        estimatedTotalAssignments: 0,
      };
    }

    const start = new Date(schedule.startDate);
    const end = new Date(schedule.endDate);
    const totalDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const totalBlocks = Math.ceil(totalDays / (schedule.blockWeeks * 7));

    // Resolve dedicated period and target working hours
    let detectedPeriodName: string | undefined = schedule.periodName;
    let targetWorkingHoursFullTime: number = 0;
    let isProratedPeriod: boolean | undefined = undefined;
    let hoursTargetDescription: string | undefined = undefined;

    if (workingHoursPeriods && workingHoursPeriods.length > 0 && schedule.startDate && schedule.endDate) {
      const calc = calculateWorkingHoursForDateRange(schedule.startDate, schedule.endDate, workingHoursPeriods);
      detectedPeriodName = calc.matchedPeriod?.name || (calc.isProrated ? `${calc.totalScheduleDays}d Prorated` : undefined);
      if (calc.targetHours > 0) {
        targetWorkingHoursFullTime = calc.targetHours;
      }
      isProratedPeriod = !calc.isExactMatch;
      hoursTargetDescription = calc.description;
    }

    if (!targetWorkingHoursFullTime || targetWorkingHoursFullTime <= 0) {
      if (schedule.hoursTargetFullTime && schedule.hoursTargetFullTime > 0) {
        targetWorkingHoursFullTime = schedule.hoursTargetFullTime;
      } else {
        targetWorkingHoursFullTime = Math.max(24, Math.round((totalDays * 40) / 7));
      }
    }

    let scheduleSessions = sessions.filter(
      (s) => !s.cancelled && s.date >= schedule.startDate && s.date <= schedule.endDate
    );

    // Ensure all active doctors' recurring weekly pattern sessions are included in preflight demand
    if (doctors && doctors.length > 0 && schedule.startDate && schedule.endDate) {
      const recurringSessions = generateDoctorSessionsForDateRange(
        schedule.startDate,
        schedule.endDate,
        doctors
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

    const scheduleLocks = locks.filter(
      (l) => l.date >= schedule.startDate && l.date <= schedule.endDate
    );

    const scheduleLeave = leaveEntries.filter(
      (le) =>
        le.approved &&
        !(le.endDate < schedule.startDate || le.startDate > schedule.endDate)
    );

    // Active duty priority breakdown
    const activeDuties = dutyWindows.filter((d) => d.active !== false);
    const priorityDutiesCount = activeDuties.filter((d) => Boolean(d.isPriority)).length;
    const standardDutiesCount = activeDuties.length - priorityDutiesCount;

    // Nurse Clinic Rule lookup
    const ncRule = resolveRule(rules, 'DEDICATED_NURSE_CLINIC', 'rule-nurse-clinic', [
      'dedicated nurse clinic',
      'nurse clinic coverage',
    ]);
    const ncEnabled = ncRule ? ncRule.enabled : true;
    const ncSeverity = ncRule?.severity || 'HARD';
    const ncQuota = ncEnabled ? (ncRule?.value ?? 1) : 0;
    const nurseClinicSlotsCount = totalDays * ncQuota;

    // Evening doctor sessions (ending at or after 19:00)
    const eveningSessions = scheduleSessions.filter((s) => s.endTime >= '19:00');
    let eveningCoverageAlert: string | undefined;
    if (eveningSessions.length > 0) {
      eveningCoverageAlert = `Detected ${eveningSessions.length} evening doctor sessions ending up to 21:00. The engine will prioritize assigning nurses to Full Day (D 09:00-21:00) and Late (L 11:00-21:00) duties to avoid coverage gaps.`;
    }

    let staffingScaleWarning: string | undefined;
    if (nurses.length < doctors.length) {
      staffingScaleWarning = `You have ${nurses.length} active nurses but ${doctors.length} clinic doctors — expect pairing float or gaps on peak clinic days.`;
    }

    return {
      scheduleName: schedule.name,
      startDate: schedule.startDate,
      endDate: schedule.endDate,
      totalDays,
      totalBlocks,
      activeNursesCount: nurses.length,
      activeDoctorsCount: doctors.length,
      doctorSessionsCount: scheduleSessions.length,
      phlebotomySlotsCount: totalDays * (roles.find((r) => r.acronym === 'PHL')?.defaultDailyQuota || 1),
      nurseClinicSlotsCount,
      nurseClinicRuleSeverity: ncSeverity,
      nurseClinicRuleEnabled: ncEnabled,
      existingLocksCount: scheduleLocks.length,
      existingLeaveDaysCount: scheduleLeave.length,
      estimatedTotalAssignments: scheduleSessions.length + totalDays + nurseClinicSlotsCount,
      priorityDutiesCount,
      standardDutiesCount,
      eveningCoverageAlert,
      staffingScaleWarning,
      detectedPeriodName,
      targetWorkingHoursFullTime,
      isProratedPeriod,
      hoursTargetDescription,
    };
  }

  /**
   * Filter and order candidate duties for a given slot.
   * Partitions into Priority Tier and Fallback/Standard Tier.
   * Duties in Priority Tier are evaluated first during slot assignment.
   * If priority duties cannot fulfill the requirement or violate constraints,
   * the engine falls back to the rest of the duties in the Fallback Tier.
   */
  public static partitionCandidateDuties(
    slot: InternalSlot,
    dutyWindows: DutyWindow[]
  ): { priorityTier: DutyWindow[]; fallbackTier: DutyWindow[] } {
    const active = dutyWindows.filter((d) => d.active !== false);
    if (active.length === 0) {
      return { priorityTier: [], fallbackTier: dutyWindows };
    }

    const slotDuration =
      (parseInt(slot.endTime.split(':')[0], 10) * 60 + parseInt(slot.endTime.split(':')[1], 10)) -
      (parseInt(slot.startTime.split(':')[0], 10) * 60 + parseInt(slot.startTime.split(':')[1], 10));

    // Scorer to order duties by clinical suitability for this slot:
    // 1. Full cover (duty start <= slot start && duty end >= slot end) = +1000
    // 2. Overlap with slot = +500
    // 3. Closeness to slot duration (minimizes unnecessary surplus/deficit)
    const getSuitabilityScore = (d: DutyWindow) => {
      let score = 0;
      if (d.startTime <= slot.startTime && d.endTime >= slot.endTime) {
        score += 1000;
      } else if (d.startTime < slot.endTime && d.endTime > slot.startTime) {
        score += 500;
      }
      const dur =
        (parseInt(d.endTime.split(':')[0], 10) * 60 + parseInt(d.endTime.split(':')[1], 10)) -
        (parseInt(d.startTime.split(':')[0], 10) * 60 + parseInt(d.startTime.split(':')[1], 10));
      score -= Math.abs(dur - slotDuration);
      return score;
    };

    // Deterministic sort function for candidate duties
    const sortDuties = (list: DutyWindow[]) => {
      return [...list].sort((a, b) => {
        const suitA = getSuitabilityScore(a);
        const suitB = getSuitabilityScore(b);
        if (suitA !== suitB) return suitB - suitA;

        const rankA = a.priorityRank ?? (a.isPriority ? 100 : 50);
        const rankB = b.priorityRank ?? (b.isPriority ? 100 : 50);
        if (rankA !== rankB) return rankB - rankA;

        return a.acronym.localeCompare(b.acronym);
      });
    };

    const priorityTier = sortDuties(active.filter((d) => Boolean(d.isPriority)));
    const fallbackTier = sortDuties(active.filter((d) => !d.isPriority));

    return { priorityTier, fallbackTier };
  }

  /**
   * Deterministic Generation Pass (with async chunking)
   */
  public static async generate(
    schedule: Schedule,
    mode: RegenerateMode,
    existingAssignments: Assignment[],
    nurses: Nurse[],
    seniorityLevels: SeniorityLevel[],
    dutyWindows: DutyWindow[],
    roles: ClinicalRole[],
    specialties: Specialty[],
    sessions: DoctorSession[],
    locks: LockEntry[],
    leaveEntries: LeaveEntry[],
    rules: Rule[],
    onProgress?: GenerationProgressCallback,
    workingHoursPeriods?: WorkingHoursPeriod[],
    doctors: Doctor[] = []
  ): Promise<GenerationResult> {
    const startTimeMs = performance.now();

    // 1. Sort inputs deterministically
    const sortedNurses = [...nurses].sort((a, b) => a.fullName.localeCompare(b.fullName));
    const fullDayDuty = dutyWindows.find((d) => d.acronym === 'D') || dutyWindows[0];
    const lateDuty = dutyWindows.find((d) => d.acronym === 'L') || dutyWindows[0];
    const earlyDuty = dutyWindows.find((d) => d.acronym === 'E') || dutyWindows[0];

    const seniorLevelIds = new Set(
      seniorityLevels.filter((s) => s.isSenior).map((s) => s.id)
    );

    // Resolve authoritative full-time target hours from dedicated periods or prorating
    let effectiveFullTimeTarget = 0;
    let resolvedPeriodName: string | undefined = schedule.periodName;

    if (workingHoursPeriods && workingHoursPeriods.length > 0 && schedule.startDate && schedule.endDate) {
      const calc = calculateWorkingHoursForDateRange(schedule.startDate, schedule.endDate, workingHoursPeriods);
      if (calc.targetHours > 0) {
        effectiveFullTimeTarget = calc.targetHours;
        resolvedPeriodName = calc.matchedPeriod?.name || (calc.isProrated ? `${calc.totalScheduleDays}d Prorated` : schedule.periodName);
      }
    }

    if (!effectiveFullTimeTarget || effectiveFullTimeTarget <= 0) {
      if (schedule.hoursTargetFullTime && schedule.hoursTargetFullTime > 0) {
        effectiveFullTimeTarget = schedule.hoursTargetFullTime;
      } else {
        const sDate = new Date(schedule.startDate || '2026-01-01');
        const eDate = new Date(schedule.endDate || '2026-01-31');
        const sDays = Math.max(1, Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        effectiveFullTimeTarget = Math.max(24, Math.round((sDays * 40) / 7));
      }
    }

    // Dedicated Nurse Clinic rule lookup & configuration
    const ncRule = resolveRule(rules, 'DEDICATED_NURSE_CLINIC', 'rule-nurse-clinic', [
      'dedicated nurse clinic',
      'nurse clinic coverage',
    ]);
    const ncEnabled = ncRule ? ncRule.enabled : true;
    const ncSeverity = ncRule?.severity || 'HARD';
    const ncQuota = ncEnabled ? (ncRule?.value ?? 1) : 0;

    // At least +1 Additional Nurse Above Doctors During Operating Hours
    const plusOneRule = resolveRule(rules, 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS', 'rule-nurse-plus-one', [
      'additional nurse',
      'above doctors',
      'plus one',
    ]);
    const plusOneEnabled = plusOneRule ? plusOneRule.enabled : true;
    const minAdditionalNurses = plusOneEnabled ? (plusOneRule?.value ?? 1) : 0;

    // Maximum Working Hours Per Period rule lookup & configuration (Hard Rule H7)
    const maxHoursRule = resolveRule(rules, 'MAX_WORKING_HOURS_PER_PERIOD', 'rule-h7-max-hours', [
      'working hours',
      'max hours',
      'period hours',
      'overwork',
      'hour limit',
    ]);
    const maxHoursEnabled = maxHoursRule ? maxHoursRule.enabled : true;
    const maxHoursSeverity = maxHoursRule?.severity || 'HARD';
    const maxHoursToleranceRatio = (maxHoursRule?.value ? maxHoursRule.value : 105) / 100;

    // Consecutive Late Duties Ending at 21:00 (Rule S1)
    const consecutiveLateRule = resolveRule(rules, 'MAX_CONSECUTIVE_LATE_DUTIES', 'rule-s1', [
      'consecutive late',
      'consecutive night',
      'ending at 21:00',
      'late duties',
    ]);
    const maxConsecutiveLate = (consecutiveLateRule?.enabled !== false && consecutiveLateRule?.value) ? consecutiveLateRule.value : 3;
    const consecutiveLateSeverity = consecutiveLateRule?.severity || 'HARD';
    const consecutiveLateEnabled = consecutiveLateRule ? consecutiveLateRule.enabled : true;

    // Consecutive Working Days (Hard Rule H2)
    const consecutiveDaysRule = resolveRule(rules, 'MAX_CONSECUTIVE_DAYS', 'rule-h2', [
      'consecutive duties',
      'consecutive working days',
      'consecutive days',
    ]);
    const maxConsecutiveDays = (consecutiveDaysRule?.enabled !== false && consecutiveDaysRule?.value) ? consecutiveDaysRule.value : 6;
    const consecutiveDaysSeverity = consecutiveDaysRule?.severity || 'HARD';

    // Minimum Rest Between Duties (Hard Rule H3)
    const minRestRule = resolveRule(rules, 'MIN_REST_HOURS', 'rule-h3', [
      'rest between duties',
      'minimum rest',
    ]);
    const minRestHoursRequired = (minRestRule?.enabled !== false && minRestRule?.value) ? minRestRule.value : 11;

    const nurseClinicRole = roles.find(
      (r) => r.id === 'role-nurse-clinic' || r.acronym === 'NC' || r.name.toLowerCase().includes('nurse clinic')
    ) || {
      id: 'role-nurse-clinic',
      name: 'Nurse Clinic',
      acronym: 'NC',
      description: 'Dedicated nurse-led clinic (triage, dressings, vitals & injections) — independent of doctor sessions',
      defaultDailyQuota: 1,
      defaultStartTime: '09:00',
      defaultEndTime: '17:00',
    };

    if (!schedule || !schedule.startDate || !schedule.endDate) {
      return {
        scheduleId: schedule?.id || '',
        assignments: [],
        createdCount: 0,
        preservedLocksCount: 0,
        preservedManualCount: 0,
        unmetSlotsCount: 0,
        generationDurationMs: 0,
      };
    }

    // Date range
    const start = new Date(schedule.startDate);
    const end = new Date(schedule.endDate);
    const totalDays =
      Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const datesList: IsoDateString[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      datesList.push(d.toISOString().split('T')[0]);
    }

    // Retained assignments map: key = `${nurseId}_${date}`
    const resultAssignmentsMap = new Map<string, Assignment>();
    let preservedLocksCount = 0;
    let preservedManualCount = 0;

    // Filter existing assignments based on mode
    if (mode === 'CLEAR_GENERATED') {
      existingAssignments.forEach((a) => {
        if (a.source === 'LOCK' || a.source === 'MANUAL') {
          resultAssignmentsMap.set(`${a.nurseId}_${a.date}`, a);
          if (a.source === 'LOCK') preservedLocksCount++;
          if (a.source === 'MANUAL') preservedManualCount++;
        }
      });
      return {
        scheduleId: schedule.id,
        assignments: Array.from(resultAssignmentsMap.values()),
        createdCount: 0,
        preservedLocksCount,
        preservedManualCount,
        unmetSlotsCount: 0,
        generationDurationMs: Math.round(performance.now() - startTimeMs),
      };
    }

    if (mode === 'EMPTY_ONLY' || mode === 'REBALANCE') {
      existingAssignments.forEach((a) => {
        if (a.source === 'LOCK') {
          resultAssignmentsMap.set(`${a.nurseId}_${a.date}`, a);
          preservedLocksCount++;
        } else if (a.source === 'MANUAL') {
          resultAssignmentsMap.set(`${a.nurseId}_${a.date}`, a);
          preservedManualCount++;
        } else if (mode === 'EMPTY_ONLY' && a.source === 'GENERATED') {
          resultAssignmentsMap.set(`${a.nurseId}_${a.date}`, a);
        }
      });
    }

    // 2. Lock Pass: Materialize all LockEntry(ASSIGNMENT)
    const activeLocks = locks.filter(
      (l) => l.date >= schedule.startDate && l.date <= schedule.endDate
    );
    activeLocks.forEach((lock) => {
      const key = `${lock.nurseId}_${lock.date}`;
      if (lock.mode === 'ASSIGNMENT' && lock.dutyWindowId) {
        const lockAssignment: Assignment = {
          id: `asgn-lock-${lock.nurseId}-${lock.date}`,
          scheduleId: schedule.id,
          nurseId: lock.nurseId,
          date: lock.date,
          dutyWindowId: lock.dutyWindowId,
          kind: lock.assignmentKind || 'SPECIALTY',
          doctorId: lock.assignmentKind === 'DOCTOR' ? lock.targetRefId : undefined,
          clinicalRoleId: lock.assignmentKind === 'CLINICAL_ROLE' ? lock.targetRefId : undefined,
          specialtyId: lock.assignmentKind === 'SPECIALTY' ? lock.targetRefId : undefined,
          locked: true,
          source: 'LOCK',
          note: lock.note || 'Pinned by schedule lock',
        };
        resultAssignmentsMap.set(key, lockAssignment);
        preservedLocksCount++;
      }
    });

    // 3. Nurse State Tracking
    const nurseStates = new Map<string, NurseDayState>();
    sortedNurses.forEach((nurse) => {
      // Calculate credited leave hours for this nurse during the schedule period
      const nurseLeaveHours = leaveEntries
        .filter(
          (le) =>
            le.nurseId === nurse.id &&
            le.approved &&
            le.startDate <= schedule.endDate &&
            le.endDate >= schedule.startDate
        )
        .reduce((acc, le) => acc + (le.hoursCredited || 8), 0);

      // Calculate initial committed duty hours from retained locks and manual assignments
      let initialPreservedDutyHours = 0;
      let initialWeekendsWorked = 0;
      resultAssignmentsMap.forEach((asgn) => {
        if (asgn.nurseId === nurse.id && asgn.date >= schedule.startDate && asgn.date <= schedule.endDate) {
          const duty = dutyWindows.find((d) => d.id === asgn.dutyWindowId);
          const shiftH = calculateDutyDurationHours(duty);
          initialPreservedDutyHours += shiftH;
          const dayOfWeek = new Date(asgn.date + 'T00:00:00Z').getUTCDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) initialWeekendsWorked++;
        }
      });

      nurseStates.set(nurse.id, {
        hasDuty: false,
        consecutiveWorkingDays: 0,
        consecutiveLateEnds: 0,
        totalDutyHoursEarned: initialPreservedDutyHours + nurseLeaveHours,
        leaveHoursCredited: nurseLeaveHours,
        initialLockedHours: initialPreservedDutyHours,
        weekendsWorked: initialWeekendsWorked,
        holidaysWorked: 0,
        nurseClinicCount: 0,
      });
    });

    // Compute per-nurse contracted target and maximum allowable hours in this schedule period
    const nurseTargetMap = new Map<
      string,
      { contractTarget: number; dutyTarget: number; maxAllowedHours: number }
    >();
    sortedNurses.forEach((nurse) => {
      const contractTarget = Math.round(effectiveFullTimeTarget * (nurse.contractPercent / 100));
      const leaveHours = nurseStates.get(nurse.id)?.leaveHoursCredited || 0;
      const dutyTarget = Math.max(0, contractTarget - leaveHours);
      // Hard cap allows at most an indivisible 8h shift fraction or up to maxHoursToleranceRatio (105%)
      const maxAllowed = Math.max(
        dutyTarget,
        Math.min(dutyTarget + 8, Math.round(dutyTarget * maxHoursToleranceRatio))
      );
      nurseTargetMap.set(nurse.id, {
        contractTarget,
        dutyTarget,
        maxAllowedHours: maxAllowed,
      });
    });

    let createdCount = 0;
    let unmetSlotsCount = 0;
    let doctorSessionsTotal = 0;
    let doctorPriority1PairingsCount = 0;
    let doctorPriority2PairingsCount = 0;
    let doctorPriority3PlusPairingsCount = 0;
    let doctorSpecialtyPairingsCount = 0;
    let doctorFallbackPairingsCount = 0;

    // Global duty window lookup
    const dutyMapGlobal = new Map(dutyWindows.map((d) => [d.id, d]));

    // Deterministic calendar lookback helper for Hard Rule H2 (Max 6 consecutive working days)
    const getConsecutiveDaysWorkedEndingYesterday = (nurseId: string, currentDateStr: string): number => {
      let consecutive = 0;
      const [y, m, d] = currentDateStr.split('-').map(Number);
      for (let i = 1; i <= 6; i++) {
        const prevDate = new Date(Date.UTC(y, m - 1, d - i)).toISOString().split('T')[0];
        if (resultAssignmentsMap.has(`${nurseId}_${prevDate}`)) {
          consecutive++;
        } else {
          break;
        }
      }
      return consecutive;
    };

    // Deterministic calendar lookback helper for Hard Rule S1 (Consecutive late duties ending at or after 21:00)
    const getConsecutiveLateDutiesEndingYesterday = (nurseId: string, currentDateStr: string): number => {
      let consecutive = 0;
      const [y, m, d] = currentDateStr.split('-').map(Number);
      for (let i = 1; i <= maxConsecutiveLate + 2; i++) {
        const prevDate = new Date(Date.UTC(y, m - 1, d - i)).toISOString().split('T')[0];
        const prevAsgn = resultAssignmentsMap.get(`${nurseId}_${prevDate}`);
        if (!prevAsgn) break;
        const prevDuty = dutyMapGlobal.get(prevAsgn.dutyWindowId);
        if (prevDuty && prevDuty.endTime >= '21:00') {
          consecutive++;
        } else {
          break;
        }
      }
      return consecutive;
    };

    // Build quick lookup for doctor -> set of specialtyIds
    const doctorSpecialtiesMap = new Map<string, Set<string>>();
    if (doctors && doctors.length > 0) {
      doctors.forEach((doc) => {
        if (doc.specialtyIds) {
          doctorSpecialtiesMap.set(doc.id, new Set(doc.specialtyIds));
        }
      });
    }
    sessions.forEach((s) => {
      if (s.doctorId && s.specialtyId) {
        if (!doctorSpecialtiesMap.has(s.doctorId)) {
          doctorSpecialtiesMap.set(s.doctorId, new Set());
        }
        doctorSpecialtiesMap.get(s.doctorId)!.add(s.specialtyId);
      }
    });

    // Helper: Strict Profile Allocation (Hard Rule H8)
    // Determines if a nurse is permitted to be scheduled with a given doctor or specialty based on their profile.
    const isNurseAllocatedToDoctorOrSpecialty = (
      nurse: Nurse,
      targetDoctorId?: string,
      targetSpecialtyId?: string,
      directDocSpecialtyIds?: string[]
    ): boolean => {
      // Check if nurse has configured ANY doctor or specialty preferences
      const hasSpecificAllocations = nurse.preferences?.some(
        (p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY'
      );

      // If nurse has NO doctor or specialty preferences configured, they are an unrestricted clinic nurse
      if (!hasSpecificAllocations) {
        return true;
      }

      // Check direct doctor preference match
      if (targetDoctorId && nurse.preferences?.some((p) => p.kind === 'DOCTOR' && p.refId === targetDoctorId)) {
        return true;
      }

      // Collect all candidate specialty IDs for the target doctor/specialty
      const candidateSpecIds = new Set<string>();
      if (targetSpecialtyId) {
        candidateSpecIds.add(targetSpecialtyId);
      }
      if (directDocSpecialtyIds) {
        directDocSpecialtyIds.forEach((sid) => candidateSpecIds.add(sid));
      }
      if (targetDoctorId && doctorSpecialtiesMap.has(targetDoctorId)) {
        doctorSpecialtiesMap.get(targetDoctorId)!.forEach((sid) => candidateSpecIds.add(sid));
      }

      // Check specialty preference match
      for (const pref of nurse.preferences || []) {
        if (pref.kind === 'SPECIALTY') {
          if (candidateSpecIds.has(pref.refId)) {
            return true;
          }
          const prefLower = pref.refId.toLowerCase();
          for (const sid of candidateSpecIds) {
            const specObj = specialties.find((s) => s.id === sid);
            if (specObj) {
              if (
                prefLower === specObj.code.toLowerCase() ||
                prefLower === specObj.name.toLowerCase() ||
                (specObj.code.toLowerCase() === 'pcc' && prefLower.includes('pcc')) ||
                (specObj.code.toLowerCase() === 'ped' && (prefLower.includes('ped') || prefLower.includes('pedia')))
              ) {
                return true;
              }
            }
          }
        }
      }

      return false;
    };

    // 4. Iterate Days with Chunking (Yielding to Event Loop every 5 days)
    for (let dayIdx = 0; dayIdx < datesList.length; dayIdx++) {
      const date = datesList[dayIdx];
      const isWeekend = new Date(date).getUTCDay() === 0 || new Date(date).getUTCDay() === 6;

      if (onProgress && dayIdx % 5 === 0) {
        onProgress({
          currentDay: dayIdx + 1,
          totalDays,
          currentDate: date,
          statusText: `Optimizing Day ${dayIdx + 1} of ${totalDays} (${date})...`,
          percent: Math.round(((dayIdx + 1) / totalDays) * 100),
        });
        // Non-blocking chunk yield
        await new Promise((resolve) => setTimeout(resolve, 8));
      }

      // Collect demands for this date
      const existingToday = Array.from(resultAssignmentsMap.values()).filter((a) => a.date === date);
      const coveredDoctorIds = new Set(
        existingToday.filter((a) => a.kind === 'DOCTOR' && a.doctorId).map((a) => a.doctorId!)
      );
      const coveredRoleCounts = new Map<string, number>();
      existingToday
        .filter((a) => a.kind === 'CLINICAL_ROLE' && a.clinicalRoleId)
        .forEach((a) => {
          coveredRoleCounts.set(
            a.clinicalRoleId!,
            (coveredRoleCounts.get(a.clinicalRoleId!) || 0) + 1
          );
        });
      const coveredNurseClinicCount =
        (coveredRoleCounts.get(nurseClinicRole.id) || 0) +
        (coveredRoleCounts.get('role-nurse-clinic') || 0);

      const daySessions = sessions
        .filter((s) => !s.cancelled && s.date === date && !coveredDoctorIds.has(s.doctorId))
        .sort((a, b) => {
          // Late ending sessions first (e.g. 21:00)
          return b.endTime.localeCompare(a.endTime);
        });

      const daySlots: InternalSlot[] = [];

      // 4.1 Doctor session slots
      daySessions.forEach((sess) => {
        const docSpecialty = specialties.find((s) => s.id === sess.specialtyId);
        const hasPriority1Nurse = sortedNurses.some((n) =>
          n.preferences?.some(
            (p) =>
              (p.kind === 'DOCTOR' && p.refId === sess.doctorId && p.rank === 1) ||
              (p.kind === 'SPECIALTY' &&
                (p.refId === sess.specialtyId ||
                  (docSpecialty && (p.refId.toLowerCase() === docSpecialty.code.toLowerCase() || p.refId.toLowerCase() === docSpecialty.name.toLowerCase()))) &&
                p.rank === 1)
          )
        );
        daySlots.push({
          date,
          kind: 'DOCTOR',
          targetId: sess.doctorId,
          startTime: sess.startTime,
          endTime: sess.endTime,
          // Higher priority for doctors with dedicated Priority 1 nurses and late-ending clinics
          priority: sess.endTime >= '19:00' ? 130 : hasPriority1Nurse ? 125 : 120,
        });
      });

      // 4.2 Clinical role slots (e.g. Blood Collection & IV / PHL, and Dedicated Nurse Clinic)
      let addedNurseClinicSlot = false;
      const remainingNcQuota = Math.max(0, ncQuota - coveredNurseClinicCount);

      roles.forEach((role) => {
        const isNc =
          role.id === nurseClinicRole.id ||
          role.acronym === 'NC' ||
          role.name.toLowerCase().includes('nurse clinic');

        if (isNc) {
          if (ncEnabled) {
            addedNurseClinicSlot = true;
            for (let q = 0; q < remainingNcQuota; q++) {
              daySlots.push({
                date,
                kind: 'CLINICAL_ROLE',
                targetId: role.id,
                startTime: role.defaultStartTime || '09:00',
                endTime: role.defaultEndTime || '17:00',
                // Doctor clinics filled first (120-130); then Dedicated Nurse Clinic (110 when HARD, 75 when SOFT)
                priority: ncSeverity === 'HARD' ? 110 : 75,
              });
            }
          }
        } else {
          const roleCovered = coveredRoleCounts.get(role.id) || 0;
          const quota = Math.max(0, (role.defaultDailyQuota || 1) - roleCovered);
          const hasRoleP1Nurse = sortedNurses.some((n) =>
            n.preferences?.some(
              (p) =>
                p.kind === 'CLINICAL_ROLE' &&
                (p.refId === role.id || p.refId.toLowerCase() === role.acronym.toLowerCase()) &&
                p.rank === 1
            )
          );
          for (let q = 0; q < quota; q++) {
            daySlots.push({
              date,
              kind: 'CLINICAL_ROLE',
              targetId: role.id,
              startTime: role.defaultStartTime || '09:00',
              endTime: role.defaultEndTime || '13:00',
              priority: hasRoleP1Nurse ? 125 : 90,
            });
          }
        }
      });

      // If Nurse Clinic wasn't in roles array but rule is enabled, add it explicitly
      if (ncEnabled && !addedNurseClinicSlot) {
        for (let q = 0; q < remainingNcQuota; q++) {
          daySlots.push({
            date,
            kind: 'CLINICAL_ROLE',
            targetId: nurseClinicRole.id,
            startTime: nurseClinicRole.defaultStartTime || '09:00',
            endTime: nurseClinicRole.defaultEndTime || '17:00',
            priority: ncSeverity === 'HARD' ? 110 : 75,
          });
        }
      }

      // Sort slots by priority
      daySlots.sort((a, b) => b.priority - a.priority);

      // Track nurses assigned on THIS day
      const nursesAssignedToday = new Set<string>();

      // Check pre-existing locks or manual assignments for today
      sortedNurses.forEach((nurse) => {
        const key = `${nurse.id}_${date}`;
        if (resultAssignmentsMap.has(key)) {
          nursesAssignedToday.add(nurse.id);
          const asgn = resultAssignmentsMap.get(key)!;
          const duty = dutyWindows.find((d) => d.id === asgn.dutyWindowId) || fullDayDuty;
          const state = nurseStates.get(nurse.id);
          if (state) {
            state.consecutiveWorkingDays = getConsecutiveDaysWorkedEndingYesterday(nurse.id, date) + 1;
            state.totalDutyHoursEarned += calculateDutyDurationHours(duty);
            state.lastDutyEndTime = `${date} ${duty.endTime}`;
            if (
              asgn.kind === 'CLINICAL_ROLE' &&
              (asgn.clinicalRoleId === nurseClinicRole.id || asgn.clinicalRoleId === 'role-nurse-clinic')
            ) {
              state.nurseClinicCount += 1;
            }
            if (duty.endTime >= '21:00') {
              state.consecutiveLateEnds += 1;
            } else {
              state.consecutiveLateEnds = 0;
            }
            if (isWeekend) {
              state.weekendsWorked += 1;
            }
          }
        }
      });

      // 4.3 Slot Assignment Pass
      for (const slot of daySlots) {
        const isNurseClinicSlot =
          slot.kind === 'CLINICAL_ROLE' &&
          (slot.targetId === nurseClinicRole.id ||
            slot.targetId === 'role-nurse-clinic' ||
            roles.find((r) => r.id === slot.targetId)?.acronym === 'NC');

        // Partition candidate duties for this slot into Priority Tier and Fallback/Standard Tier
        const { priorityTier, fallbackTier } = SchedulingEngine.partitionCandidateDuties(
          slot,
          dutyWindows
        );

        // Build tiers sequence: Priority duties first; fallback duties second
        const tiersToEvaluate: DutyWindow[][] = [];
        if (priorityTier.length > 0) {
          tiersToEvaluate.push(priorityTier);
        }
        if (fallbackTier.length > 0) {
          tiersToEvaluate.push(fallbackTier);
        }
        if (tiersToEvaluate.length === 0) {
          tiersToEvaluate.push([fullDayDuty]);
        }

        let bestNurse: Nurse | null = null;
        let bestScore = -999999;
        let chosenDuty: DutyWindow = fullDayDuty;
        let matchedPairingTier = 0; // 1 = Priority #1, 2 = Priority #2, 3 = Priority #3+, 4 = Specialty, 5 = General Pool

        // Hierarchical Cohort Partitioning:
        // When slot is DOCTOR, partition candidate nurses by their assigned doctor priority:
        // Cohort 1: Nurses who have this doctor assigned as Priority #1
        // Cohort 2: Nurses who have this doctor assigned as Priority #2
        // Cohort 3: Nurses who have this doctor assigned as Priority #3+
        // Cohort 4: Nurses with matching doctor specialty
        // Cohort 5: Remaining qualified clinic nurses
        let candidateCohorts: { label: string; tierRank: number; nurses: Nurse[] }[];

        if (slot.kind === 'DOCTOR') {
          const docSession = daySessions.find((s) => s.doctorId === slot.targetId);
          const docSpecialtyId = docSession?.specialtyId;
          const docSpecialty = docSpecialtyId ? specialties.find((s) => s.id === docSpecialtyId) : null;

          const matchesDoctorSpec = (pref: NursePreference, targetRank?: number) => {
            if (pref.kind !== 'SPECIALTY') return false;
            if (targetRank !== undefined && pref.rank !== targetRank) return false;
            if (!docSpecialtyId) return false;
            if (pref.refId === docSpecialtyId) return true;
            if (docSpecialty) {
              const prefRefLower = pref.refId.toLowerCase();
              if (
                prefRefLower === docSpecialty.code.toLowerCase() ||
                prefRefLower === docSpecialty.name.toLowerCase() ||
                (docSpecialty.code.toLowerCase() === 'pcc' && prefRefLower.includes('pcc'))
              ) {
                return true;
              }
            }
            return false;
          };

          // Tier 1: Assigned Doctor with Priority #1 (rank === 1)
          const p1Nurses = sortedNurses.filter((n) =>
            n.preferences?.some((p) => p.kind === 'DOCTOR' && p.refId === slot.targetId && p.rank === 1)
          );

          // Tier 2: Assigned Doctor with Priority #2 (rank === 2)
          const p2Nurses = sortedNurses.filter((n) =>
            n.preferences?.some((p) => p.kind === 'DOCTOR' && p.refId === slot.targetId && p.rank === 2)
          );

          // Tier 3: Assigned Doctor with Priority #3+ (rank >= 3)
          const p3Nurses = sortedNurses.filter((n) =>
            n.preferences?.some((p) => p.kind === 'DOCTOR' && p.refId === slot.targetId && p.rank >= 3)
          );

          // Tier 4: Matching Doctor Specialty Priority #1 (e.g. Primary Care / PCC Specialty Rank 1)
          const specP1Nurses = docSpecialtyId
            ? sortedNurses.filter(
                (n) =>
                  !n.preferences?.some((p) => p.kind === 'DOCTOR' && p.refId === slot.targetId) &&
                  n.preferences?.some((p) => matchesDoctorSpec(p, 1))
              )
            : [];

          // Tier 5: Matching Doctor Specialty Priority #2+
          const specP2PlusNurses = docSpecialtyId
            ? sortedNurses.filter(
                (n) =>
                  !n.preferences?.some((p) => p.kind === 'DOCTOR' && p.refId === slot.targetId) &&
                  !n.preferences?.some((p) => matchesDoctorSpec(p, 1)) &&
                  n.preferences?.some((p) => matchesDoctorSpec(p))
              )
            : [];

          // Tier 6: General Pool Clinic Nurses (remaining eligible clinic nurses who are permitted to assist this doctor/specialty)
          // STRICT ALLOCATION: Nurses who have defined doctor/specialty allocations (e.g. Pediatrics) must NEVER be assigned to an unallocated doctor (e.g. PCC)
          const fallbackNurses = sortedNurses.filter(
            (n) =>
              !n.preferences?.some((p) => p.kind === 'DOCTOR' && p.refId === slot.targetId) &&
              !n.preferences?.some((p) => matchesDoctorSpec(p)) &&
              isNurseAllocatedToDoctorOrSpecialty(n, slot.targetId, docSpecialtyId)
          );

          candidateCohorts = [
            { label: 'DOCTOR_P1', tierRank: 1, nurses: p1Nurses },
            { label: 'DOCTOR_P2', tierRank: 2, nurses: p2Nurses },
            { label: 'DOCTOR_P3', tierRank: 3, nurses: p3Nurses },
            { label: 'DOCTOR_SPEC_P1', tierRank: 4, nurses: specP1Nurses },
            { label: 'DOCTOR_SPEC_P2', tierRank: 5, nurses: specP2PlusNurses },
            { label: 'DOCTOR_FALLBACK', tierRank: 6, nurses: fallbackNurses },
          ];
        } else if (slot.kind === 'CLINICAL_ROLE') {
          const role = roles.find((r) => r.id === slot.targetId);
          const matchesRole = (pref: NursePreference, targetRank?: number) => {
            if (pref.kind !== 'CLINICAL_ROLE') return false;
            if (targetRank !== undefined && pref.rank !== targetRank) return false;
            if (pref.refId === slot.targetId) return true;
            if (role && (pref.refId.toLowerCase() === role.acronym.toLowerCase() || pref.refId.toLowerCase() === role.name.toLowerCase())) return true;
            return false;
          };

          const roleP1 = sortedNurses.filter((n) =>
            n.preferences?.some((p) => matchesRole(p, 1))
          );
          const roleP2 = sortedNurses.filter((n) =>
            !n.preferences?.some((p) => matchesRole(p, 1)) &&
            n.preferences?.some((p) => matchesRole(p, 2))
          );
          const roleP3 = sortedNurses.filter((n) =>
            !n.preferences?.some((p) => matchesRole(p, 1) || matchesRole(p, 2)) &&
            n.preferences?.some((p) => matchesRole(p))
          );
          const capableNurses = sortedNurses.filter(
            (n) =>
              !n.preferences?.some((p) => matchesRole(p)) &&
              n.capabilityIds.includes(slot.targetId)
          );
          const roleFallback = sortedNurses.filter(
            (n) =>
              !n.preferences?.some((p) => matchesRole(p)) &&
              !n.capabilityIds.includes(slot.targetId)
          );

          candidateCohorts = [
            { label: 'ROLE_P1', tierRank: 1, nurses: roleP1 },
            { label: 'ROLE_P2', tierRank: 2, nurses: roleP2 },
            { label: 'ROLE_P3', tierRank: 3, nurses: roleP3 },
            { label: 'ROLE_CAPABLE', tierRank: 4, nurses: capableNurses },
            { label: 'ROLE_FALLBACK', tierRank: 5, nurses: roleFallback },
          ];
        } else if (slot.kind === 'SPECIALTY') {
          const spec = specialties.find((s) => s.id === slot.targetId);
          const matchesSpecialty = (pref: NursePreference, targetRank?: number) => {
            if (pref.kind !== 'SPECIALTY') return false;
            if (targetRank !== undefined && pref.rank !== targetRank) return false;
            if (pref.refId === slot.targetId) return true;
            if (spec) {
              const prefRefLower = pref.refId.toLowerCase();
              if (
                prefRefLower === spec.code.toLowerCase() ||
                prefRefLower === spec.name.toLowerCase() ||
                (spec.code.toLowerCase() === 'pcc' && prefRefLower.includes('pcc')) ||
                (spec.code.toLowerCase() === 'ped' && (prefRefLower.includes('ped') || prefRefLower.includes('pedia')))
              ) {
                return true;
              }
            }
            return false;
          };

          const specP1 = sortedNurses.filter((n) =>
            n.preferences?.some((p) => matchesSpecialty(p, 1))
          );
          const specP2 = sortedNurses.filter((n) =>
            !n.preferences?.some((p) => matchesSpecialty(p, 1)) &&
            n.preferences?.some((p) => matchesSpecialty(p, 2))
          );
          const specP3 = sortedNurses.filter((n) =>
            !n.preferences?.some((p) => matchesSpecialty(p, 1) || matchesSpecialty(p, 2)) &&
            n.preferences?.some((p) => matchesSpecialty(p))
          );
          const specFallback = sortedNurses.filter(
            (n) =>
              !n.preferences?.some((p) => matchesSpecialty(p)) &&
              isNurseAllocatedToDoctorOrSpecialty(n, undefined, slot.targetId)
          );

          candidateCohorts = [
            { label: 'SPEC_P1', tierRank: 1, nurses: specP1 },
            { label: 'SPEC_P2', tierRank: 2, nurses: specP2 },
            { label: 'SPEC_P3', tierRank: 3, nurses: specP3 },
            { label: 'SPEC_FALLBACK', tierRank: 4, nurses: specFallback },
          ];
        } else {
          candidateCohorts = [
            { label: 'ROLE_STANDARD', tierRank: 0, nurses: sortedNurses },
          ];
        }

        // Multi-tier hierarchical assignment pass:
        // Evaluates cohorts in strict priority order. If a higher priority cohort yields a candidate
        // who satisfies all hard constraints, they are selected immediately and lower cohorts are skipped.
        for (const cohort of candidateCohorts) {
          if (cohort.nurses.length === 0) continue;

          let cohortBestNurse: Nurse | null = null;
          let cohortBestScore = -999999;
          let cohortChosenDuty: DutyWindow | null = null;

          for (const tier of tiersToEvaluate) {
            let tierBestNurse: Nurse | null = null;
            let tierBestScore = -999999;
            let tierChosenDuty: DutyWindow | null = null;

            for (const candidateDuty of tier) {
              for (const nurse of cohort.nurses) {
                const key = `${nurse.id}_${date}`;

                // HARD CONSTRAINT H4: One duty per nurse per day
                if (nursesAssignedToday.has(nurse.id)) continue;
                if (resultAssignmentsMap.has(key)) continue;

                // HARD CONSTRAINT H5: Approved leave or LockEntry(OFF)
                const onLeave = leaveEntries.some(
                  (le) =>
                    le.nurseId === nurse.id &&
                    le.approved &&
                    date >= le.startDate &&
                    date <= le.endDate
                );
                if (onLeave) continue;

                const hasLockOff = activeLocks.some(
                  (l) => l.nurseId === nurse.id && l.date === date && l.mode === 'OFF'
                );
                if (hasLockOff) continue;

                // HARD CONSTRAINT: Exclusive Nurse Clinic & Clinic Nurse Capability
                // When a nurse is not assigned as clinic nurse with no doctor and specialty preference
                // and only the nurse clinic option is selected, that nurse is exclusively nurse clinic
                // and must NEVER be assigned to a doctor or specialty session.
                const isExclusiveNC = isExclusiveNurseClinic(nurse, roles);
                if (isExclusiveNC && (slot.kind === 'DOCTOR' || slot.kind === 'SPECIALTY')) {
                  continue;
                }
                if (!nurse.isClinicNurse && (slot.kind === 'DOCTOR' || slot.kind === 'SPECIALTY')) {
                  continue;
                }

                // HARD CONSTRAINT H6: Capability check
                if (slot.kind === 'CLINICAL_ROLE') {
                  const role = roles.find((r) => r.id === slot.targetId);
                  if (role?.acronym === 'PHL' && !nurse.capabilityIds.includes(role.id)) {
                    continue; // Nurse lacks Phlebotomy/IV credential
                  }
                }

                // HARD CONSTRAINT H8: Strict Doctor / Specialty Profile Allocation
                // Nurses must only be scheduled to doctors or specialties mentioned in their profile.
                if (slot.kind === 'DOCTOR') {
                  const docSession = daySessions.find((s) => s.doctorId === slot.targetId);
                  const docObj = doctors?.find((d) => d.id === slot.targetId);
                  const docSpecId = docSession?.specialtyId || docObj?.specialtyIds?.[0];
                  if (!isNurseAllocatedToDoctorOrSpecialty(nurse, slot.targetId, docSpecId, docObj?.specialtyIds)) {
                    continue; // Violates Hard Rule H8: Nurse is not allocated to this doctor or department
                  }
                } else if (slot.kind === 'SPECIALTY') {
                  if (!isNurseAllocatedToDoctorOrSpecialty(nurse, undefined, slot.targetId)) {
                    continue; // Violates Hard Rule H8: Nurse is not allocated to this specialty
                  }
                }

                // HARD CONSTRAINT H2: Max consecutive working days
                const state = nurseStates.get(nurse.id)!;
                const consecutiveDaysEndingYesterday = getConsecutiveDaysWorkedEndingYesterday(nurse.id, date);
                if (consecutiveDaysSeverity === 'HARD' && consecutiveDaysEndingYesterday >= maxConsecutiveDays) continue;

                // HARD CONSTRAINT H3: Minimum rest between consecutive duties
                if (state.lastDutyEndTime) {
                  const [lastDateStr, lastTimeStr] = state.lastDutyEndTime.split(' ');
                  const lastDate = new Date(lastDateStr);
                  const currDate = new Date(date);
                  const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays === 1) {
                    const [prevEndH, prevEndM] = lastTimeStr.split(':').map(Number);
                    const [currStartH, currStartM] = candidateDuty.startTime.split(':').map(Number);
                    const restHours = (24 - prevEndH - prevEndM / 60) + (currStartH + currStartM / 60);
                    if (restHours < minRestHoursRequired) {
                      continue; // Violates mandatory rest period
                    }
                  }
                }

                // HARD CONSTRAINT H7: Maximum working hours limit (prevent nurse overwork)
                const nurseLimits = nurseTargetMap.get(nurse.id);
                const shiftHours = calculateDutyDurationHours(candidateDuty);
                if (
                  maxHoursEnabled &&
                  maxHoursSeverity === 'HARD' &&
                  nurseLimits &&
                  state.totalDutyHoursEarned + shiftHours > nurseLimits.maxAllowedHours
                ) {
                  continue; // Violates Hard Rule H7: exceeds maximum allowable working hours in period
                }

                // HARD CONSTRAINT S1: Maximum consecutive late duties ending at 21:00
                const consecutiveLateEndingYesterday = getConsecutiveLateDutiesEndingYesterday(nurse.id, date);
                if (
                  candidateDuty.endTime >= '21:00' &&
                  consecutiveLateEnabled &&
                  consecutiveLateSeverity === 'HARD' &&
                  consecutiveLateEndingYesterday >= maxConsecutiveLate
                ) {
                  continue; // Violates Hard Rule: Exceeds max consecutive late duties ending at 21:00
                }

                // SOFT SCORING FORMULA
                let score = 0;

                // S0: Pacing penalty: If nurse is 1 day away from hitting the consecutive days ceiling, apply soft penalty (-60)
                if (consecutiveDaysEndingYesterday === maxConsecutiveDays - 1) {
                  score -= 60;
                }

                // Dedicated Nurse Clinic equity & preferences
                if (isNurseClinicSlot) {
                  // If the nurse is exclusively dedicated to Nurse Clinic, award highest priority (+200 pts)
                  if (isExclusiveNC) {
                    score += 200;
                  }
                  // Distribute Nurse Clinic fairly across nursing pool
                  score -= state.nurseClinicCount * 25;
                  const ncPref = nurse.preferences?.find(
                    (p) =>
                      p.kind === 'CLINICAL_ROLE' &&
                      (p.refId === nurseClinicRole.id || p.refId === 'role-nurse-clinic')
                  );
                  if (ncPref) score += ncPref.rank === 1 ? 40 : 20;

                  // Nurses who have assigned doctors are reserved for doctor clinics
                  const hasDoctorAssignment = nurse.preferences?.some((p) => p.kind === 'DOCTOR');
                  if (hasDoctorAssignment) {
                    score -= 50;
                  }
                }

                // S2: Fine-grained preference honoring within same cohort
                if (slot.kind === 'DOCTOR') {
                  const pref = nurse.preferences?.find(
                    (p) => p.kind === 'DOCTOR' && p.refId === slot.targetId
                  );
                  const docSession = daySessions.find((s) => s.doctorId === slot.targetId);
                  const docSpecialty = docSession ? specialties.find((s) => s.id === docSession.specialtyId) : null;
                  const specPref = docSession
                    ? nurse.preferences?.find(
                        (p) =>
                          p.kind === 'SPECIALTY' &&
                          (p.refId === docSession.specialtyId ||
                            (docSpecialty &&
                              (p.refId.toLowerCase() === docSpecialty.code.toLowerCase() ||
                               p.refId.toLowerCase() === docSpecialty.name.toLowerCase() ||
                               (docSpecialty.code.toLowerCase() === 'pcc' && p.refId.toLowerCase().includes('pcc')))))
                      )
                    : null;

                  if (pref) {
                    score += pref.rank === 1 ? 80 : pref.rank === 2 ? 40 : 20;
                  } else if (specPref) {
                    // Specialty match bonus
                    score += specPref.rank === 1 ? 70 : specPref.rank === 2 ? 35 : 15;
                  }

                  // Cross-session Opportunity Cost Guard (General Rule):
                  // If this nurse has other active sessions on this day where they also match a Rank 1 preference (Doctor or Specialty),
                  // apply an opportunity cost penalty so nurses whose exclusive top choice is THIS slot get priority,
                  // preserving multi-qualified nurses for their other active top choices today.
                  const otherActiveRank1ChoicesCount = daySessions.filter((otherSess) => {
                    if (otherSess.doctorId === slot.targetId) return false;
                    const otherSpec = specialties.find((s) => s.id === otherSess.specialtyId);
                    return nurse.preferences?.some(
                      (p) =>
                        ((p.kind === 'DOCTOR' && p.refId === otherSess.doctorId) ||
                         (p.kind === 'SPECIALTY' &&
                           (p.refId === otherSess.specialtyId ||
                             (otherSpec &&
                               (p.refId.toLowerCase() === otherSpec.code.toLowerCase() ||
                                p.refId.toLowerCase() === otherSpec.name.toLowerCase() ||
                                (otherSpec.code.toLowerCase() === 'pcc' && p.refId.toLowerCase().includes('pcc'))))))) &&
                        p.rank === 1
                    );
                  }).length;

                  if (otherActiveRank1ChoicesCount > 0) {
                    score -= 50 * otherActiveRank1ChoicesCount;
                  }
                } else if (slot.kind === 'CLINICAL_ROLE') {
                  const role = roles.find((r) => r.id === slot.targetId);
                  const rolePref = nurse.preferences?.find(
                    (p) =>
                      p.kind === 'CLINICAL_ROLE' &&
                      (p.refId === slot.targetId ||
                        (role && (p.refId.toLowerCase() === role.acronym.toLowerCase() || p.refId.toLowerCase() === role.name.toLowerCase())))
                  );
                  if (rolePref) {
                    score += rolePref.rank === 1 ? 80 : rolePref.rank === 2 ? 40 : 20;
                  }
                }

                // S3: Hours fairness — score bonus for nurses furthest below target
                const dutyTarget = nurseLimits?.dutyTarget ?? Math.round(effectiveFullTimeTarget * (nurse.contractPercent / 100));
                const hoursDeficit = dutyTarget - (state.totalDutyHoursEarned - (state.leaveHoursCredited || 0));
                if (hoursDeficit <= 0) {
                  score -= 150; // Nurse has already met duty hours target; strongly prioritize nurses with remaining hours
                } else {
                  score += hoursDeficit * 1.5; // Scale bonus to prioritize nurses with the greatest hours deficit
                }

                // S4: Weekend equity — prioritize nurses who worked fewer weekends
                if (isWeekend) {
                  score -= state.weekendsWorked * 25;
                }

                // S1: Consecutive late duties ending at 21:00 (penalty if already approaching ceiling)
                if (candidateDuty.endTime >= '21:00') {
                  if (consecutiveLateEndingYesterday >= maxConsecutiveLate) {
                    score -= 150; // soft rule violation penalty
                  } else if (consecutiveLateEndingYesterday >= maxConsecutiveLate - 1) {
                    score -= 50; // pacing penalty when 1 away from limit
                  }
                }

                // Seniority distribution
                if (seniorLevelIds.has(nurse.seniorityLevelId)) {
                  score += 10;
                }

                // Priority weighting bonus
                if (candidateDuty.isPriority) {
                  score += 30;
                }
                score += (candidateDuty.priorityRank ?? 100) * 0.05;

                // Overhang & Additional Nurse Scoring:
                // If duty extends past doctor session (e.g. duty ends at 21:00 while doctor leaves at 18:00),
                // this nurse counts as an additional nurse from 18:00 to 21:00!
                // Award a bonus, and an extra bonus if the nurse is nurse-clinic enabled.
                const hasOverhang = slot.kind === 'DOCTOR' && candidateDuty.endTime > slot.endTime;
                if (hasOverhang) {
                  const isNcQualified =
                    nurse.capabilityIds.includes(nurseClinicRole.id) ||
                    nurse.capabilityIds.includes('role-nurse-clinic') ||
                    nurse.capabilityIds.some((cid) => roles.find((r) => r.id === cid)?.acronym === 'NC') ||
                    seniorLevelIds.has(nurse.seniorityLevelId);

                  if (isNcQualified) {
                    score += 45; // High priority for nurse-clinic qualified staff on overhang hours
                  } else {
                    score += 15;
                  }
                }

                if (score > tierBestScore) {
                  tierBestScore = score;
                  tierBestNurse = nurse;
                  tierChosenDuty = candidateDuty;
                }
              }
            }

            // If this duty tier found an eligible nurse and duty, adopt it and do not drop to fallback
            if (tierBestNurse && tierChosenDuty) {
              cohortBestNurse = tierBestNurse;
              cohortBestScore = tierBestScore;
              cohortChosenDuty = tierChosenDuty;
              break;
            }
          }

          // If this priority cohort found a valid candidate who satisfies hard rules:
          if (cohortBestNurse && cohortChosenDuty) {
            bestNurse = cohortBestNurse;
            bestScore = cohortBestScore;
            chosenDuty = cohortChosenDuty;
            matchedPairingTier = cohort.tierRank;
            break; // Stop evaluating lower-priority cohorts!
          }
        }

        // Place assignment if candidate found
        if (bestNurse) {
          const newAssignment: Assignment = {
            id: `asgn-gen-${bestNurse.id}-${date}-${slot.kind}${isNurseClinicSlot ? '-nc' : ''}`,
            scheduleId: schedule.id,
            nurseId: bestNurse.id,
            date,
            dutyWindowId: chosenDuty.id,
            kind: slot.kind,
            doctorId: slot.kind === 'DOCTOR' ? slot.targetId : undefined,
            clinicalRoleId: slot.kind === 'CLINICAL_ROLE' ? slot.targetId : undefined,
            specialtyId: slot.kind === 'SPECIALTY' ? slot.targetId : undefined,
            locked: false,
            source: 'GENERATED',
            note: isNurseClinicSlot
              ? 'Dedicated Nurse Clinic (not assigned to doctor)'
              : undefined,
          };

          resultAssignmentsMap.set(`${bestNurse.id}_${date}`, newAssignment);
          nursesAssignedToday.add(bestNurse.id);
          createdCount++;

          if (slot.kind === 'DOCTOR') {
            doctorSessionsTotal++;
            if (matchedPairingTier === 1) doctorPriority1PairingsCount++;
            else if (matchedPairingTier === 2) doctorPriority2PairingsCount++;
            else if (matchedPairingTier === 3) doctorPriority3PlusPairingsCount++;
            else if (matchedPairingTier === 4 || matchedPairingTier === 5) doctorSpecialtyPairingsCount++;
            else doctorFallbackPairingsCount++;
          }

          // Update nurse counters
          const state = nurseStates.get(bestNurse.id)!;
          state.consecutiveWorkingDays = getConsecutiveDaysWorkedEndingYesterday(bestNurse.id, date) + 1;
          state.totalDutyHoursEarned += calculateDutyDurationHours(chosenDuty);
          state.lastDutyEndTime = `${date} ${chosenDuty.endTime}`;
          if (isNurseClinicSlot) {
            state.nurseClinicCount += 1;
          }
          if (isWeekend) {
            state.weekendsWorked += 1;
          }
          if (chosenDuty.endTime >= '21:00') {
            state.consecutiveLateEnds += 1;
          } else {
            state.consecutiveLateEnds = 0;
          }
        } else {
          unmetSlotsCount++;
          if (slot.kind === 'DOCTOR') {
            doctorSessionsTotal++;
          }
        }
      }

      // 4.4 Senior Fixer Pass (HARD RULE H1: At least one senior on each active duty window)
      // Check active duty windows today
      const dutiesToday = new Set<string>();
      resultAssignmentsMap.forEach((asgn) => {
        if (asgn.date === date) {
          dutiesToday.add(asgn.dutyWindowId);
        }
      });

      dutiesToday.forEach((dutyId) => {
        const assignedToDuty = Array.from(resultAssignmentsMap.values()).filter(
          (a) => a.date === date && a.dutyWindowId === dutyId
        );
        const hasSenior = assignedToDuty.some((a) => {
          const n = sortedNurses.find((x) => x.id === a.nurseId);
          return n && seniorLevelIds.has(n.seniorityLevelId);
        });

        if (!hasSenior && assignedToDuty.length > 0) {
          const targetAssignment = assignedToDuty[0];
          const targetDuty = dutyWindows.find((d) => d.id === targetAssignment.dutyWindowId) || fullDayDuty;

          // Look for an available senior not working today who satisfies hard constraints
          const availableSenior = sortedNurses.find((n) => {
            if (!seniorLevelIds.has(n.seniorityLevelId)) return false;
            if (nursesAssignedToday.has(n.id)) return false;

            // Exclusive Nurse Clinic staff cannot be swapped into doctor or specialty assignments
            if (
              (targetAssignment.kind === 'DOCTOR' || targetAssignment.kind === 'SPECIALTY') &&
              (!n.isClinicNurse || isExclusiveNurseClinic(n, roles))
            ) {
              return false;
            }

            // Strict Profile Allocation check for senior swap (Hard Rule H8)
            if (targetAssignment.kind === 'DOCTOR' && targetAssignment.doctorId) {
              const docSession = daySessions.find((s) => s.doctorId === targetAssignment.doctorId);
              const docObj = doctors?.find((d) => d.id === targetAssignment.doctorId);
              const docSpecId = docSession?.specialtyId || docObj?.specialtyIds?.[0];
              if (!isNurseAllocatedToDoctorOrSpecialty(n, targetAssignment.doctorId, docSpecId, docObj?.specialtyIds)) {
                return false;
              }
            } else if (targetAssignment.kind === 'SPECIALTY' && targetAssignment.specialtyId) {
              if (!isNurseAllocatedToDoctorOrSpecialty(n, undefined, targetAssignment.specialtyId)) {
                return false;
              }
            }

            const key = `${n.id}_${date}`;
            if (resultAssignmentsMap.has(key)) return false;

            const onLeave = leaveEntries.some(
              (le) =>
                le.nurseId === n.id &&
                le.approved &&
                date >= le.startDate &&
                date <= le.endDate
            );
            if (onLeave) return false;

            const seniorState = nurseStates.get(n.id);
            if (seniorState) {
              if (consecutiveDaysSeverity === 'HARD' && getConsecutiveDaysWorkedEndingYesterday(n.id, date) >= maxConsecutiveDays) return false;
              const seniorLimits = nurseTargetMap.get(n.id);
              const seniorShiftHours = calculateDutyDurationHours(targetDuty);
              if (
                maxHoursEnabled &&
                maxHoursSeverity === 'HARD' &&
                seniorLimits &&
                seniorState.totalDutyHoursEarned + seniorShiftHours > seniorLimits.maxAllowedHours
              ) {
                return false;
              }
              if (
                targetDuty.endTime >= '21:00' &&
                consecutiveLateEnabled &&
                consecutiveLateSeverity === 'HARD' &&
                getConsecutiveLateDutiesEndingYesterday(n.id, date) >= maxConsecutiveLate
              ) {
                return false;
              }
              if (seniorState.lastDutyEndTime) {
                const [lastDateStr, lastTimeStr] = seniorState.lastDutyEndTime.split(' ');
                const lastDate = new Date(lastDateStr);
                const currDate = new Date(date);
                const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays === 1) {
                  const [prevEndH, prevEndM] = lastTimeStr.split(':').map(Number);
                  const [currStartH, currStartM] = targetDuty.startTime.split(':').map(Number);
                  const restHours = (24 - prevEndH - prevEndM / 60) + (currStartH + currStartM / 60);
                  if (restHours < minRestHoursRequired) return false;
                }
              }
            }

            return true;
          });

          if (availableSenior && targetAssignment.source === 'GENERATED') {
            // Release junior
            resultAssignmentsMap.delete(`${targetAssignment.nurseId}_${date}`);
            nursesAssignedToday.delete(targetAssignment.nurseId);
            const juniorState = nurseStates.get(targetAssignment.nurseId);
            if (juniorState) {
              juniorState.consecutiveWorkingDays = getConsecutiveDaysWorkedEndingYesterday(targetAssignment.nurseId, date);
              juniorState.totalDutyHoursEarned = Math.max(
                0,
                juniorState.totalDutyHoursEarned - calculateDutyDurationHours(targetDuty)
              );
              if (targetDuty.endTime >= '21:00') {
                juniorState.consecutiveLateEnds = Math.max(0, juniorState.consecutiveLateEnds - 1);
              }
            }

            // Assign senior
            const swappedAsgn: Assignment = {
              ...targetAssignment,
              id: `asgn-gen-${availableSenior.id}-${date}-H1SWAP`,
              nurseId: availableSenior.id,
            };
            resultAssignmentsMap.set(`${availableSenior.id}_${date}`, swappedAsgn);
            nursesAssignedToday.add(availableSenior.id);
            const seniorState = nurseStates.get(availableSenior.id);
            if (seniorState) {
              seniorState.consecutiveWorkingDays = getConsecutiveDaysWorkedEndingYesterday(availableSenior.id, date) + 1;
              seniorState.totalDutyHoursEarned += calculateDutyDurationHours(targetDuty);
              seniorState.lastDutyEndTime = `${date} ${targetDuty.endTime}`;
              if (isWeekend) seniorState.weekendsWorked += 1;
              if (targetDuty.endTime >= '21:00') {
                seniorState.consecutiveLateEnds += 1;
              } else {
                seniorState.consecutiveLateEnds = 0;
              }
            }
          }
        }
      });

      // 4.5 Hourly +1 Additional Nurse Balancing Pass:
      // Ensure at least one additional nurse above active doctors during clinic operating hours.
      if (plusOneEnabled && daySessions.length > 0) {
        const dutyMapLocal = new Map(dutyWindows.map((d) => [d.id, d]));

        let hasDeficit = true;
        let attempts = 0;

        while (hasDeficit && attempts < 5) {
          attempts++;
          hasDeficit = false;

          let worstHour = -1;
          let maxDeficit = 0;

          for (let hour = 9; hour <= 20; hour++) {
            const hourStart = `${String(hour).padStart(2, '0')}:00`;
            const hourEnd = `${String(hour + 1).padStart(2, '0')}:00`;

            const docsActive = daySessions.filter(
              (s) => s.startTime < hourEnd && s.endTime > hourStart
            ).length;

            const nursesActive = Array.from(resultAssignmentsMap.values()).filter((a) => {
              if (a.date !== date) return false;
              const duty = dutyMapLocal.get(a.dutyWindowId) || fullDayDuty;
              return duty.startTime < hourEnd && duty.endTime > hourStart;
            }).length;

            const isOperating = docsActive > 0 || (hour >= 9 && hour <= 20 && daySessions.length > 0);
            const required = docsActive + (isOperating ? minAdditionalNurses : 0);
            const deficit = Math.max(0, required - nursesActive);

            if (deficit > maxDeficit) {
              maxDeficit = deficit;
              worstHour = hour;
            }
          }

          if (maxDeficit > 0 && worstHour >= 0) {
            hasDeficit = true;

            // Strategy A: Duty extension / overhang.
            // Check if an already assigned nurse has a duty ending earlier (e.g. 16:00 or 17:00),
            // and extend to Full Day (09:00-21:00) or Late (11:00-21:00), prioritizing nurse-clinic enabled staff.
            let promoted = false;
            if (worstHour >= 16) {
              const eligibleAssigned = Array.from(resultAssignmentsMap.values()).filter((a) => {
                if (a.date !== date || a.locked) return false;
                const duty = dutyMapLocal.get(a.dutyWindowId);
                return duty && duty.endTime < '21:00';
              });

              eligibleAssigned.sort((a, b) => {
                const nurseA = sortedNurses.find((n) => n.id === a.nurseId);
                const nurseB = sortedNurses.find((n) => n.id === b.nurseId);
                const aNc =
                  nurseA?.capabilityIds.includes(nurseClinicRole.id) ||
                  nurseA?.capabilityIds.includes('role-nurse-clinic') ||
                  nurseA?.capabilityIds.some((cid) => roles.find((r) => r.id === cid)?.acronym === 'NC') ||
                  (nurseA && seniorLevelIds.has(nurseA.seniorityLevelId))
                    ? 1
                    : 0;
                const bNc =
                  nurseB?.capabilityIds.includes(nurseClinicRole.id) ||
                  nurseB?.capabilityIds.includes('role-nurse-clinic') ||
                  nurseB?.capabilityIds.some((cid) => roles.find((r) => r.id === cid)?.acronym === 'NC') ||
                  (nurseB && seniorLevelIds.has(nurseB.seniorityLevelId))
                    ? 1
                    : 0;
                return bNc - aNc;
              });

              for (const asgn of eligibleAssigned) {
                const nurse = sortedNurses.find((n) => n.id === asgn.nurseId);
                if (!nurse) continue;
                const state = nurseStates.get(nurse.id);
                const newDuty = fullDayDuty.endTime >= '21:00' ? fullDayDuty : lateDuty;
                if (
                  newDuty.endTime >= '21:00' &&
                  consecutiveLateEnabled &&
                  consecutiveLateSeverity === 'HARD' &&
                  getConsecutiveLateDutiesEndingYesterday(nurse.id, date) >= maxConsecutiveLate
                ) {
                  continue; // Duty extension would exceed maximum consecutive late duties ending at 21:00
                }
                const oldDuty = dutyMapLocal.get(asgn.dutyWindowId) || fullDayDuty;
                const addedHours =
                  calculateDutyDurationHours(newDuty) -
                  calculateDutyDurationHours(oldDuty);

                const nurseLimits = nurseTargetMap.get(nurse.id);
                if (
                  maxHoursEnabled &&
                  maxHoursSeverity === 'HARD' &&
                  nurseLimits &&
                  state &&
                  state.totalDutyHoursEarned + addedHours > nurseLimits.maxAllowedHours
                ) {
                  continue; // Duty extension would cause overwork
                }

                asgn.dutyWindowId = newDuty.id;
                asgn.note = asgn.note
                  ? `${asgn.note} (Extended for +1 clinic coverage)`
                  : 'Extended for +1 clinic coverage (overhang)';

                if (state) {
                  state.totalDutyHoursEarned += Math.max(0, addedHours);
                  state.lastDutyEndTime = `${date} ${newDuty.endTime}`;
                  if (newDuty.endTime >= '21:00') {
                    state.consecutiveLateEnds += 1;
                  }
                }
                promoted = true;
                break;
              }
            }

            // Strategy B: If promotion was not possible or did not resolve deficit, schedule an unassigned nurse
            if (!promoted) {
              const chosenDuty =
                worstHour >= 16
                  ? lateDuty.endTime >= '21:00'
                    ? lateDuty
                    : fullDayDuty
                  : worstHour <= 10 && earlyDuty.startTime <= '08:00'
                  ? earlyDuty
                  : fullDayDuty;
              const chosenDutyHours = calculateDutyDurationHours(chosenDuty);

              const unassignedNurses = sortedNurses.filter((nurse) => {
                if (nursesAssignedToday.has(nurse.id)) return false;
                const onLeave = leaveEntries.some(
                  (le) =>
                    le.nurseId === nurse.id &&
                    le.approved &&
                    date >= le.startDate &&
                    date <= le.endDate
                );
                if (onLeave) return false;
                const offLock = locks.some(
                  (lk) =>
                    lk.nurseId === nurse.id &&
                    lk.date === date &&
                    lk.mode === 'OFF'
                );
                if (offLock) return false;

                const state = nurseStates.get(nurse.id);
                if (consecutiveDaysSeverity === 'HARD' && getConsecutiveDaysWorkedEndingYesterday(nurse.id, date) >= maxConsecutiveDays) return false;

                const nurseLimits = nurseTargetMap.get(nurse.id);
                if (
                  maxHoursEnabled &&
                  maxHoursSeverity === 'HARD' &&
                  nurseLimits &&
                  state &&
                  state.totalDutyHoursEarned + chosenDutyHours > nurseLimits.maxAllowedHours
                ) {
                  return false; // Nurse cannot be scheduled for +1 without exceeding maximum working hours
                }

                if (
                  chosenDuty.endTime >= '21:00' &&
                  consecutiveLateEnabled &&
                  consecutiveLateSeverity === 'HARD' &&
                  getConsecutiveLateDutiesEndingYesterday(nurse.id, date) >= maxConsecutiveLate
                ) {
                  return false; // Violates Hard Rule: Exceeds max consecutive late duties ending at 21:00
                }

                if (state?.lastDutyEndTime) {
                  const [lastDateStr, lastTimeStr] = state.lastDutyEndTime.split(' ');
                  const lastDate = new Date(lastDateStr);
                  const currDate = new Date(date);
                  const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays === 1) {
                    const [prevEndH, prevEndM] = lastTimeStr.split(':').map(Number);
                    const [currStartH, currStartM] = chosenDuty.startTime.split(':').map(Number);
                    const restHours = (24 - prevEndH - prevEndM / 60) + (currStartH + currStartM / 60);
                    if (restHours < minRestHoursRequired) return false;
                  }
                }

                return true;
              });

              if (unassignedNurses.length > 0) {
                unassignedNurses.sort((a, b) => {
                  const aNc =
                    a.capabilityIds.includes(nurseClinicRole.id) ||
                    a.capabilityIds.includes('role-nurse-clinic') ||
                    a.capabilityIds.some((cid) => roles.find((r) => r.id === cid)?.acronym === 'NC') ||
                    seniorLevelIds.has(a.seniorityLevelId)
                      ? 1
                      : 0;
                  const bNc =
                    b.capabilityIds.includes(nurseClinicRole.id) ||
                    b.capabilityIds.includes('role-nurse-clinic') ||
                    b.capabilityIds.some((cid) => roles.find((r) => r.id === cid)?.acronym === 'NC') ||
                    seniorLevelIds.has(b.seniorityLevelId)
                      ? 1
                      : 0;
                  if (bNc !== aNc) return bNc - aNc;

                  const nurseLimitsA = nurseTargetMap.get(a.id);
                  const dutyTargetA = nurseLimitsA?.dutyTarget ?? Math.round(effectiveFullTimeTarget * (a.contractPercent / 100));
                  const deficitA = dutyTargetA - (nurseStates.get(a.id)?.totalDutyHoursEarned || 0);

                  const nurseLimitsB = nurseTargetMap.get(b.id);
                  const dutyTargetB = nurseLimitsB?.dutyTarget ?? Math.round(effectiveFullTimeTarget * (b.contractPercent / 100));
                  const deficitB = dutyTargetB - (nurseStates.get(b.id)?.totalDutyHoursEarned || 0);
                  return deficitB - deficitA;
                });

                const bestCandidate = unassignedNurses[0];
                const isNcQualified =
                  bestCandidate.capabilityIds.includes(nurseClinicRole.id) ||
                  bestCandidate.capabilityIds.includes('role-nurse-clinic') ||
                  bestCandidate.capabilityIds.some(
                    (cid) => roles.find((r) => r.id === cid)?.acronym === 'NC'
                  ) ||
                  seniorLevelIds.has(bestCandidate.seniorityLevelId);

                const addlAsgn: Assignment = {
                  id: `asgn-gen-${bestCandidate.id}-${date}-addl`,
                  scheduleId: schedule.id,
                  nurseId: bestCandidate.id,
                  date,
                  dutyWindowId: chosenDuty.id,
                  kind: 'CLINICAL_ROLE',
                  clinicalRoleId: isNcQualified ? nurseClinicRole.id : undefined,
                  doctorId: undefined,
                  locked: false,
                  source: 'GENERATED',
                  note: isNcQualified
                    ? 'Additional Nurse (Nurse Clinic Qualified Overhang / Float)'
                    : 'Additional Nurse (Clinic Coverage Float)',
                };

                resultAssignmentsMap.set(`${bestCandidate.id}_${date}`, addlAsgn);
                nursesAssignedToday.add(bestCandidate.id);
                createdCount++;

                const state = nurseStates.get(bestCandidate.id);
                if (state) {
                  state.consecutiveWorkingDays = getConsecutiveDaysWorkedEndingYesterday(bestCandidate.id, date) + 1;
                  state.totalDutyHoursEarned += calculateDutyDurationHours(chosenDuty);
                  state.lastDutyEndTime = `${date} ${chosenDuty.endTime}`;
                  if (isNcQualified) state.nurseClinicCount += 1;
                  if (isWeekend) state.weekendsWorked += 1;
                  if (chosenDuty.endTime >= '21:00') {
                    state.consecutiveLateEnds += 1;
                  } else {
                    state.consecutiveLateEnds = 0;
                  }
                }
              } else {
                break;
              }
            }
          }
        }
      }

      // 4.6 Float/Pool Pass: Assign remaining available nurses to Specialty Pool so nobody sits idle if hours needed
      sortedNurses.forEach((nurse) => {
        if (!nursesAssignedToday.has(nurse.id)) {
          const state = nurseStates.get(nurse.id)!;
          const nurseLimits = nurseTargetMap.get(nurse.id);
          const nurseTarget = nurseLimits?.dutyTarget ?? Math.round(effectiveFullTimeTarget * (nurse.contractPercent / 100));
          const consecutiveDaysEndingYesterday = getConsecutiveDaysWorkedEndingYesterday(nurse.id, date);

          // If significantly below target and under consecutive day limit, place in general pool
          // Float pool must NEVER push a nurse over their duty target, and never push to 6 or 7 consecutive days
          if (
            state.totalDutyHoursEarned < nurseTarget &&
            consecutiveDaysEndingYesterday < 5
          ) {
            const onLeave = leaveEntries.some(
              (le) =>
                le.nurseId === nurse.id &&
                le.approved &&
                date >= le.startDate &&
                date <= le.endDate
            );
            if (onLeave) return;

            // Prioritize priority duty windows first; fallback to standard duties for pool
            const activePoolDuties = dutyWindows.filter((d) => d.active !== false);
            const priorityPool = activePoolDuties.filter((d) => Boolean(d.isPriority));
            const standardPool = activePoolDuties.filter((d) => !d.isPriority);
            const poolTiers = [priorityPool, standardPool, [earlyDuty]];

            let selectedPoolDuty: DutyWindow | null = null;
            for (const tier of poolTiers) {
              for (const cand of tier) {
                const poolShiftHours = calculateDutyDurationHours(cand);
                if (
                  maxHoursEnabled &&
                  nurseLimits &&
                  state.totalDutyHoursEarned + poolShiftHours > nurseLimits.maxAllowedHours
                ) {
                  continue; // Pool duty would exceed max allowable hours
                }

                if (
                  cand.endTime >= '21:00' &&
                  consecutiveLateEnabled &&
                  consecutiveLateSeverity === 'HARD' &&
                  getConsecutiveLateDutiesEndingYesterday(nurse.id, date) >= maxConsecutiveLate
                ) {
                  continue; // Pool duty would exceed max consecutive late duties
                }

                let restCompliant = true;
                if (state.lastDutyEndTime) {
                  const [lastDateStr, lastTimeStr] = state.lastDutyEndTime.split(' ');
                  const lastDate = new Date(lastDateStr);
                  const currDate = new Date(date);
                  const diffDays = Math.round((currDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays === 1) {
                    const [prevEndH, prevEndM] = lastTimeStr.split(':').map(Number);
                    const [currStartH, currStartM] = cand.startTime.split(':').map(Number);
                    const restHours = (24 - prevEndH - prevEndM / 60) + (currStartH + currStartM / 60);
                    if (restHours < minRestHoursRequired) {
                      restCompliant = false;
                    }
                  }
                }
                if (restCompliant) {
                  selectedPoolDuty = cand;
                  break;
                }
              }
              if (selectedPoolDuty) break;
            }

            if (!selectedPoolDuty) return;

            // Resolve float pool identity:
            // If nurse has an allocated specialty in their profile, assign their own allocated specialty!
            // If nurse has NO specialty preference, do NOT assign an arbitrary specialty like specialties[0] (e.g. PCC).
            // Instead, assign as general clinical float (CLINICAL_ROLE).
            const nurseAllocatedSpecPref = nurse.preferences?.find((p) => p.kind === 'SPECIALTY');
            const matchingAllocatedSpec = nurseAllocatedSpecPref
              ? specialties.find(
                  (s) =>
                    s.id === nurseAllocatedSpecPref.refId ||
                    s.code.toLowerCase() === nurseAllocatedSpecPref.refId.toLowerCase() ||
                    s.name.toLowerCase() === nurseAllocatedSpecPref.refId.toLowerCase()
                )
              : null;

            const poolAssignment: Assignment = {
              id: `asgn-gen-${nurse.id}-${date}-POOL`,
              scheduleId: schedule.id,
              nurseId: nurse.id,
              date,
              dutyWindowId: selectedPoolDuty.id,
              kind: matchingAllocatedSpec ? 'SPECIALTY' : 'CLINICAL_ROLE',
              specialtyId: matchingAllocatedSpec ? matchingAllocatedSpec.id : undefined,
              clinicalRoleId: matchingAllocatedSpec ? undefined : 'role-float',
              locked: false,
              source: 'GENERATED',
              note: matchingAllocatedSpec
                ? `${matchingAllocatedSpec.name} Coverage / Float Pool (${selectedPoolDuty.isPriority ? 'Priority' : 'Standard'})`
                : `General Clinic / Float Pool (${selectedPoolDuty.isPriority ? 'Priority' : 'Standard'})`,
            };
            resultAssignmentsMap.set(`${nurse.id}_${date}`, poolAssignment);
            nursesAssignedToday.add(nurse.id);
            state.consecutiveWorkingDays = consecutiveDaysEndingYesterday + 1;
            state.totalDutyHoursEarned += calculateDutyDurationHours(selectedPoolDuty);
            state.lastDutyEndTime = `${date} ${selectedPoolDuty.endTime}`;
            if (isWeekend) state.weekendsWorked += 1;
            if (selectedPoolDuty.endTime >= '21:00') {
              state.consecutiveLateEnds += 1;
            } else {
              state.consecutiveLateEnds = 0;
            }
            createdCount++;
          }
        }
      });

      // End-of-Day Lifecycle: Reset consecutive working days for all nurses who took rest today
      sortedNurses.forEach((nurse) => {
        if (!nursesAssignedToday.has(nurse.id)) {
          const state = nurseStates.get(nurse.id)!;
          state.consecutiveWorkingDays = 0;
          state.consecutiveLateEnds = 0;
        }
      });
    }

    if (onProgress) {
      onProgress({
        currentDay: totalDays,
        totalDays,
        currentDate: schedule.endDate,
        statusText: 'Deterministic generation pass complete.',
        percent: 100,
      });
    }

    const durationMs = Math.round(performance.now() - startTimeMs);

    return {
      scheduleId: schedule.id,
      assignments: Array.from(resultAssignmentsMap.values()),
      createdCount,
      preservedLocksCount,
      preservedManualCount,
      unmetSlotsCount,
      generationDurationMs: durationMs,
      doctorSessionsTotal,
      doctorPriority1PairingsCount,
      doctorPriority2PairingsCount,
      doctorPriority3PlusPairingsCount,
      doctorSpecialtyPairingsCount,
      doctorFallbackPairingsCount,
      effectiveFullTimeTarget,
      periodName: resolvedPeriodName,
    };
  }
}
