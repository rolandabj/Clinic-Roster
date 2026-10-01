/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Schedule Validation Service (Phase 8 — Complete Implementation)
 * Audits every cell update, generation pass, and manual edit.
 * 
 * Finding Categories:
 * 1. COVERAGE_GAP: Hourly deficits ("activeDoctors - activeNurses", evening tail deficits e.g. 19:00).
 * 2. STAFFING_SCALE: Pre-flight ratio warnings (e.g. 7 nurses vs 9 doctors, evening departure tails).
 * 3. RULE_VIOLATION: H1 (Senior on duty), H2 (Consecutive days <= 6), H3 (11h rest), H6 (Phlebotomy capability & quota), S1 (Consecutive late ends >= 21:00).
 * 4. HOURS_IMBALANCE: Nurse pacing < 75% or > 105%.
 * 5. DATA_ISSUE: Missing Gmail, unassigned doctor sessions, duplicate duties on same day, leave overlapping assignments.
 */

import {
  Schedule,
  Assignment,
  LeaveEntry,
  LockEntry,
  DoctorSession,
  Nurse,
  DutyWindow,
  SeniorityLevel,
  ClinicalRole,
  Rule,
  WorkingHoursPeriod,
  Specialty,
  Doctor,
} from '../../types';
import { formatDate } from '../../utils/dateUtils';
import { isExclusiveNurseClinic } from '../engine/nurseClinicUtils';
import { calculateWorkingHoursForDateRange } from '../periods/workingHoursPeriodService';
import { calculateDutyDurationHours } from '../reports/hoursAccounting';
import { resolveRule } from '../engine/SchedulingEngine';

export type FindingSeverity = 'ERROR' | 'WARN' | 'INFO';

export type FindingCategory =
  | 'COVERAGE_GAP'
  | 'STAFFING_SCALE'
  | 'RULE_VIOLATION'
  | 'HOURS_IMBALANCE'
  | 'DATA_ISSUE';

export interface ValidationFinding {
  id: string;
  category: FindingCategory;
  severity: FindingSeverity;
  message: string;
  affectedNurseIds: string[];
  cellRefs: { nurseId: string; date: string }[];
  date?: string;
  hour?: string;
}

export interface ValidationReport {
  scheduleId: string;
  timestamp: string;
  errorCount: number;
  warnCount: number;
  infoCount: number;
  findings: ValidationFinding[];
  hourlyCoverageMap: Record<string, Record<string, { nurses: number; doctors: number; deficit: number }>>;
}

export class ScheduleValidator {
  public static validate(
    schedule: Schedule,
    assignments: Assignment[],
    nurses: Nurse[],
    seniorityLevels: SeniorityLevel[],
    dutyWindows: DutyWindow[],
    sessions: DoctorSession[],
    leaveEntries: LeaveEntry[],
    locks: LockEntry[],
    roles: ClinicalRole[],
    rules: Rule[],
    workingHoursPeriods: WorkingHoursPeriod[] = [],
    specialties: Specialty[] = [],
    doctors: Doctor[] = []
  ): ValidationReport {
    const findings: ValidationFinding[] = [];
    const seniorLevelIds = new Set((seniorityLevels || []).filter((s) => s.isSenior).map((s) => s.id));
    const dutyMap = new Map((dutyWindows || []).map((d) => [d.id, d]));
    const nurseMap = new Map((nurses || []).map((n) => [n.id, n]));

    const start = new Date(schedule.startDate);
    const end = new Date(schedule.endDate);
    const datesList: string[] = [];
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      datesList.push(d.toISOString().split('T')[0]);
    }

    const hourlyCoverageMap: Record<string, Record<string, { nurses: number; doctors: number; deficit: number }>> = {};

