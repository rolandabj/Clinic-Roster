/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Hours Accounting, Contract Proportions & Payroll Ledger Service (Phase 9)
 */

import {
  Schedule,
  Assignment,
  Nurse,
  DutyWindow,
  LeaveEntry,
  LeaveType,
  SeniorityLevel,
  Doctor,
  ClinicalRole,
  Specialty,
  NurseHoursQuota,
} from '../../types';

export type HoursAccountingStatus =
  | 'OPTIMAL'        // 90% - 110%
  | 'UNDER'          // 75% - 89%
  | 'CRITICAL_UNDER' // < 75%
  | 'OVER'           // 111% - 120%
  | 'CRITICAL_OVER'; // > 120%

export interface NurseDayTimelineEntry {
  date: string;
  dayIndex: number; // 1-31
  weekday: number;  // 0 = Sun, 6 = Sat
  weekdayName: string;
  isWeekend: boolean;
  type: 'DUTY' | 'LEAVE' | 'OFF';
  dutyWindow?: DutyWindow;
  assignment?: Assignment;
  doctor?: Doctor;
  clinicalRole?: ClinicalRole;
  specialty?: Specialty;
  leaveEntry?: LeaveEntry;
  leaveType?: LeaveType;
  hoursEarned: number;
  isCredited: boolean;
  notes?: string;
  source?: string;
}

export interface NurseHoursAccounting {
  nurse: Nurse;
  seniority?: SeniorityLevel;
  contractPercent: number;
  fullTimeTargetHours: number;
  targetHours: number;
  dutyHours: number;
  leaveHours: number;
  totalEarnedHours: number;
  varianceHours: number;
  pacePercent: number;
  status: HoursAccountingStatus;
  
  // Shift & Weekend Equity metrics
  totalShiftsCount: number;
  weekendShiftsCount: number;
  lateDutiesCount: number;
  dutyCountsByAcronym: Record<string, number>;
  
  // Leave Breakdown
  leaveBreakdown: Record<
    string,
    {
      leaveTypeId: string;
      name: string;
      acronym: string;
      color: string;
      daysCount: number;
      hoursCredited: number;
      countsTowardHoursTarget: boolean;
    }
  >;

  // Quota Balances
  quotas: Array<{
    leaveTypeId: string;
    leaveTypeName: string;
    annualQuotaDays?: number;
    usedDays?: number;
    remainingDays?: number;
    annualQuotaHours: number;
    usedHours: number;
    remainingHours: number;
  }>;

  // Day-by-Day Chronological Timesheet
  timeline: NurseDayTimelineEntry[];
}

export interface ClinicHoursMetrics {
  totalNurses: number;
  activeNurses: number;
  totalContractedTargetHours: number;
  totalDutyHoursWorked: number;
  totalLeaveHoursCredited: number;
  totalEarnedHours: number;
  clinicFulfillmentPercent: number;
  
  // Overtime and Deficit summaries
  totalOvertimeHours: number;
  totalDeficitHours: number;
  nursesInDeficitCount: number;
  nursesOnTrackCount: number;
  nursesInOvertimeCount: number;

  // Equity & Fairness metrics
  averageHoursPerFte: number;
  hoursFairnessIndex: number; // 0-100 score where 100 is perfectly equitable
  averageWeekendShiftsPerNurse: number;
  minWeekendShifts: number;
  maxWeekendShifts: number;
  weekendSpread: number; // max - min

  // Duty Window Distribution
  dutyTypeDistribution: Record<
    string,
    {
      dutyWindow: DutyWindow;
      shiftsCount: number;
      totalHours: number;
      percentageOfHours: number;
    }
  >;

