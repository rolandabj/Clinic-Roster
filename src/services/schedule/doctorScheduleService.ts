/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Doctor Schedule & Session Management Service
 * Provides helper functions to create, update, or remove single-day doctor shifts
 * as well as recurring weekly patterns across a schedule.
 */

import { IRepository } from '../repository/IRepository';
import { Doctor, DoctorSession, Schedule, WeeklyPatternSlot } from '../../types';

export const WEEKDAY_FULL_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export interface SaveDoctorShiftParams {
  repo: IRepository;
  doctor: Doctor;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  room?: string;
  specialtyId: string;
  updateScope: 'THIS_DATE_ONLY' | 'RECURRING_ALL_MATCHING_DAYS';
  schedule?: Schedule | null;
  existingSession?: DoctorSession | null;
}

export interface SaveDoctorShiftResult {
  updatedDoctor: Doctor;
  allSessions: DoctorSession[];
  message: string;
}

export interface DeleteDoctorShiftParams {
  repo: IRepository;
  doctor: Doctor;
  date: string;
  sessionId?: string;
  deleteScope: 'THIS_DATE_ONLY' | 'REMOVE_RECURRING_PATTERN';
  schedule?: Schedule | null;
}

export interface DeleteDoctorShiftResult {
  updatedDoctor: Doctor;
  allSessions: DoctorSession[];
  message: string;
}

/**
 * Parses a YYYY-MM-DD string into UTC date components safely
 */
export function getWeekdayFromIsoDate(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dateObj = new Date(Date.UTC(year, month - 1, day));
  return dateObj.getUTCDay();
}

/**
 * Saves a doctor shift, either for a single date or as a recurring weekly pattern.
 */
export async function saveDoctorShift(
  params: SaveDoctorShiftParams
): Promise<SaveDoctorShiftResult> {
  const {
    repo,
    doctor,
    date,
    startTime,
    endTime,
    room = 'Suite 101',
    specialtyId,
    updateScope,
    schedule,
    existingSession,
  } = params;

  const weekdayIndex = getWeekdayFromIsoDate(date);
  const weekdayName = WEEKDAY_FULL_NAMES[weekdayIndex];

  let currentDoctor = doctor;

  if (updateScope === 'THIS_DATE_ONLY') {
    // 1. Update or create single session for this specific date
    if (existingSession) {
      await repo.update('doctorSessions', existingSession.id, {
        startTime,
        endTime,
        room,
        specialtyId,
        source: 'MANUAL',
        cancelled: false,
      });
    } else {
      const newId = `sess-${doctor.id}-${date}-${startTime.replace(':', '')}-${Math.random().toString(36).slice(2, 6)}`;
      await repo.create('doctorSessions', {
        id: newId,
        doctorId: doctor.id,
        date,
        startTime,
        endTime,
        specialtyId,
        room,
        source: 'MANUAL',
        cancelled: false,
      });
    }
  } else {
    // 2. RECURRING_ALL_MATCHING_DAYS: Update weekly pattern + sync all matching days in schedule
    const existingPatterns = doctor.weeklyPattern || [];
    const otherPatterns = existingPatterns.filter((p) => p.weekday !== weekdayIndex);
    const newSlot: WeeklyPatternSlot = {
      weekday: weekdayIndex,
      startTime,
      endTime,
      room,
    };
    const nextWeeklyPattern = [...otherPatterns, newSlot].sort((a, b) => a.weekday - b.weekday);

    currentDoctor = await repo.update('doctors', doctor.id, {
      weeklyPattern: nextWeeklyPattern,
    });

    // Determine date range to apply
    let rangeStart = schedule?.startDate;
    let rangeEnd = schedule?.endDate;

    if (!rangeStart || !rangeEnd) {
      // Default to the month of the edited date
      const [y, m] = date.split('-');
      rangeStart = `${y}-${m}-01`;
      const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
      rangeEnd = `${y}-${m}-${lastDay.toString().padStart(2, '0')}`;
    }

    const startObj = new Date(rangeStart + 'T00:00:00Z');
    const endObj = new Date(rangeEnd + 'T00:00:00Z');

    // Fetch existing sessions for this doctor
    const existingSessions = await repo.list('doctorSessions', {
      field: 'doctorId',
      operator: '==',
      value: doctor.id,
    });

    const sessionsByDate = new Map<string, DoctorSession>();
    existingSessions.forEach((s) => sessionsByDate.set(s.date, s));

    for (
      let cur = new Date(startObj);
      cur <= endObj;
      cur.setUTCDate(cur.getUTCDate() + 1)
    ) {
      if (cur.getUTCDay() === weekdayIndex) {
        const curIsoDate = cur.toISOString().split('T')[0];
        const existing = sessionsByDate.get(curIsoDate);

        if (existing) {
          await repo.update('doctorSessions', existing.id, {
            startTime,
            endTime,
            room,
            specialtyId,
            source: 'PATTERN',
            cancelled: false,
          });
        } else {
          const sessId = `sess-${doctor.id}-${curIsoDate}-${startTime.replace(':', '')}`;
          await repo.create('doctorSessions', {
            id: sessId,
            doctorId: doctor.id,
            date: curIsoDate,
            startTime,
            endTime,
            specialtyId,
            room,
            source: 'PATTERN',
            cancelled: false,
          });
        }
      }
    }
  }

  // Load fresh sessions list
  const allSessions = await repo.list('doctorSessions');

  const message =
    updateScope === 'THIS_DATE_ONLY'
      ? `Updated shift for ${doctor.fullName} on ${date} (${startTime}–${endTime} in ${room}).`
      : `Updated recurring ${weekdayName} shift (${startTime}–${endTime} in ${room}) for ${doctor.fullName} across schedule.`;

  return {
    updatedDoctor: currentDoctor,
    allSessions,
    message,
  };
}

