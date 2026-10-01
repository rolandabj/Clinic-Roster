/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Comprehensive Roster Export Engine (Phase 11)
 * Supports Multi-Sheet Excel (.xlsx via SheetJS), Matrix/Long CSV, and Formatted Print Datasets.
 */

import * as XLSX from 'xlsx';
import {
  Schedule,
  Assignment,
  Nurse,
  DutyWindow,
  LeaveEntry,
  LeaveType,
  SeniorityLevel,
  Doctor,
  DoctorSession,
  ClinicalRole,
  Specialty,
  Rule,
} from '../../types';
import {
  calculateNurseHoursAccounting,
  calculateDutyDurationHours,
  NurseHoursAccounting,
} from '../reports/hoursAccounting';

export interface RosterExportOptions {
  clinicName: string;
  schedule: Schedule;
  assignments: Assignment[];
  nurses: Nurse[];
  dutyWindows: DutyWindow[];
  leaveEntries: LeaveEntry[];
  leaveTypes: LeaveType[];
  seniorityLevels: SeniorityLevel[];
  doctors: Doctor[];
  sessions: DoctorSession[];
  roles: ClinicalRole[];
  specialties: Specialty[];
  rules?: Rule[];
  versionNumber?: number;
  blockIndex?: number; // Optional specific block export
  blockDates?: string[]; // Optional specific block dates
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sanitizeFileName(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-\.]/g, '_').toLowerCase();
}

/**
 * Builds the date array for a schedule or block.
 */
