/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * WorkingHoursPeriodService
 * Manages dedicated roster periods, cycle-specific contract working hours baselines,
 * and deterministic prorated hours calculation for schedules of arbitrary duration
 * (from a few days to a few weeks, or spanning across period boundaries).
 */

import { WorkingHoursPeriod } from '../../types';

export interface PeriodProratingBreakdown {
  periodId: string;
  periodName: string;
  year: string;
  periodTotalDays: number;
  periodTotalHours: number;
  periodDailyRate: number; // hours per calendar day
  daysCovered: number;
  contributedHours: number;
}

export interface WorkingHoursCalculationResult {
  targetHours: number;
  isExactMatch: boolean;
  matchedPeriod?: WorkingHoursPeriod;
  isProrated: boolean;
  totalScheduleDays: number;
  breakdown: PeriodProratingBreakdown[];
  fallbackDays: number;
  description: string;
}

/**
 * Compute the total inclusive calendar days between two ISO date strings (YYYY-MM-DD).
 */
export function getInclusiveDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return 0;
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Returns total days in a dedicated period.
 */
export function getDaysInPeriod(period: WorkingHoursPeriod): number {
  return Math.max(1, getInclusiveDays(period.startDate, period.endDate));
}

/**
 * Returns average hours per calendar day for a dedicated period.
 */
export function getPeriodDailyRate(period: WorkingHoursPeriod): number {
  const days = getDaysInPeriod(period);
  return period.workingHours / days;
}

/**
 * Checks if a date range exactly matches a configured dedicated period.
 */
export function findExactMatchingPeriod(
  startDate: string,
  endDate: string,
  periods: WorkingHoursPeriod[]
): WorkingHoursPeriod | undefined {
  return periods.find((p) => p.startDate === startDate && p.endDate === endDate);
}

/**
 * Generates an array of ISO date strings ('YYYY-MM-DD') between startDate and endDate.
 */
export function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return dates;

  const current = new Date(start.getTime());
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Calculate the exact working hours target for a schedule date range.
 * 
 * Logic:
 * 1. If date range exactly matches a dedicated period, return that period's working hours.
 * 2. If date range is a subset (a few days to a few weeks) or spans across periods:
 *    - Each calendar day is mapped to its containing dedicated period.
 *    - Each period's daily rate (workingHours / totalDaysInPeriod) is summed for all overlapping days.
 * 3. If any days fall outside defined periods, fallback to standard outpatient rate (40h/week = ~5.714h/day).
 * 4. The total is rounded to the nearest integer.
 */
export function calculateWorkingHoursForDateRange(
  startDate: string,
  endDate: string,
  periods: WorkingHoursPeriod[],
  fallbackHoursPerWeek = 40
): WorkingHoursCalculationResult {
  const totalScheduleDays = getInclusiveDays(startDate, endDate);

  if (totalScheduleDays <= 0) {
    return {
      targetHours: 0,
      isExactMatch: false,
      isProrated: false,
      totalScheduleDays: 0,
      breakdown: [],
      fallbackDays: 0,
      description: 'Invalid date range',
    };
  }

  // 1. Check for exact period match
  const exactMatch = findExactMatchingPeriod(startDate, endDate, periods);
  if (exactMatch) {
    const totalDays = getDaysInPeriod(exactMatch);
    const dailyRate = exactMatch.workingHours / totalDays;
    return {
      targetHours: exactMatch.workingHours,
      isExactMatch: true,
      matchedPeriod: exactMatch,
      isProrated: false,
      totalScheduleDays,
      breakdown: [
        {
          periodId: exactMatch.id,
          periodName: exactMatch.name,
          year: exactMatch.year,
          periodTotalDays: totalDays,
          periodTotalHours: exactMatch.workingHours,
          periodDailyRate: Math.round(dailyRate * 1000) / 1000,
          daysCovered: totalScheduleDays,
          contributedHours: exactMatch.workingHours,
        },
      ],
      fallbackDays: 0,
      description: `Dedicated Period ${exactMatch.name} (${exactMatch.year}): ${exactMatch.workingHours}h full-time baseline`,
    };
  }

  // 2. Schedule is for a few days to a few weeks, or overlaps boundaries
  const dates = getDatesInRange(startDate, endDate);
  const periodDayCounts = new Map<string, number>();
  let fallbackDaysCount = 0;

  dates.forEach((d) => {
    const matched = periods.find((p) => d >= p.startDate && d <= p.endDate);
    if (matched) {
      periodDayCounts.set(matched.id, (periodDayCounts.get(matched.id) || 0) + 1);
    } else {
      fallbackDaysCount += 1;
    }
  });

  const breakdown: PeriodProratingBreakdown[] = [];
  let rawHoursSum = 0;

  periodDayCounts.forEach((daysCount, periodId) => {
    const period = periods.find((p) => p.id === periodId);
    if (period) {
      const periodTotalDays = getDaysInPeriod(period);
      const dailyRate = period.workingHours / periodTotalDays;
      const contributed = dailyRate * daysCount;
      rawHoursSum += contributed;

      breakdown.push({
        periodId: period.id,
        periodName: period.name,
        year: period.year,
        periodTotalDays,
        periodTotalHours: period.workingHours,
        periodDailyRate: Math.round(dailyRate * 1000) / 1000,
        daysCovered: daysCount,
        contributedHours: Math.round(contributed * 10) / 10,
      });
    }
  });

  // Handle any fallback days outside defined periods
  if (fallbackDaysCount > 0) {
    const fallbackDailyRate = fallbackHoursPerWeek / 7;
    rawHoursSum += fallbackDailyRate * fallbackDaysCount;
  }

  const roundedTarget = Math.max(1, Math.round(rawHoursSum));
  const primaryPeriod = breakdown.length > 0 ? periods.find((p) => p.id === breakdown[0].periodId) : undefined;

  // Build human-friendly description
  let description = '';
  if (breakdown.length === 1) {
    const item = breakdown[0];
    description = `Prorated from ${item.periodName} (${item.periodTotalHours}h): ${item.daysCovered} of ${item.periodTotalDays} days = ${roundedTarget}h`;
  } else if (breakdown.length > 1) {
    const parts = breakdown.map((b) => `${b.daysCovered}d from ${b.periodName}`).join(' + ');
    description = `Prorated across periods: ${parts} = ${roundedTarget}h`;
  } else {
    description = `Standard outpatient calculation: ${totalScheduleDays} days (~${fallbackHoursPerWeek}h/week) = ${roundedTarget}h`;
  }

  return {
    targetHours: roundedTarget,
    isExactMatch: false,
    matchedPeriod: primaryPeriod,
    isProrated: true,
    totalScheduleDays,
    breakdown,
    fallbackDays: fallbackDaysCount,
    description,
  };
}