    // 0. CATEGORY 2: STAFFING SCALE WARNINGS (Setup-time analysis)
    const activeDoctorIds = new Set(sessions.filter((s) => !s.cancelled).map((s) => s.doctorId));
    if (nurses.length < activeDoctorIds.size) {
      findings.push({
        id: `scale-ratio-warning`,
        category: 'STAFFING_SCALE',
        severity: 'WARN',
        message: `You have ${nurses.length} active nurses but ${activeDoctorIds.size} clinic doctors — expect pairing gaps on busy days.`,
        affectedNurseIds: [],
        cellRefs: [],
      });
    }

    // 1. CATEGORY 1 & 3: HOURLY COVERAGE & DAILY CLINIC LEVEL RULES
    datesList.forEach((date) => {
      hourlyCoverageMap[date] = {};
      const daySessions = sessions.filter((s) => !s.cancelled && s.date === date);
      const dayAssignments = assignments.filter((a) => a.date === date);

      // Rule: At least +1 Additional Nurse Above Doctors During Operating Hours
      const plusOneRule = resolveRule(rules, 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS', 'rule-nurse-plus-one', [
        'additional nurse',
        'above doctors',
        'plus one',
      ]);
      const plusOneEnabled = plusOneRule ? plusOneRule.enabled : true;
      const minAdditional = plusOneEnabled ? (plusOneRule?.value ?? 1) : 0;
      const isPlusOneHard = (plusOneRule?.severity || 'HARD') === 'HARD';
      const plusOneSeverity: FindingSeverity = isPlusOneHard ? 'ERROR' : 'WARN';

      // Hourly coverage tracking from 08:00 to 22:00
      for (let hour = 8; hour <= 21; hour++) {
        const hourStr = `${String(hour).padStart(2, '0')}:00`;
        const nextHourStr = `${String(hour + 1).padStart(2, '0')}:00`;

        const activeDocs = daySessions.filter(
          (s) => s.startTime < nextHourStr && s.endTime > hourStr
        ).length;

        const activeNurses = dayAssignments.filter((a) => {
          const duty = dutyMap.get(a.dutyWindowId);
          if (!duty) return false;
          return duty.startTime < nextHourStr && duty.endTime > hourStr;
        }).length;

        // If clinic is operating (either active doctors, or within 09:00-21:00 on days with sessions)
        const isClinicOperating = activeDocs > 0 || (hour >= 9 && hour <= 20 && daySessions.length > 0);
        const requiredNurses = activeDocs + (isClinicOperating ? minAdditional : 0);
        const deficit = Math.max(0, requiredNurses - activeNurses);

        hourlyCoverageMap[date][hourStr] = {
          nurses: activeNurses,
          doctors: activeDocs,
          deficit,
        };

        if (deficit > 0) {
          const dateObj = new Date(date);
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

          findings.push({
            id: `cov-gap-${date}-${hourStr}`,
            category: 'COVERAGE_GAP',
            severity: plusOneSeverity,
            message: `${dayName} ${formatDate(date)}, ${hourStr} — ${activeDocs} doctors still in session, only ${activeNurses} nurses on duty (requires at least ${requiredNurses} to maintain +${minAdditional} additional nurse ratio).`,
            affectedNurseIds: dayAssignments.map((a) => a.nurseId),
            cellRefs: dayAssignments.map((a) => ({ nurseId: a.nurseId, date })),
            date,
            hour: hourStr,
          });
        }
      }

      // Check Evening Departure Tail Scenario (19:00 boundary):
      // "If 3 nurses are still on at 19:00 and 2 leave at 19:00, only 1 remains to cover 3 evening doctors."
      const doctorsAfter19 = daySessions.filter((s) => s.endTime > '19:00').length;
      if (doctorsAfter19 > 0) {
        const nursesBefore19 = dayAssignments.filter((a) => {
          const duty = dutyMap.get(a.dutyWindowId);
          return duty && duty.startTime < '19:00' && duty.endTime >= '19:00';
        }).length;

        const nursesLeavingAt19 = dayAssignments.filter((a) => {
          const duty = dutyMap.get(a.dutyWindowId);
          return duty && duty.endTime === '19:00';
        }).length;

        const nursesRemainingAfter19 = dayAssignments.filter((a) => {
          const duty = dutyMap.get(a.dutyWindowId);
          return duty && duty.endTime > '19:00';
        }).length;

        if (nursesRemainingAfter19 < doctorsAfter19 && nursesLeavingAt19 > 0) {
          findings.push({
            id: `evening-tail-${date}`,
            category: 'COVERAGE_GAP',
            severity: 'WARN',
            message: `${date}: ${nursesBefore19} nurses active at 19:00 and ${nursesLeavingAt19} leave at 19:00, only ${nursesRemainingAfter19} remain to cover ${doctorsAfter19} evening doctors.`,
            affectedNurseIds: dayAssignments.map((a) => a.nurseId),
            cellRefs: dayAssignments.map((a) => ({ nurseId: a.nurseId, date })),
            date,
            hour: '19:00',
          });
        }
      }

      // Dedicated Nurse Clinic Rule Check
      const ncRule = resolveRule(rules, 'DEDICATED_NURSE_CLINIC', 'rule-nurse-clinic', [
        'dedicated nurse clinic',
        'nurse clinic coverage',
      ]);
      const ncRole = roles.find(
        (r) => r.id === 'role-nurse-clinic' || r.acronym === 'NC' || r.name.toLowerCase().includes('nurse clinic')
      );
      const ncEnabled = ncRule ? ncRule.enabled : true;
      const isNcHard = (ncRule?.severity || 'HARD') === 'HARD';
      const ncSeverity: FindingSeverity = isNcHard ? 'ERROR' : 'WARN';
      const ncQuota = ncEnabled ? (ncRule?.value ?? 1) : 0;

      if (ncEnabled && ncQuota > 0) {
        const assignedNcNurses = dayAssignments.filter(
          (a) =>
            a.kind === 'CLINICAL_ROLE' &&
            (a.clinicalRoleId === ncRole?.id ||
              a.clinicalRoleId === 'role-nurse-clinic' ||
              a.note?.toLowerCase().includes('nurse clinic'))
        );

        if (assignedNcNurses.length < ncQuota) {
          const dateObj = new Date(date);
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

          findings.push({
            id: `nc-coverage-${date}`,
            category: 'RULE_VIOLATION',
            severity: ncSeverity,
            message:
              isNcHard
                ? `Dedicated Nurse Clinic unassigned on ${dayName} ${formatDate(date)} (Hard Constraint violation: requires dedicated nurse not assigned to a doctor).`
                : `Dedicated Nurse Clinic unassigned on ${dayName} ${formatDate(date)} (Soft Constraint: desired ${ncQuota} dedicated nurse).`,
            affectedNurseIds: [],
            cellRefs: [],
            date,
          });
        }

        // Strict verification: Nurse dedicated to Nurse Clinic MUST NOT be assigned to a doctor
        assignedNcNurses.forEach((asgn) => {
          const nurseHasDoctorOnDate = dayAssignments.some(
            (other) => other.nurseId === asgn.nurseId && other.id !== asgn.id && other.kind === 'DOCTOR'
          );
          if (asgn.doctorId || nurseHasDoctorOnDate) {
            findings.push({
              id: `nc-doctor-conflict-${asgn.nurseId}-${date}`,
              category: 'RULE_VIOLATION',
              severity: 'ERROR',
              message: `Nurse assigned to Dedicated Nurse Clinic on ${date} cannot be assigned to a doctor.`,
              affectedNurseIds: [asgn.nurseId],
              cellRefs: [{ nurseId: asgn.nurseId, date }],
              date,
            });
          }
        });
      }

      // Rule: Exclusive Nurse Clinic Staff Must Never Be Assigned to Doctors or Specialty Pools
      nurses.forEach((nurse) => {
        if (isExclusiveNurseClinic(nurse, roles)) {
          const invalidAssignments = dayAssignments.filter(
            (a) => a.nurseId === nurse.id && (a.kind === 'DOCTOR' || a.kind === 'SPECIALTY' || !!a.doctorId)
          );
          invalidAssignments.forEach((asgn) => {
            findings.push({
              id: `exclusive-nc-doctor-conflict-${nurse.id}-${date}`,
              category: 'RULE_VIOLATION',
              severity: 'ERROR',
              message: `Nurse ${nurse.fullName} is configured as an Exclusive Nurse Clinic staff member and cannot be assigned to doctor or specialty sessions on ${date}.`,
              affectedNurseIds: [nurse.id],
              cellRefs: [{ nurseId: nurse.id, date }],
              date,
            });
          });
        }
      });

      // Rule 6: Clinical Role Quota (e.g. Blood Collection & IV / PHL)
      roles.forEach((role) => {
        const isNc =
          role.id === ncRole?.id ||
          role.acronym === 'NC' ||
          role.name.toLowerCase().includes('nurse clinic');
        if (isNc) return; // Handled specifically above by dedicated rule checker

        const assignedRoleNurses = dayAssignments.filter(
          (a) => a.kind === 'CLINICAL_ROLE' && a.clinicalRoleId === role.id
        );
        const quota = role.defaultDailyQuota || 1;
        if (assignedRoleNurses.length < quota) {
          findings.push({
            id: `role-quota-${date}-${role.acronym}`,
            category: 'RULE_VIOLATION',
            severity: 'WARN',
            message: `${role.name} (${role.acronym}) unassigned on ${date} (quota ${quota}).`,
            affectedNurseIds: [],
            cellRefs: [],
            date,
          });
        }
      });

      // Hard Rule H1: At least one senior nurse on each active duty window
      const dutiesToday = new Set(dayAssignments.map((a) => a.dutyWindowId));
      dutiesToday.forEach((dutyId) => {
        const duty = dutyMap.get(dutyId);
        const assignedToDuty = dayAssignments.filter((a) => a.dutyWindowId === dutyId);
        const hasSenior = assignedToDuty.some((a) => {
          const n = nurseMap.get(a.nurseId);
          return n && seniorLevelIds.has(n.seniorityLevelId);
        });

        if (!hasSenior && assignedToDuty.length > 0) {
          const dateObj = new Date(date);
          const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

          findings.push({
            id: `h1-senior-${date}-${dutyId}`,
            category: 'RULE_VIOLATION',
            severity: 'ERROR',
            message: `No senior nurse on ${duty?.name || 'Duty'} (${duty?.acronym || ''}) duty, ${dayName} ${formatDate(date)}.`,
            affectedNurseIds: assignedToDuty.map((a) => a.nurseId),
            cellRefs: assignedToDuty.map((a) => ({ nurseId: a.nurseId, date })),
            date,
          });
        }
      });

      // CATEGORY 5: DATA ISSUE — Doctor sessions with no nurse assigned
      daySessions.forEach((sess) => {
        const pairedNurse = dayAssignments.find(
          (a) => a.kind === 'DOCTOR' && a.doctorId === sess.doctorId
        );
        if (!pairedNurse) {
          findings.push({
            id: `unassigned-session-${sess.id}`,
            category: 'DATA_ISSUE',
            severity: 'WARN',
            message: `Doctor clinic session (${sess.startTime}–${sess.endTime}) on ${formatDate(date)} has no nurse assigned.`,
            affectedNurseIds: [],
            cellRefs: [],
            date,
          });
        }
      });
    });

    // 2. CATEGORY 3, 4 & 5: PER-NURSE RULE AUDITS (H2, H3, H4, H6, H7, S1, Hours Pacing, Data Issues)
    const s1Rule = resolveRule(rules, 'MAX_CONSECUTIVE_LATE_DUTIES', 'rule-s1', [
      'consecutive late',
      'consecutive night',
      'ending at 21:00',
      'late duties',
    ]);
    const maxLateAllowed = (s1Rule?.enabled !== false && s1Rule?.value) ? s1Rule.value : 3;
    const s1Severity: FindingSeverity = s1Rule?.severity === 'HARD' ? 'ERROR' : 'WARN';
    const s1Enabled = s1Rule ? s1Rule.enabled : true;

    const h2Rule = resolveRule(rules, 'MAX_CONSECUTIVE_DAYS', 'rule-h2', [
      'consecutive duties',
      'consecutive working days',
      'consecutive days',
    ]);
    const maxConsecutiveDaysAllowed = (h2Rule?.enabled !== false && h2Rule?.value) ? h2Rule.value : 6;
    const h2Severity: FindingSeverity = h2Rule?.severity === 'SOFT' ? 'WARN' : 'ERROR';
    const h2Enabled = h2Rule ? h2Rule.enabled : true;

    const h3Rule = resolveRule(rules, 'MIN_REST_HOURS', 'rule-h3', [
      'rest between duties',
      'minimum rest',
    ]);
    const minRestRequired = (h3Rule?.enabled !== false && h3Rule?.value) ? h3Rule.value : 11;
    const h3Severity: FindingSeverity = h3Rule?.severity === 'SOFT' ? 'WARN' : 'ERROR';
    const h3Enabled = h3Rule ? h3Rule.enabled : true;

    const h7Rule = resolveRule(rules, 'MAX_WORKING_HOURS_PER_PERIOD', 'rule-h7-max-hours', [
      'working hours',
      'max hours',
      'period hours',
      'overwork',
      'hour limit',
    ]);
    const h7Severity: FindingSeverity = h7Rule?.severity === 'SOFT' ? 'WARN' : 'ERROR';
    const h7Enabled = h7Rule ? h7Rule.enabled : true;
    const h7TolerancePct = (h7Rule?.value ? h7Rule.value : 105) / 100;

    nurses.forEach((nurse) => {
      // Data Issue: Nurse missing Gmail address
      if (!nurse.gmail || !nurse.gmail.includes('@')) {
        findings.push({
          id: `missing-gmail-${nurse.id}`,
          category: 'DATA_ISSUE',
          severity: 'ERROR',
          message: `${nurse.fullName} has no valid Gmail address and will not receive published roster notifications.`,
          affectedNurseIds: [nurse.id],
          cellRefs: [],
        });
      }

      const nurseAssignments = assignments
        .filter((a) => a.nurseId === nurse.id)
        .sort((a, b) => a.date.localeCompare(b.date));

      let consecutiveDays = 0;
      let consecutiveLateDuties = 0;
      let consecutiveLateStartDay: string | null = null;
      let totalHours = 0;

      for (let i = 0; i < datesList.length; i++) {
        const date = datesList[i];
        const asgnsToday = nurseAssignments.filter((a) => a.date === date);

        // DATA ISSUE: Duplicate duty on same day
        if (asgnsToday.length > 1) {
          findings.push({
            id: `h4-dup-${nurse.id}-${date}`,
            category: 'DATA_ISSUE',
            severity: 'ERROR',
            message: `${nurse.fullName} has duplicate assignments on ${date}.`,
            affectedNurseIds: [nurse.id],
            cellRefs: [{ nurseId: nurse.id, date }],
            date,
          });
        }

        // DATA ISSUE: Leave overlapping an assignment
        const onLeave = leaveEntries.some(
          (le) => le.nurseId === nurse.id && le.approved && date >= le.startDate && date <= le.endDate
        );
        if (onLeave && asgnsToday.length > 0) {
          findings.push({
            id: `leave-overlap-${nurse.id}-${date}`,
            category: 'DATA_ISSUE',
            severity: 'ERROR',
            message: `${nurse.fullName} is assigned to a shift on ${date} while having approved leave.`,
            affectedNurseIds: [nurse.id],
            cellRefs: [{ nurseId: nurse.id, date }],
            date,
          });
        }

        if (asgnsToday.length === 1) {
          const currentAsgn = asgnsToday[0];
          consecutiveDays++;
          const duty = dutyMap.get(currentAsgn.dutyWindowId);
          const duration = duty ? calculateDutyDurationHours(duty) : 8;
          totalHours += duration;

          // Rule H6: Capability verification (Blood Collection & IV / PHL)
          if (currentAsgn.kind === 'CLINICAL_ROLE') {
            const role = roles.find((r) => r.id === currentAsgn.clinicalRoleId);
            if (role?.acronym === 'PHL' && !nurse.capabilityIds.includes(role.id)) {
              findings.push({
                id: `h6-phl-capability-${nurse.id}-${date}`,
                category: 'RULE_VIOLATION',
                severity: 'ERROR',
                message: `${nurse.fullName} assigned to ${role.name} on ${date} but lacks certification credential.`,
                affectedNurseIds: [nurse.id],
                cellRefs: [{ nurseId: nurse.id, date }],
                date,
              });
            }
          }

          // Rule H8: Strict Nurse Profile Allocation (Only pair with doctors or specialties in nurse profile)
          const hasSpecificAllocations = nurse.preferences?.some(
            (p) => p.kind === 'DOCTOR' || p.kind === 'SPECIALTY'
          );

          if (hasSpecificAllocations) {
            if (currentAsgn.kind === 'DOCTOR' && currentAsgn.doctorId) {
              const docObj = doctors.find((d) => d.id === currentAsgn.doctorId);
              const docSession = sessions.find((s) => s.doctorId === currentAsgn.doctorId && s.date === date);
              const docSpecId = docSession?.specialtyId || docObj?.specialtyIds?.[0];
              const docSpecIds = docObj?.specialtyIds || (docSpecId ? [docSpecId] : []);

              const matchesDoctor = nurse.preferences?.some(
                (p) => p.kind === 'DOCTOR' && p.refId === currentAsgn.doctorId
              );
              const matchesSpec = nurse.preferences?.some((p) => {
                if (p.kind !== 'SPECIALTY') return false;
                if (docSpecIds.includes(p.refId)) return true;
                const pRefLower = p.refId.toLowerCase();
                for (const sid of docSpecIds) {
                  const sObj = specialties.find((s) => s.id === sid);
                  if (sObj) {
                    if (
                      pRefLower === sObj.code.toLowerCase() ||
                      pRefLower === sObj.name.toLowerCase() ||
                      (sObj.code.toLowerCase() === 'pcc' && pRefLower.includes('pcc')) ||
                      (sObj.code.toLowerCase() === 'ped' && (pRefLower.includes('ped') || pRefLower.includes('pedia')))
                    ) {
                      return true;
                    }
                  }
                }
                return false;
              });

              if (!matchesDoctor && !matchesSpec) {
                const docName = docObj ? docObj.fullName : 'Doctor';
                const docSpecName = specialties.find((s) => docSpecIds.includes(s.id))?.name || 'Department';
                findings.push({
                  id: `h8-doctor-allocation-${nurse.id}-${date}`,
                  category: 'RULE_VIOLATION',
                  severity: 'ERROR',
                  message: `${nurse.fullName} is scheduled to ${docName} (${docSpecName}) on ${formatDate(date)}, which is not allocated in their nurse profile.`,
                  affectedNurseIds: [nurse.id],
                  cellRefs: [{ nurseId: nurse.id, date }],
                  date,
                });
              }
            } else if (currentAsgn.kind === 'SPECIALTY' && currentAsgn.specialtyId) {
              const specObj = specialties.find((s) => s.id === currentAsgn.specialtyId);
              const matchesSpec = nurse.preferences?.some((p) => {
                if (p.kind !== 'SPECIALTY') return false;
                if (p.refId === currentAsgn.specialtyId) return true;
                if (specObj) {
                  const pRefLower = p.refId.toLowerCase();
                  if (
                    pRefLower === specObj.code.toLowerCase() ||
                    pRefLower === specObj.name.toLowerCase() ||
                    (specObj.code.toLowerCase() === 'pcc' && pRefLower.includes('pcc')) ||
                    (specObj.code.toLowerCase() === 'ped' && (pRefLower.includes('ped') || pRefLower.includes('pedia')))
                  ) {
                    return true;
                  }
                }
                return false;
              });

              if (!matchesSpec) {
                const specName = specObj ? `${specObj.name} (${specObj.code})` : 'Specialty';
                findings.push({
                  id: `h8-specialty-allocation-${nurse.id}-${date}`,
                  category: 'RULE_VIOLATION',
                  severity: 'ERROR',
                  message: `${nurse.fullName} is scheduled to ${specName} on ${formatDate(date)}, which is not allocated in their nurse profile.`,
                  affectedNurseIds: [nurse.id],
                  cellRefs: [{ nurseId: nurse.id, date }],
                  date,
                });
              }
            }
          }

          // Rule S1: Consecutive late duties ending at 21:00
          if (duty && duty.endTime >= '21:00') {
            if (consecutiveLateDuties === 0) {
              consecutiveLateStartDay = date;
            }
            consecutiveLateDuties++;
            if (s1Enabled && consecutiveLateDuties > maxLateAllowed) {
              findings.push({
                id: `s1-late-${nurse.id}-${date}`,
                category: 'RULE_VIOLATION',
                severity: s1Severity,
                message: `${nurse.fullName}: ${consecutiveLateDuties} consecutive duties ending at 21:00 (max ${maxLateAllowed}), ${formatDate(consecutiveLateStartDay)} to ${formatDate(date)}.`,
                affectedNurseIds: [nurse.id],
                cellRefs: [{ nurseId: nurse.id, date }],
                date,
              });
            }
          } else {
            consecutiveLateDuties = 0;
            consecutiveLateStartDay = null;
          }

          // Rule H2: Max consecutive working days
          if (h2Enabled && consecutiveDays > maxConsecutiveDaysAllowed) {
            findings.push({
              id: `h2-days-${nurse.id}-${date}`,
              category: 'RULE_VIOLATION',
              severity: h2Severity,
              message: `${nurse.fullName}: ${consecutiveDays} consecutive working days (max ${maxConsecutiveDaysAllowed}), ending ${formatDate(date)}.`,
              affectedNurseIds: [nurse.id],
              cellRefs: [{ nurseId: nurse.id, date }],
              date,
            });
          }

          // Rule H3: Minimum rest between consecutive duties
          if (h3Enabled && i > 0) {
            const yesterdayDate = datesList[i - 1];
            const yesterdayAsgns = nurseAssignments.filter((a) => a.date === yesterdayDate);
            if (yesterdayAsgns.length > 0) {
              const prevDuty = dutyMap.get(yesterdayAsgns[0].dutyWindowId);
              if (prevDuty && duty) {
                // Calculate hours between prevDuty.endTime and today duty.startTime
                const [prevEndH, prevEndM] = prevDuty.endTime.split(':').map(Number);
                const [currStartH, currStartM] = duty.startTime.split(':').map(Number);
                const restHours = (24 - prevEndH - prevEndM / 60) + (currStartH + currStartM / 60);

                if (restHours < minRestRequired) {
                  findings.push({
                    id: `h3-rest-${nurse.id}-${date}`,
                    category: 'RULE_VIOLATION',
                    severity: h3Severity,
                    message: `${nurse.fullName}: Insufficient rest (${restHours}h < ${minRestRequired}h) between duty on ${formatDate(yesterdayDate)} (ends ${prevDuty.endTime}) and ${formatDate(date)} (starts ${duty.startTime}).`,
                    affectedNurseIds: [nurse.id],
                    cellRefs: [
                      { nurseId: nurse.id, date: yesterdayDate },
                      { nurseId: nurse.id, date },
                    ],
                    date,
                  });
                }
              }
            }
          }
        } else {
          consecutiveDays = 0;
          consecutiveLateDuties = 0;
          consecutiveLateStartDay = null;
        }
      }

      // Leave credit additions
      const nurseLeave = leaveEntries.filter(
        (le) =>
          le.nurseId === nurse.id &&
          le.approved &&
          !(le.endDate < schedule.startDate || le.startDate > schedule.endDate)
      );
      nurseLeave.forEach((le) => {
        totalHours += le.hoursCredited || 8;
      });

      // Resolve authoritative full-time target hours
      let effectiveFullTimeTarget = 0;
      if (workingHoursPeriods && workingHoursPeriods.length > 0 && schedule.startDate && schedule.endDate) {
        const calc = calculateWorkingHoursForDateRange(schedule.startDate, schedule.endDate, workingHoursPeriods);
        if (calc.targetHours > 0) {
          effectiveFullTimeTarget = calc.targetHours;
        }
      }
      if (!effectiveFullTimeTarget || effectiveFullTimeTarget <= 0) {
        effectiveFullTimeTarget = schedule.hoursTargetFullTime || 160;
      }

      // CATEGORY 4: HOURS IMBALANCE CHECKS & RULE H7 (Maximum Working Hours Limit)
      const target = Math.round(effectiveFullTimeTarget * (nurse.contractPercent / 100));
      const maxAllowed = Math.max(target, Math.min(target + 8, Math.round(target * h7TolerancePct)));
      const paceRatio = target > 0 ? totalHours / target : 1;

      if (paceRatio < 0.75) {
        const delta = totalHours - target;
        findings.push({
          id: `hours-low-${nurse.id}`,
          category: 'HOURS_IMBALANCE',
          severity: 'WARN',
          message: `${nurse.fullName} at ${totalHours}h vs target ${target}h (${delta}h projected deficit, ${Math.round(paceRatio * 100)}% pace).`,
          affectedNurseIds: [nurse.id],
          cellRefs: [],
        });
      } else if (h7Enabled && (totalHours > maxAllowed || paceRatio > 1.05)) {
        const delta = totalHours - target;
        findings.push({
          id: `h7-hours-over-${nurse.id}`,
          category: h7Severity === 'ERROR' ? 'RULE_VIOLATION' : 'HOURS_IMBALANCE',
          severity: h7Severity,
          message: `${nurse.fullName} at ${totalHours}h vs target ${target}h (+${delta}h overtime, ${Math.round(paceRatio * 100)}% pace; maximum allowable limit is ${maxAllowed}h).`,
          affectedNurseIds: [nurse.id],
          cellRefs: nurseAssignments.map((a) => ({ nurseId: a.nurseId, date: a.date })),
        });
      } else if (paceRatio > 1.05) {
        const delta = totalHours - target;
        findings.push({
          id: `hours-over-${nurse.id}`,
          category: 'HOURS_IMBALANCE',
          severity: 'WARN',
          message: `${nurse.fullName} at ${totalHours}h vs target ${target}h (+${delta}h overtime, ${Math.round(paceRatio * 100)}% pace).`,
          affectedNurseIds: [nurse.id],
          cellRefs: nurseAssignments.map((a) => ({ nurseId: a.nurseId, date: a.date })),
        });
      }
    });

    const errorCount = findings.filter((f) => f.severity === 'ERROR').length;
    const warnCount = findings.filter((f) => f.severity === 'WARN').length;
    const infoCount = findings.filter((f) => f.severity === 'INFO').length;

    return {
      scheduleId: schedule.id,
      timestamp: new Date().toISOString(),
      errorCount,
      warnCount,
      infoCount,
      findings,
      hourlyCoverageMap,
    };
  }
}