  // Seniority Hours Distribution
  seniorityDistribution: Record<
    string,
    {
      seniority: SeniorityLevel;
      nursesCount: number;
      targetHours: number;
      earnedHours: number;
      fulfillmentPercent: number;
    }
  >;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Calculates exact duty duration from duty window start & end times.
 */
export function calculateDutyDurationHours(duty?: DutyWindow): number {
  if (!duty) return 8;
  try {
    const [sh, sm] = duty.startTime.split(':').map(Number);
    const [eh, em] = duty.endTime.split(':').map(Number);
    let duration = (eh * 60 + em - (sh * 60 + sm)) / 60;
    if (duration <= 0) {
      duration += 24; // overnight shift handling
    }
    return duration > 0 ? duration : 8;
  } catch {
    return 8;
  }
}

/**
 * Calculates hours accounting and complete timesheet timeline for a single nurse.
 */
export function calculateNurseHoursAccounting(
  nurse: Nurse,
  schedule: Schedule,
  assignments: Assignment[],
  dutyWindows: DutyWindow[],
  leaveEntries: LeaveEntry[],
  leaveTypes: LeaveType[],
  seniorityLevels: SeniorityLevel[],
  doctors: Doctor[],
  roles: ClinicalRole[],
  specialties: Specialty[],
  quotas: NurseHoursQuota[] = []
): NurseHoursAccounting {
  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const leaveTypeMap = new Map(leaveTypes.map((l) => [l.id, l]));
  const seniorityMap = new Map(seniorityLevels.map((s) => [s.id, s]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));

  const seniority = seniorityMap.get(nurse.seniorityLevelId);
  const fullTimeTargetHours = schedule.hoursTargetFullTime || 160;
  const targetHours = Math.round(fullTimeTargetHours * (nurse.contractPercent / 100));

  // Filter nurse assignments in schedule period
  const nurseAssignments = assignments.filter(
    (a) => a.nurseId === nurse.id && a.date >= schedule.startDate && a.date <= schedule.endDate
  );
  const asgnByDate = new Map<string, Assignment>();
  nurseAssignments.forEach((a) => asgnByDate.set(a.date, a));

  // Filter approved nurse leave entries overlapping schedule period
  const nurseLeaves = leaveEntries.filter(
    (le) =>
      le.nurseId === nurse.id &&
      le.approved &&
      !(le.endDate < schedule.startDate || le.startDate > schedule.endDate)
  );

  let dutyHours = 0;
  let totalShiftsCount = 0;
  let weekendShiftsCount = 0;
  let lateDutiesCount = 0;
  const dutyCountsByAcronym: Record<string, number> = {};

  nurseAssignments.forEach((a) => {
    const duty = dutyMap.get(a.dutyWindowId);
    const duration = calculateDutyDurationHours(duty);
    dutyHours += duration;
    totalShiftsCount += 1;

    const dateObj = new Date(a.date);
    const dayOfWeek = dateObj.getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekendShiftsCount += 1;
    }

    if (duty && duty.endTime >= '21:00') {
      lateDutiesCount += 1;
    }

    const acronym = duty?.acronym || 'D';
    dutyCountsByAcronym[acronym] = (dutyCountsByAcronym[acronym] || 0) + 1;
  });

  // Calculate leave hours and leave breakdown
  let leaveHours = 0;
  const leaveBreakdown: NurseHoursAccounting['leaveBreakdown'] = {};

  // Build day-by-day map of schedule dates
  const start = new Date(schedule.startDate);
  const end = new Date(schedule.endDate);
  const timeline: NurseDayTimelineEntry[] = [];

  let cur = new Date(start);
  let dayIndex = 1;

  while (cur <= end) {
    const dateStr = cur.toISOString().split('T')[0];
    const weekday = cur.getUTCDay();
    const isWeekend = weekday === 0 || weekday === 6;

    const asgn = asgnByDate.get(dateStr);
    const leave = nurseLeaves.find((le) => dateStr >= le.startDate && dateStr <= le.endDate);

    let type: 'DUTY' | 'LEAVE' | 'OFF' = 'OFF';
    let hoursEarned = 0;
    let isCredited = false;
    let dutyWindow: DutyWindow | undefined;
    let leaveType: LeaveType | undefined;
    let doctor: Doctor | undefined;
    let clinicalRole: ClinicalRole | undefined;
    let specialty: Specialty | undefined;
    let notes = '';

    if (leave) {
      type = 'LEAVE';
      leaveType = leaveTypeMap.get(leave.leaveTypeId);
      const credits = leave.hoursCredited || (leaveType?.creditedHours === 8 ? 8 : 0);

      if (leaveType?.countsTowardHoursTarget !== false) {
        hoursEarned = credits;
        isCredited = true;
        leaveHours += credits;
      }

      if (leaveType) {
        if (!leaveBreakdown[leaveType.id]) {
          leaveBreakdown[leaveType.id] = {
            leaveTypeId: leaveType.id,
            name: leaveType.name,
            acronym: leaveType.acronym,
            color: leaveType.color,
            daysCount: 0,
            hoursCredited: 0,
            countsTowardHoursTarget: leaveType.countsTowardHoursTarget !== false,
          };
        }
        leaveBreakdown[leaveType.id].daysCount += 1;
        if (leaveType.countsTowardHoursTarget !== false) {
          leaveBreakdown[leaveType.id].hoursCredited += credits;
        }
      }
      notes = leave.note || leaveType?.name || 'Approved Leave';
    } else if (asgn) {
      type = 'DUTY';
      dutyWindow = dutyMap.get(asgn.dutyWindowId);
      hoursEarned = calculateDutyDurationHours(dutyWindow);
      isCredited = true;

      if (asgn.doctorId) doctor = doctorMap.get(asgn.doctorId);
      if (asgn.clinicalRoleId) clinicalRole = roleMap.get(asgn.clinicalRoleId);
      if (asgn.specialtyId) specialty = specialtyMap.get(asgn.specialtyId);
      notes = asgn.note || '';
    }

    timeline.push({
      date: dateStr,
      dayIndex,
      weekday,
      weekdayName: WEEKDAY_NAMES[weekday],
      isWeekend,
      type,
      dutyWindow,
      assignment: asgn,
      doctor,
      clinicalRole,
      specialty,
      leaveEntry: leave,
      leaveType,
      hoursEarned,
      isCredited,
      notes,
      source: asgn?.source || (leave ? 'APPROVED_LEAVE' : 'REST_DAY'),
    });

    cur.setUTCDate(cur.getUTCDate() + 1);
    dayIndex++;
  }