export function getScheduleDates(startDate: string, endDate: string): string[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const dates: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

/**
 * 1. Excel (.xlsx) Multi-Sheet Workbook Export
 */
export function exportRosterToExcel(options: RosterExportOptions) {
  const {
    clinicName,
    schedule,
    assignments,
    nurses,
    dutyWindows,
    leaveEntries,
    leaveTypes,
    seniorityLevels,
    doctors,
    sessions,
    roles,
    specialties,
    rules = [],
    versionNumber = schedule.activeVersionNumber || 1,
    blockDates,
  } = options;

  const dates = blockDates && blockDates.length > 0 ? blockDates : getScheduleDates(schedule.startDate, schedule.endDate);

  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));
  const seniorityMap = new Map(seniorityLevels.map((s) => [s.id, s]));
  const leaveTypeMap = new Map(leaveTypes.map((l) => [l.id, l]));

  const wb = XLSX.utils.book_new();

  // ----------------------------------------------------
  // Sheet 1: Roster Grid Sheet
  // ----------------------------------------------------
  const rosterAoa: any[][] = [];

  // Title / Metadata Banner Rows
  rosterAoa.push([clinicName.toUpperCase(), '', '', '', '', `SCHEDULE: ${schedule.name}`, '', '', `VERSION: v${versionNumber}`]);
  rosterAoa.push([`Period: ${schedule.startDate} to ${schedule.endDate}`, '', '', '', '', `Target: ${schedule.hoursTargetFullTime}h Full-Time`, '', '', `Exported: ${new Date().toLocaleString()}`]);
  rosterAoa.push([]); // blank separator

  // Header Row: Staff info + Dates
  const headerRow: string[] = ['Employee Code', 'Full Name', 'Seniority', 'Contract %', 'Total Hours'];
  dates.forEach((d) => {
    const dayObj = new Date(d);
    const dayName = WEEKDAY_NAMES[dayObj.getUTCDay()];
    headerRow.push(`${d} (${dayName})`);
  });
  rosterAoa.push(headerRow);

  // Compute nurse accounting for total hours column
  const nurseAccountingMap = new Map<string, NurseHoursAccounting>();
  nurses.forEach((nurse) => {
    const acct = calculateNurseHoursAccounting(
      nurse,
      schedule,
      assignments,
      dutyWindows,
      leaveEntries,
      leaveTypes,
      seniorityLevels,
      doctors,
      roles,
      specialties
    );
    nurseAccountingMap.set(nurse.id, acct);
  });

  // Nurse Rows
  nurses.forEach((nurse) => {
    const seniority = seniorityMap.get(nurse.seniorityLevelId);
    const acct = nurseAccountingMap.get(nurse.id);

    const row: any[] = [
      nurse.employeeCode,
      nurse.fullName,
      seniority?.name || 'Staff',
      `${nurse.contractPercent}%`,
      `${acct?.totalEarnedHours || 0}h`,
    ];

    // Assignment/Leave cell per date
    dates.forEach((dateStr) => {
      const asgn = assignments.find((a) => a.nurseId === nurse.id && a.date === dateStr);
      const leave = leaveEntries.find(
        (le) => le.nurseId === nurse.id && le.approved && dateStr >= le.startDate && dateStr <= le.endDate
      );

      if (leave) {
        const lt = leaveTypeMap.get(leave.leaveTypeId);
        row.push(lt ? `${lt.acronym} (${lt.name})` : 'LEAVE');
      } else if (asgn) {
        const duty = dutyMap.get(asgn.dutyWindowId);
        let targetLabel = '';
        if (asgn.doctorId) {
          const doc = doctorMap.get(asgn.doctorId);
          targetLabel = doc ? doc.fullName.replace('Dr. ', '') : 'Doctor';
        } else if (asgn.clinicalRoleId) {
          const r = roleMap.get(asgn.clinicalRoleId);
          targetLabel = r ? r.acronym : 'ROLE';
        } else if (asgn.specialtyId) {
          const s = specialtyMap.get(asgn.specialtyId);
          targetLabel = s ? s.code : 'POOL';
        }
        row.push(`${duty?.acronym || 'D'} (${targetLabel || duty?.name || ''})`);
      } else {
        row.push('—');
      }
    });

    rosterAoa.push(row);
  });

  const rosterWs = XLSX.utils.aoa_to_sheet(rosterAoa);
  XLSX.utils.book_append_sheet(wb, rosterWs, 'Roster');

  // ----------------------------------------------------
  // Sheet 2: Legend Sheet
  // ----------------------------------------------------
  const legendAoa: any[][] = [];
  legendAoa.push(['CLINICROSTER WORKBOOK REFERENCE & LEGEND']);
  legendAoa.push([`Clinic: ${clinicName}`, `Schedule: ${schedule.name}`, `Version: v${versionNumber}`]);
  legendAoa.push([]);

  // Duty Windows
  legendAoa.push(['1. DUTY WINDOWS']);
  legendAoa.push(['Acronym', 'Name', 'Start Time', 'End Time', 'Duration (Hours)', 'Color']);
  dutyWindows.forEach((dw) => {
    legendAoa.push([dw.acronym, dw.name, dw.startTime, dw.endTime, `${calculateDutyDurationHours(dw)}h`, dw.color]);
  });
  legendAoa.push([]);

  // Leave Types
  legendAoa.push(['2. LEAVE TYPES']);
  legendAoa.push(['Acronym', 'Leave Type Name', 'Credited Hours', 'Counts Toward Target']);
  leaveTypes.forEach((lt) => {
    legendAoa.push([
      lt.acronym,
      lt.name,
      typeof lt.creditedHours === 'number' ? `${lt.creditedHours}h` : 'Match Duty',
      lt.countsTowardHoursTarget ? 'YES' : 'NO',
    ]);
  });
  legendAoa.push([]);

  // Seniority Levels
  legendAoa.push(['3. SENIORITY LEVELS']);
  legendAoa.push(['Rank', 'Level Name', 'Senior On Duty Flag']);
  seniorityLevels.forEach((sl) => {
    legendAoa.push([sl.rank, sl.name, sl.isSenior ? 'YES (Senior)' : 'NO']);
  });
  legendAoa.push([]);

  // Clinical Support Roles
  legendAoa.push(['4. CLINICAL SUPPORT ROLES']);
  legendAoa.push(['Acronym', 'Role Name', 'Description', 'Default Daily Quota']);
  roles.forEach((r) => {
    legendAoa.push([r.acronym, r.name, r.description, `${r.defaultDailyQuota}/day`]);
  });
  legendAoa.push([]);

  // Rules Presets
  if (rules.length > 0) {
    legendAoa.push(['5. ACTIVE SCHEDULING RULES']);
    legendAoa.push(['Rule Name', 'Severity', 'Scope', 'Metric', 'Limit Value']);
    rules.forEach((r) => {
      legendAoa.push([r.name, r.severity, r.scope, r.metric, r.value]);
    });
  }

  const legendWs = XLSX.utils.aoa_to_sheet(legendAoa);
  XLSX.utils.book_append_sheet(wb, legendWs, 'Legend');

  // ----------------------------------------------------
  // Sheet 3: Long Sheet (One row per assignment for database/pivot)
  // ----------------------------------------------------
  const longAoa: any[][] = [];
  longAoa.push([
    'Date',
    'Day of Week',
    'Is Weekend',
    'Employee Code',
    'Nurse Full Name',
    'Seniority Level',
    'Duty Acronym',
    'Duty Name',
    'Start Time',
    'End Time',
    'Duration Hours',
    'Assignment Kind',
    'Assigned Target',
    'Source',
    'Locked',
    'Notes',
  ]);

  assignments.forEach((a) => {
    const nurse = nurseMap.get(a.nurseId);
    const seniority = nurse ? seniorityMap.get(nurse.seniorityLevelId) : undefined;
    const duty = dutyMap.get(a.dutyWindowId);

    const dateObj = new Date(a.date);
    const weekday = WEEKDAY_NAMES[dateObj.getUTCDay()];
    const isWeekend = dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6;

    let targetName = 'Specialty Pool';
    if (a.doctorId) {
      const doc = doctorMap.get(a.doctorId);
      targetName = doc ? doc.fullName : 'Doctor';
    } else if (a.clinicalRoleId) {
      const role = roleMap.get(a.clinicalRoleId);
      targetName = role ? role.name : 'Clinical Role';
    } else if (a.specialtyId) {
      const spec = specialtyMap.get(a.specialtyId);
      targetName = spec ? `${spec.name} Pool` : 'Specialty Pool';
    }

    longAoa.push([
      a.date,
      weekday,
      isWeekend ? 'YES' : 'NO',
      nurse?.employeeCode || a.nurseId,
      nurse?.fullName || a.nurseId,
      seniority?.name || 'Staff',
      duty?.acronym || 'D',
      duty?.name || 'Full Day',
      duty?.startTime || '09:00',
      duty?.endTime || '21:00',
      calculateDutyDurationHours(duty),
      a.kind,
      targetName,
      a.source,
      a.locked ? 'YES' : 'NO',
      a.note || '',
    ]);
  });

  const longWs = XLSX.utils.aoa_to_sheet(longAoa);
  XLSX.utils.book_append_sheet(wb, longWs, 'Long');

  // ----------------------------------------------------
  // Sheet 4: Hours Sheet (Phase 9 Hours Accounting Table)
  // ----------------------------------------------------
  const hoursAoa: any[][] = [];
  hoursAoa.push([
    'Employee Code',
    'Full Name',
    'Seniority',
    'Contract %',
    'Target Hours',
    'Duty Hours Earned',
    'Leave Hours Credited',
    'Total Earned Hours',
    'Net Variance Hours',
    'Pace %',
    'Weekend Shifts Count',
    'Late Duties Count (21:00)',
    'Accounting Status',
  ]);

  nurses.forEach((nurse) => {
    const acct = nurseAccountingMap.get(nurse.id);
    if (!acct) return;

    hoursAoa.push([
      nurse.employeeCode,
      nurse.fullName,
      acct.seniority?.name || 'Staff',
      `${acct.contractPercent}%`,
      acct.targetHours,
      acct.dutyHours,
      acct.leaveHours,
      acct.totalEarnedHours,
      acct.varianceHours > 0 ? `+${acct.varianceHours}` : acct.varianceHours,
      `${acct.pacePercent}%`,
      acct.weekendShiftsCount,
      acct.lateDutiesCount,
      acct.status,
    ]);
  });

  const hoursWs = XLSX.utils.aoa_to_sheet(hoursAoa);
  XLSX.utils.book_append_sheet(wb, hoursWs, 'Hours');

  // ----------------------------------------------------
  // Sheet 5: Doctors Sheet (Doctor clinic sessions schedule)
  // ----------------------------------------------------
  const docsAoa: any[][] = [];
  docsAoa.push([
    'Date',
    'Day of Week',
    'Doctor Name',
    'Specialty',
    'Start Time',
    'End Time',
    'Room',
    'Session Source',
    'Cancelled',
    'Paired Nurse',
  ]);

  const scheduleSessions = sessions.filter(
    (sess) => sess.date >= schedule.startDate && sess.date <= schedule.endDate
  );

  scheduleSessions.forEach((sess) => {
    const doc = doctorMap.get(sess.doctorId);
    const spec = specialtyMap.get(sess.specialtyId);
    const dateObj = new Date(sess.date);
    const weekday = WEEKDAY_NAMES[dateObj.getUTCDay()];

    // Find paired nurse
    const asgn = assignments.find(
      (a) => a.date === sess.date && a.doctorId === sess.doctorId
    );
    const pairedNurse = asgn ? nurseMap.get(asgn.nurseId)?.fullName : 'Unassigned';

    docsAoa.push([
      sess.date,
      weekday,
      doc?.fullName || sess.doctorId,
      spec?.name || 'Clinic',
      sess.startTime,
      sess.endTime,
      sess.room || 'General',
      sess.source,
      sess.cancelled ? 'CANCELLED' : 'ACTIVE',
      pairedNurse,
    ]);
  });

  const docsWs = XLSX.utils.aoa_to_sheet(docsAoa);
  XLSX.utils.book_append_sheet(wb, docsWs, 'Doctors');

  // ----------------------------------------------------
  // File Name generation: {clinic}_{periodStart}_{periodEnd}_v{n}.xlsx
  // ----------------------------------------------------
  const cleanClinic = sanitizeFileName(clinicName);
  const fileName = `${cleanClinic}_${schedule.startDate}_${schedule.endDate}_v${versionNumber}.xlsx`;

  XLSX.writeFile(wb, fileName);
  return wb;
}