/**
 * Removes or cancels a doctor shift, either for a single date or removes the recurring pattern.
 */
export async function deleteDoctorShift(
  params: DeleteDoctorShiftParams
): Promise<DeleteDoctorShiftResult> {
  const { repo, doctor, date, sessionId, deleteScope, schedule } = params;
  const weekdayIndex = getWeekdayFromIsoDate(date);
  const weekdayName = WEEKDAY_FULL_NAMES[weekdayIndex];

  let currentDoctor = doctor;

  if (deleteScope === 'THIS_DATE_ONLY') {
    if (sessionId) {
      await repo.remove('doctorSessions', sessionId);
    }
  } else {
    // 1. Remove from weekly pattern
    const nextWeeklyPattern = (doctor.weeklyPattern || []).filter(
      (p) => p.weekday !== weekdayIndex
    );
    currentDoctor = await repo.update('doctors', doctor.id, {
      weeklyPattern: nextWeeklyPattern,
    });

    // 2. Remove all matching sessions within the schedule
    let rangeStart = schedule?.startDate;
    let rangeEnd = schedule?.endDate;
    if (!rangeStart || !rangeEnd) {
      const [y, m] = date.split('-');
      rangeStart = `${y}-${m}-01`;
      const lastDay = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
      rangeEnd = `${y}-${m}-${lastDay.toString().padStart(2, '0')}`;
    }

    const docSessions = await repo.list('doctorSessions', {
      field: 'doctorId',
      operator: '==',
      value: doctor.id,
    });

    for (const s of docSessions) {
      if (s.date >= rangeStart && s.date <= rangeEnd) {
        if (getWeekdayFromIsoDate(s.date) === weekdayIndex) {
          await repo.remove('doctorSessions', s.id);
        }
      }
    }
  }

  const allSessions = await repo.list('doctorSessions');

  const message =
    deleteScope === 'THIS_DATE_ONLY'
      ? `Removed shift for ${doctor.fullName} on ${date}.`
      : `Removed recurring ${weekdayName} pattern and sessions for ${doctor.fullName}.`;

  return {
    updatedDoctor: currentDoctor,
    allSessions,
    message,
  };
}