  const totalEarnedHours = dutyHours + leaveHours;
  const varianceHours = totalEarnedHours - targetHours;
  const pacePercent = targetHours > 0 ? Math.round((totalEarnedHours / targetHours) * 100) : 100;

  let status: HoursAccountingStatus = 'OPTIMAL';
  if (pacePercent < 75) {
    status = 'CRITICAL_UNDER';
  } else if (pacePercent < 90) {
    status = 'UNDER';
  } else if (pacePercent > 120) {
    status = 'CRITICAL_OVER';
  } else if (pacePercent > 110) {
    status = 'OVER';
  }

  // Quotas calculations in DAYS (Annual Leave, Public Holiday, Birthday Leave; Sick Leave has no quota ceiling)
  const quotaRows = leaveTypes
    .filter(
      (lt) =>
        lt.active &&
        lt.id !== 'leave-sl' &&
        lt.acronym !== 'SL' &&
        !lt.name.toLowerCase().includes('sick')
    )
    .map((lt) => {
      const rawQuota = nurse.leaveQuotas?.[lt.id];
      const annualQuotaDays =
        typeof rawQuota === 'number' && rawQuota > 0
          ? rawQuota > 40 && rawQuota % 8 === 0
            ? rawQuota / 8
            : rawQuota
          : lt.acronym === 'AL'
          ? 30
          : lt.acronym === 'PH'
          ? 10
          : lt.acronym === 'BL'
          ? 1
          : 0;

      const usedDays = leaveBreakdown[lt.id]?.daysCount || 0;
      const annualQuotaHours = annualQuotaDays * 8;
      const usedHours = leaveBreakdown[lt.id]?.hoursCredited || 0;

      return {
        leaveTypeId: lt.id,
        leaveTypeName: lt.name,
        annualQuotaDays,
        usedDays,
        remainingDays: Math.max(0, annualQuotaDays - usedDays),
        annualQuotaHours,
        usedHours,
        remainingHours: Math.max(0, annualQuotaHours - usedHours),
      };
    });

  return {
    nurse,
    seniority,
    contractPercent: nurse.contractPercent,
    fullTimeTargetHours,
    targetHours,
    dutyHours,
    leaveHours,
    totalEarnedHours,
    varianceHours,
    pacePercent,
    status,
    totalShiftsCount,
    weekendShiftsCount,
    lateDutiesCount,
    dutyCountsByAcronym,
    leaveBreakdown,
    quotas: quotaRows,
    timeline,
  };
}

/**
 * Calculates high-level executive clinic hours accounting metrics and fairness indicators.
 */
