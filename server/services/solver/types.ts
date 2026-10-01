/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server Solver Types & Options
 */

import { Assignment } from '../../../src/types';

export type SolverMode =
  | 'GENERATE_ALL'
  | 'FILL_UNASSIGNED'
  | 'REGENERATE_BLOCK'
  | 'REGENERATE_DATE_RANGE'
  | 'REBALANCE'
  | 'CLEAR_GENERATED';

export interface SolverOptions {
  mode?: SolverMode;
  preserveManualLocks?: boolean;
  blockIndex?: number;
  startDate?: string;
  endDate?: string;
}

export interface PreflightReport {
  scheduleId: string;
  scheduleName: string;
  startDate: string;
  endDate: string;
  readinessScore: number; // 0 to 100
  readinessStatus: 'OPTIMAL' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL';
  totalDays: number;
  totalBlocks: number;
  activeNursesCount: number;
  activeDoctorsCount: number;
  doctorSessionsCount: number;
  phlebotomySlotsCount: number;
  nurseClinicSlotsCount: number;
  existingLocksCount: number;
  existingLeaveDaysCount: number;
  estimatedTotalAssignments: number;
  eveningCoverageAlert?: string;
  staffingScaleWarning?: string;
  warnings: string[];
  doctorCoverageDemand: {
    date: string;
    requiredNurses: number;
    availableNurses: number;
    surplusOrDeficit: number;
  }[];
}

export interface SolverResult {
  scheduleId: string;
  mode: SolverMode;
  assignmentsCount: number;
  createdCount: number;
  preservedLocksCount: number;
  preservedManualCount: number;
  unmetSlotsCount: number;
  generationDurationMs: number;
  validation: {
    errorCount: number;
    warnCount: number;
    infoCount: number;
  };
  summary: string;
  assignments: Assignment[];
}
