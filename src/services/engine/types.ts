/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Scheduling Engine Contract & Types
 */

import {
  Schedule,
  Assignment,
  LeaveEntry,
  LockEntry,
  DoctorSession,
  Nurse,
  DutyWindow,
  ClinicalRole,
  Specialty,
  Rule,
  WorkingHoursPeriod,
} from '../../types';

export interface GenerationProgress {
  currentDay: number;
  totalDays: number;
  currentDate: string;
  statusText: string;
  percent: number;
}

export type GenerationProgressCallback = (progress: GenerationProgress) => void;

export type RegenerateMode =
  | 'GENERATE_ALL'
  | 'EMPTY_ONLY'
  | 'REBALANCE'
  | 'CLEAR_GENERATED';

export interface GenerationPreflightSummary {
  scheduleName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  totalBlocks: number;
  activeNursesCount: number;
  activeDoctorsCount: number;
  doctorSessionsCount: number;
  phlebotomySlotsCount: number;
  nurseClinicSlotsCount?: number;
  nurseClinicRuleSeverity?: 'HARD' | 'SOFT';
  nurseClinicRuleEnabled?: boolean;
  existingLocksCount: number;
  existingLeaveDaysCount: number;
  estimatedTotalAssignments: number;
  priorityDutiesCount?: number;
  standardDutiesCount?: number;
  eveningCoverageAlert?: string;
  staffingScaleWarning?: string;
  detectedPeriodName?: string;
  targetWorkingHoursFullTime?: number;
  isProratedPeriod?: boolean;
  hoursTargetDescription?: string;
}

export interface GenerationResult {
  scheduleId: string;
  assignments: Assignment[];
  createdCount: number;
  preservedLocksCount: number;
  preservedManualCount: number;
  unmetSlotsCount: number;
  generationDurationMs: number;
  doctorSessionsTotal?: number;
  doctorPriority1PairingsCount?: number;
  doctorPriority2PairingsCount?: number;
  doctorPriority3PlusPairingsCount?: number;
  doctorSpecialtyPairingsCount?: number;
  doctorFallbackPairingsCount?: number;
  effectiveFullTimeTarget?: number;
  periodName?: string;
}
