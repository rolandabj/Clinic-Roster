/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Schedule Version Diff & Change Tracking Engine (Phase 10 & Phase 13)
 */

import {
  Assignment,
  DutyWindow,
  Nurse,
  Doctor,
  ClinicalRole,
  Specialty,
  ScheduleVersion,
} from '../../types';

export type ChangeType = 'ADDED' | 'REMOVED' | 'MODIFIED';

export interface FormattedAssignmentState {
  dutyWindowId: string;
  dutyAcronym: string;
  dutyName: string;
  dutyTimes: string;
  dutyColor: string;
  kind: string;
  targetName: string;
  source: string;
  locked: boolean;
}

export interface AssignmentDiffItem {
  id: string; // `${nurseId}_${date}`
  nurseId: string;
  nurseName: string;
  date: string;
  weekday: string;
  changeType: ChangeType;
  before?: FormattedAssignmentState;
  after?: FormattedAssignmentState;
  description: string;
}

export interface ScheduleVersionDiff {
  baseVersionNumber?: number;
  baseVersionLabel: string;
  targetVersionNumber?: number;
  targetVersionLabel: string;
  timestamp: string;
  totalChangesCount: number;
  addedCount: number;
  removedCount: number;
  modifiedCount: number;
  allChanges: AssignmentDiffItem[];
  changesByNurse: Record<string, AssignmentDiffItem[]>;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatAssignment(
  asgn: Assignment,
  dutyMap: Map<string, DutyWindow>,
  doctorMap: Map<string, Doctor>,
  roleMap: Map<string, ClinicalRole>,
  specialtyMap: Map<string, Specialty>
): FormattedAssignmentState {
  const duty = dutyMap.get(asgn.dutyWindowId);
  let targetName = 'Specialty Pool';

  if (asgn.doctorId) {
    const doc = doctorMap.get(asgn.doctorId);
    targetName = doc ? doc.fullName : 'Doctor';
  } else if (asgn.clinicalRoleId) {
    const role = roleMap.get(asgn.clinicalRoleId);
    targetName = role ? role.name : 'Clinical Role';
  } else if (asgn.specialtyId) {
    const spec = specialtyMap.get(asgn.specialtyId);
    targetName = spec ? `${spec.name} Pool` : 'Specialty Pool';
  }

  return {
    dutyWindowId: asgn.dutyWindowId,
    dutyAcronym: duty?.acronym || 'D',
    dutyName: duty?.name || 'Duty',
    dutyTimes: duty ? `${duty.startTime}–${duty.endTime}` : '09:00–21:00',
    dutyColor: duty?.color || '#3b82f6',
    kind: asgn.kind,
    targetName,
    source: asgn.source,
    locked: asgn.locked,
  };
}

/**
 * Computes exact cell-by-cell diff between two sets of assignments.
 * Works between any two historical versions, or between a version and the active draft.
 */
export function computeScheduleDiff(
  baseAssignments: Assignment[],
  targetAssignments: Assignment[],
  nurses: Nurse[],
  dutyWindows: DutyWindow[],
  doctors: Doctor[],
  roles: ClinicalRole[],
  specialties: Specialty[],
  baseLabel = 'Base Version',
  targetLabel = 'Target Version',
  baseVersionNumber?: number,
  targetVersionNumber?: number
): ScheduleVersionDiff {
  const dutyMap = new Map(dutyWindows.map((d) => [d.id, d]));
  const nurseMap = new Map(nurses.map((n) => [n.id, n]));
  const doctorMap = new Map(doctors.map((d) => [d.id, d]));
  const roleMap = new Map(roles.map((r) => [r.id, r]));
  const specialtyMap = new Map(specialties.map((s) => [s.id, s]));

  // Index assignments by `${nurseId}_${date}`
  const baseMap = new Map<string, Assignment>();
  baseAssignments.forEach((a) => baseMap.set(`${a.nurseId}_${a.date}`, a));

  const targetMap = new Map<string, Assignment>();
  targetAssignments.forEach((a) => targetMap.set(`${a.nurseId}_${a.date}`, a));

  // Collect all unique keys
  const allKeys = new Set<string>([...baseMap.keys(), ...targetMap.keys()]);

  const allChanges: AssignmentDiffItem[] = [];
  const changesByNurse: Record<string, AssignmentDiffItem[]> = {};

  let addedCount = 0;
  let removedCount = 0;
  let modifiedCount = 0;

  allKeys.forEach((key) => {
    const baseAsgn = baseMap.get(key);
    const targetAsgn = targetMap.get(key);

    const [nurseId, date] = key.split('_');
    const nurse = nurseMap.get(nurseId);
    const nurseName = nurse ? nurse.fullName : nurseId;

    const dateObj = new Date(date);
    const weekday = !isNaN(dateObj.getTime())
      ? WEEKDAY_NAMES[dateObj.getUTCDay()]
      : '';

    // Case 1: Added assignment
    if (!baseAsgn && targetAsgn) {
      const formattedAfter = formatAssignment(
        targetAsgn,
        dutyMap,
        doctorMap,
        roleMap,
        specialtyMap
      );
      addedCount++;
      const item: AssignmentDiffItem = {
        id: key,
        nurseId,
        nurseName,
        date,
        weekday,
        changeType: 'ADDED',
        after: formattedAfter,
        description: `${weekday} ${date}: assigned ${formattedAfter.dutyName} (${formattedAfter.dutyAcronym} ${formattedAfter.dutyTimes}) with ${formattedAfter.targetName}`,
      };
      allChanges.push(item);
      if (!changesByNurse[nurseId]) changesByNurse[nurseId] = [];
      changesByNurse[nurseId].push(item);
    }
    // Case 2: Removed assignment
    else if (baseAsgn && !targetAsgn) {
      const formattedBefore = formatAssignment(
        baseAsgn,
        dutyMap,
        doctorMap,
        roleMap,
        specialtyMap
      );
      removedCount++;
      const item: AssignmentDiffItem = {
        id: key,
        nurseId,
        nurseName,
        date,
        weekday,
        changeType: 'REMOVED',
        before: formattedBefore,
        description: `${weekday} ${date}: removed ${formattedBefore.dutyName} (${formattedBefore.dutyAcronym} ${formattedBefore.dutyTimes}) with ${formattedBefore.targetName}`,
      };
      allChanges.push(item);
      if (!changesByNurse[nurseId]) changesByNurse[nurseId] = [];
      changesByNurse[nurseId].push(item);
    }
    // Case 3: Both exist — check if anything changed
    else if (baseAsgn && targetAsgn) {
      const isDutyChanged = baseAsgn.dutyWindowId !== targetAsgn.dutyWindowId;
      const isTargetChanged =
        baseAsgn.doctorId !== targetAsgn.doctorId ||
        baseAsgn.clinicalRoleId !== targetAsgn.clinicalRoleId ||
        baseAsgn.specialtyId !== targetAsgn.specialtyId ||
        baseAsgn.kind !== targetAsgn.kind;
      const isLockChanged = baseAsgn.locked !== targetAsgn.locked;

      if (isDutyChanged || isTargetChanged || isLockChanged) {
        const formattedBefore = formatAssignment(
          baseAsgn,
          dutyMap,
          doctorMap,
          roleMap,
          specialtyMap
        );
        const formattedAfter = formatAssignment(
          targetAsgn,
          dutyMap,
          doctorMap,
          roleMap,
          specialtyMap
        );
        modifiedCount++;

        let desc = `${weekday} ${date}: `;
        if (isDutyChanged && isTargetChanged) {
          desc += `changed ${formattedBefore.dutyAcronym} (${formattedBefore.targetName}) → ${formattedAfter.dutyAcronym} (${formattedAfter.targetName})`;
        } else if (isDutyChanged) {
          desc += `changed shift ${formattedBefore.dutyName} (${formattedBefore.dutyTimes}) → ${formattedAfter.dutyName} (${formattedAfter.dutyTimes})`;
        } else if (isTargetChanged) {
          desc += `changed pairing ${formattedBefore.targetName} → ${formattedAfter.targetName}`;
        } else {
          desc += `updated lock status`;
        }

        const item: AssignmentDiffItem = {
          id: key,
          nurseId,
          nurseName,
          date,
          weekday,
          changeType: 'MODIFIED',
          before: formattedBefore,
          after: formattedAfter,
          description: desc,
        };
        allChanges.push(item);
        if (!changesByNurse[nurseId]) changesByNurse[nurseId] = [];
        changesByNurse[nurseId].push(item);
      }
    }
  });

  // Sort changes chronologically by date then nurse name
  allChanges.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.nurseName.localeCompare(b.nurseName);
  });

  return {
    baseVersionNumber,
    baseVersionLabel: baseLabel,
    targetVersionNumber,
    targetVersionLabel: targetLabel,
    timestamp: new Date().toISOString(),
    totalChangesCount: allChanges.length,
    addedCount,
    removedCount,
    modifiedCount,
    allChanges,
    changesByNurse,
  };
}