/**
 * 2.1 CSV Matrix Format Export
 */
export function exportRosterToCsvMatrix(options: RosterExportOptions): string {
  const {
    clinicName,
    schedule,
    assignments,
    nurses,
    dutyWindows,
    leaveEntries,
    leaveTypes,
    seniorityLevels,
    doctors,
    roles,
    specialties,
    versionNumber = schedule.activeVersionNumber || 1,
    blockDates,
  } = options;

  const dates = blockDates && blockDates.length > 0 ? blockDates : getScheduleDates(schedule.startDate, schedule.endDate);
  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));
  const leaveTypeMap = new Map(leaveTypes.map((l) => [l.id, l]));

  const headers = ['Employee Code', 'Full Name', 'Contract %', ...dates];
  const lines: string[] = [headers.join(',')];

  nurses.forEach((nurse) => {
    const row: string[] = [
      `"${nurse.employeeCode}"`,
      `"${nurse.fullName}"`,
      `${nurse.contractPercent}%`,
    ];

    dates.forEach((dateStr) => {
      const asgn = assignments.find((a) => a.nurseId === nurse.id && a.date === dateStr);
      const leave = leaveEntries.find(
        (le) => le.nurseId === nurse.id && le.approved && dateStr >= le.startDate && dateStr <= le.endDate
      );

      if (leave) {
        const lt = leaveTypeMap.get(leave.leaveTypeId);
        row.push(`"${lt?.acronym || 'LEAVE'}"`);
      } else if (asgn) {
        const duty = dutyMap.get(asgn.dutyWindowId);
        let targetLabel = '';
        if (asgn.doctorId) {
          const doc = doctorMap.get(asgn.doctorId);
          targetLabel = doc ? doc.fullName.replace('Dr. ', '') : '';
        } else if (asgn.clinicalRoleId) {
          const r = roleMap.get(asgn.clinicalRoleId);
          targetLabel = r ? r.acronym : '';
        } else if (asgn.specialtyId) {
          const s = specialtyMap.get(asgn.specialtyId);
          targetLabel = s ? s.code : '';
        }
        const cellText = targetLabel ? `${duty?.acronym || 'D'}-${targetLabel}` : duty?.acronym || 'D';
        row.push(`"${cellText}"`);
      } else {
        row.push('"—"');
      }
    });

    lines.push(row.join(','));
  });

  const csvContent = lines.join('\n');
  if (typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanClinic = sanitizeFileName(clinicName);
    a.setAttribute('download', `${cleanClinic}_matrix_${schedule.startDate}_${schedule.endDate}_v${versionNumber}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  return csvContent;
}

/**
 * 2.2 CSV Long Format Export (One row per assignment)
 */
export function exportRosterToCsvLong(options: RosterExportOptions): string {
  const {
    clinicName,
    schedule,
    assignments,
    nurses,
    dutyWindows,
    seniorityLevels,
    doctors,
    roles,
    specialties,
    versionNumber = schedule.activeVersionNumber || 1,
  } = options;

  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));
  const seniorityMap = new Map(seniorityLevels.map((s) => [s.id, s]));

  const headers = [
    'Date',
    'Day of Week',
    'Employee Code',
    'Full Name',
    'Seniority',
    'Duty Acronym',
    'Duty Times',
    'Hours',
    'Assignment Kind',
    'Target Name',
    'Source',
    'Locked',
    'Notes',
  ];

  const lines: string[] = [headers.join(',')];

  assignments.forEach((a) => {
    const nurse = nurseMap.get(a.nurseId);
    const seniority = nurse ? seniorityMap.get(nurse.seniorityLevelId) : undefined;
    const duty = dutyMap.get(a.dutyWindowId);

    const dateObj = new Date(a.date);
    const weekday = WEEKDAY_NAMES[dateObj.getUTCDay()];

    let targetName = 'Specialty Pool';
    if (a.doctorId) {
      const doc = doctorMap.get(a.doctorId);
      targetName = doc ? doc.fullName : 'Doctor';
    } else if (a.clinicalRoleId) {
      const role = roleMap.get(a.clinicalRoleId);
      targetName = role ? role.name : 'Clinical Role';
    } else if (a.specialtyId) {
      const spec = specialtyMap.get(a.specialtyId);
      targetName = spec ? `${spec.name} Pool` : 'Specialty Pool';
    }

    lines.push(
      [
        a.date,
        weekday,
        `"${nurse?.employeeCode || a.nurseId}"`,
        `"${nurse?.fullName || a.nurseId}"`,
        `"${seniority?.name || 'Staff'}"`,
        `"${duty?.acronym || 'D'}"`,
        `"${duty?.startTime || '09:00'}–${duty?.endTime || '21:00'}"`,
        calculateDutyDurationHours(duty),
        a.kind,
        `"${targetName}"`,
        a.source,
        a.locked ? 'YES' : 'NO',
        `"${a.note || ''}"`,
      ].join(',')
    );
  });

  const csvContent = lines.join('\n');
  if (typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanClinic = sanitizeFileName(clinicName);
    a.setAttribute('download', `${cleanClinic}_long_${schedule.startDate}_${schedule.endDate}_v${versionNumber}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  return csvContent;
}