export function calculateClinicHoursMetrics(
  nurseRows: NurseHoursAccounting[],
  dutyWindows: DutyWindow[],
  seniorityLevels: SeniorityLevel[]
): ClinicHoursMetrics {
  const totalNurses = nurseRows.length;
  const activeNurses = nurseRows.filter((r) => r.nurse.active).length;

  const totalContractedTargetHours = nurseRows.reduce((sum, r) => sum + r.targetHours, 0);
  const totalDutyHoursWorked = nurseRows.reduce((sum, r) => sum + r.dutyHours, 0);
  const totalLeaveHoursCredited = nurseRows.reduce((sum, r) => sum + r.leaveHours, 0);
  const totalEarnedHours = totalDutyHoursWorked + totalLeaveHoursCredited;

  const clinicFulfillmentPercent =
    totalContractedTargetHours > 0
      ? Math.round((totalEarnedHours / totalContractedTargetHours) * 100)
      : 100;

  let totalOvertimeHours = 0;
  let totalDeficitHours = 0;
  let nursesInDeficitCount = 0;
  let nursesOnTrackCount = 0;
  let nursesInOvertimeCount = 0;

  nurseRows.forEach((r) => {
    if (r.varianceHours > 0) {
      totalOvertimeHours += r.varianceHours;
    } else if (r.varianceHours < 0) {
      totalDeficitHours += Math.abs(r.varianceHours);
    }

    if (r.status === 'UNDER' || r.status === 'CRITICAL_UNDER') {
      nursesInDeficitCount += 1;
    } else if (r.status === 'OPTIMAL') {
      nursesOnTrackCount += 1;
    } else {
      nursesInOvertimeCount += 1;
    }
  });

  // Calculate Average Hours per Full-Time Equivalent (FTE)
  const totalFte = nurseRows.reduce((sum, r) => sum + r.contractPercent / 100, 0);
  const averageHoursPerFte = totalFte > 0 ? Math.round(totalEarnedHours / totalFte) : 0;

  // Fairness Equity Index (spread among full-time nurses)
  const fullTimeRows = nurseRows.filter((r) => r.contractPercent === 100);
  let hoursFairnessIndex = 100;
  if (fullTimeRows.length > 1) {
    const hours = fullTimeRows.map((r) => r.totalEarnedHours);
    const mean = hours.reduce((s, h) => s + h, 0) / hours.length;
    const variance =
      hours.reduce((s, h) => s + Math.pow(h - mean, 2), 0) / hours.length;
    const stdDev = Math.sqrt(variance);
    // 0 stdDev = 100 fairness score; stdDev of 20 hours drops score to ~70
    hoursFairnessIndex = Math.max(0, Math.round(100 - stdDev * 1.5));
  }

  // Weekend shifts equity
  const weekendCounts = nurseRows.map((r) => r.weekendShiftsCount);
  const averageWeekendShiftsPerNurse =
    nurseRows.length > 0
      ? Math.round(
          (weekendCounts.reduce((s, c) => s + c, 0) / nurseRows.length) * 10
        ) / 10
      : 0;
  const minWeekendShifts = weekendCounts.length > 0 ? Math.min(...weekendCounts) : 0;
  const maxWeekendShifts = weekendCounts.length > 0 ? Math.max(...weekendCounts) : 0;
  const weekendSpread = maxWeekendShifts - minWeekendShifts;

  // Duty Window Distribution
  const dutyTypeDistribution: ClinicHoursMetrics['dutyTypeDistribution'] = {};
  dutyWindows.forEach((dw) => {
    let count = 0;
    nurseRows.forEach((r) => {
      count += r.dutyCountsByAcronym[dw.acronym] || 0;
    });
    const hours = count * calculateDutyDurationHours(dw);
    const pct = totalDutyHoursWorked > 0 ? Math.round((hours / totalDutyHoursWorked) * 100) : 0;
    dutyTypeDistribution[dw.id] = {
      dutyWindow: dw,
      shiftsCount: count,
      totalHours: hours,
      percentageOfHours: pct,
    };
  });

  // Seniority Hours Distribution
  const seniorityDistribution: ClinicHoursMetrics['seniorityDistribution'] = {};
  seniorityLevels.forEach((sl) => {
    const matchingNurses = nurseRows.filter(
      (r) => r.nurse.seniorityLevelId === sl.id
    );
    const target = matchingNurses.reduce((s, n) => s + n.targetHours, 0);
    const earned = matchingNurses.reduce((s, n) => s + n.totalEarnedHours, 0);
    seniorityDistribution[sl.id] = {
      seniority: sl,
      nursesCount: matchingNurses.length,
      targetHours: target,
      earnedHours: earned,
      fulfillmentPercent: target > 0 ? Math.round((earned / target) * 100) : 100,
    };
  });

  return {
    totalNurses,
    activeNurses,
    totalContractedTargetHours,
    totalDutyHoursWorked,
    totalLeaveHoursCredited,
    totalEarnedHours,
    clinicFulfillmentPercent,
    totalOvertimeHours,
    totalDeficitHours,
    nursesInDeficitCount,
    nursesOnTrackCount,
    nursesInOvertimeCount,
    averageHoursPerFte,
    hoursFairnessIndex,
    averageWeekendShiftsPerNurse,
    minWeekendShifts,
    maxWeekendShifts,
    weekendSpread,
    dutyTypeDistribution,
    seniorityDistribution,
  };
}