/**
 * Generates doctor sessions based on active doctors' weekly patterns for a date range (inclusive).
 */
export function generateDoctorSessionsForDateRange(
  startDate: string,
  endDate: string,
  doctors: Doctor[]
): DoctorSession[] {
  if (!startDate || !endDate || startDate > endDate) return [];

  const startObj = new Date(startDate + 'T00:00:00Z');
  const endObj = new Date(endDate + 'T00:00:00Z');
  const activeDoctors = doctors.filter((d) => d.active !== false && Array.isArray(d.weeklyPattern));
  const generatedSessions: DoctorSession[] = [];

  for (
    let cur = new Date(startObj);
    cur <= endObj;
    cur.setUTCDate(cur.getUTCDate() + 1)
  ) {
    const curIsoDate = cur.toISOString().split('T')[0];
    const weekday = cur.getUTCDay();

    activeDoctors.forEach((doc) => {
      doc.weeklyPattern.forEach((pat) => {
        if (pat.weekday === weekday) {
          const sessId = `sess-${doc.id}-${curIsoDate}-${pat.startTime.replace(':', '')}`;
          generatedSessions.push({
            id: sessId,
            doctorId: doc.id,
            date: curIsoDate,
            startTime: pat.startTime,
            endTime: pat.endTime,
            specialtyId: (doc.specialtyIds && doc.specialtyIds[0]) ? doc.specialtyIds[0] : 'spec-gp',
            room: pat.room || 'Suite 101',
            source: 'PATTERN',
            cancelled: false,
          });
        }
      });
    });
  }

  return generatedSessions;
}

export interface PopulateRecurringDoctorSessionsParams {
  repo: IRepository;
  startDate: string;
  endDate: string;
  doctors?: Doctor[];
  overwriteExisting?: boolean;
}

export interface PopulateRecurringDoctorSessionsResult {
  createdCount: number;
  existingCount: number;
  totalSessions: number;
  newSessions: DoctorSession[];
}

/**
 * Expands and persists recurring weekly doctor sessions across a schedule duration.
 * By default, this is non-destructive and preserves existing manual sessions and cancellations.
 */
export async function populateRecurringDoctorSessionsForSchedule(
  params: PopulateRecurringDoctorSessionsParams
): Promise<PopulateRecurringDoctorSessionsResult> {
  const { repo, startDate, endDate, overwriteExisting = false } = params;
  const doctors = params.doctors || (await repo.list('doctors'));

  const candidateSessions = generateDoctorSessionsForDateRange(startDate, endDate, doctors);
  if (candidateSessions.length === 0) {
    return { createdCount: 0, existingCount: 0, totalSessions: 0, newSessions: [] };
  }

  // Fetch existing sessions in the system to avoid duplicates
  const allExistingSessions = await repo.list('doctorSessions');
  const existingMap = new Map<string, DoctorSession>();
  for (const s of allExistingSessions) {
    // Unique key: doctorId + date + startTime
    existingMap.set(`${s.doctorId}_${s.date}_${s.startTime}`, s);
  }

  const sessionsToUpsert: DoctorSession[] = [];
  let existingCount = 0;

  for (const cand of candidateSessions) {
    const key = `${cand.doctorId}_${cand.date}_${cand.startTime}`;
    const existing = existingMap.get(key);

    if (existing) {
      existingCount++;
      if (overwriteExisting) {
        sessionsToUpsert.push({
          ...cand,
          id: existing.id,
        });
      }
    } else {
      sessionsToUpsert.push(cand);
    }
  }

  if (sessionsToUpsert.length > 0) {
    await repo.bulkUpsert('doctorSessions', sessionsToUpsert);
  }

  return {
    createdCount: sessionsToUpsert.length,
    existingCount,
    totalSessions: candidateSessions.length,
    newSessions: sessionsToUpsert,
  };
}
