/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Database Initialization, Seed Runner & Backup Suite for ClinicRoster (Phase 1 & Phase 15)
 * Realistic Al Shifa Outpatient Clinic demonstration environment.
 */

import { IRepository } from '../repository/IRepository';
import {
  SEED_CLINIC_PROFILE,
  SEED_DUTY_WINDOWS,
  SEED_LEAVE_TYPES,
  SEED_SENIORITY_LEVELS,
  SEED_CLINICAL_ROLES,
  SEED_SPECIALTIES,
  SEED_NURSES,
  SEED_DOCTORS,
  SEED_RULES,
  SEED_PUBLIC_HOLIDAYS,
  SEED_SCHEDULE,
  SEED_LEAVE_ENTRIES,
  SEED_LOCKS,
  SEED_TEMPLATES,
  SEED_SWAPS,
  SEED_AUDIT_EVENTS,
  SEED_USER_ACCESS_RECORDS,
  SEED_AVAILABILITY_REQUESTS,
  SEED_WORKING_HOURS_PERIODS,
} from './seedData';
import {
  DoctorSession,
  WeeklyPatternSlot,
  ScheduleVersion,
  CollectionName,
} from '../../types';
import { SchedulingEngine } from '../engine/SchedulingEngine';

export const ALL_COLLECTIONS: CollectionName[] = [
  'clinics',
  'dutyWindows',
  'leaveTypes',
  'seniorityLevels',
  'clinicalRoles',
  'specialties',
  'nurses',
  'doctors',
  'doctorSessions',
  'leaveEntries',
  'locks',
  'rules',
  'schedules',
  'assignments',
  'versions',
  'shareLinks',
  'invitations',
  'emailLog',
  'acknowledgments',
  'holidays',
  'quotas',
  'audit',
  'templates',
  'swaps',
  'userAccess',
  'availabilityRequests',
  'systemMetadata',
  'workingHoursPeriods',
];

/**
 * Expand weekly patterns into concrete DoctorSession records for October 2026
 */
export function buildOctober2026DoctorSessions(): DoctorSession[] {
  const expandedSessions: DoctorSession[] = [];
  const year = 2026;
  const monthIndex = 9; // 0-indexed: October is 9

  for (let day = 1; day <= 31; day++) {
    const dateObj = new Date(Date.UTC(year, monthIndex, day));
    const weekday = dateObj.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat
    const isoDate = `2026-10-${String(day).padStart(2, '0')}`;

    SEED_DOCTORS.forEach((doctor) => {
      doctor.weeklyPattern.forEach((pattern: WeeklyPatternSlot) => {
        if (pattern.weekday === weekday) {
          expandedSessions.push({
            id: `sess-${doctor.id}-${isoDate}-${pattern.startTime.replace(':', '')}`,
            doctorId: doctor.id,
            date: isoDate,
            startTime: pattern.startTime,
            endTime: pattern.endTime,
            specialtyId: doctor.specialtyIds[0],
            room: pattern.room,
            source: 'PATTERN',
            cancelled: false,
          });
        }
      });
    });
  }

  return expandedSessions;
}

/**
 * Core seeder logic that writes all seed data and generates initial October 2026 shift matrix
 */
async function populateSeedData(repo: IRepository): Promise<void> {
  // 1. Clinic Profile
  await repo.bulkUpsert('clinics', [SEED_CLINIC_PROFILE]);

  // 2. Duty Windows
  await repo.bulkUpsert('dutyWindows', SEED_DUTY_WINDOWS);

  // 3. Leave Types
  await repo.bulkUpsert('leaveTypes', SEED_LEAVE_TYPES);

  // 4. Seniority Levels
  await repo.bulkUpsert('seniorityLevels', SEED_SENIORITY_LEVELS);

  // 5. Clinical Roles
  await repo.bulkUpsert('clinicalRoles', SEED_CLINICAL_ROLES);

  // 6. Specialties
  await repo.bulkUpsert('specialties', SEED_SPECIALTIES);

  // 7. Doctors
  await repo.bulkUpsert('doctors', SEED_DOCTORS);

  // 8. Doctor Sessions
  const expandedSessions = buildOctober2026DoctorSessions();
  await repo.bulkUpsert('doctorSessions', expandedSessions);

  // 9. Nurses
  await repo.bulkUpsert('nurses', SEED_NURSES);

  // 10. Rules
  await repo.bulkUpsert('rules', SEED_RULES);

  // 11. Public Holidays
  await repo.bulkUpsert('holidays', SEED_PUBLIC_HOLIDAYS);

  // 12. Schedule (October 2026)
  await repo.bulkUpsert('schedules', [SEED_SCHEDULE]);

  // 13. Leave Entries
  await repo.bulkUpsert('leaveEntries', SEED_LEAVE_ENTRIES);

  // 14. Locks
  await repo.bulkUpsert('locks', SEED_LOCKS);

  // 15. Templates
  await repo.bulkUpsert('templates', SEED_TEMPLATES);

  // 16. Shift Swap Requests
  await repo.bulkUpsert('swaps', SEED_SWAPS);

  // 17. Initial Audit Trail Records
  await repo.bulkUpsert('audit', SEED_AUDIT_EVENTS);

  // 18. Whitelist User Access Records (Phase 1)
  await repo.bulkUpsert('userAccess', SEED_USER_ACCESS_RECORDS);

  // 19. Initial Availability Requests
  await repo.bulkUpsert('availabilityRequests', SEED_AVAILABILITY_REQUESTS);

  // 20. Dedicated Working Hours Periods (2025-2026 Baseline Cycles)
  await repo.bulkUpsert('workingHoursPeriods', SEED_WORKING_HOURS_PERIODS);

  // 21. Generate Initial 31-Day Shift Assignments
  try {
    const genResult = await SchedulingEngine.generate(
      SEED_SCHEDULE,
      'GENERATE_ALL',
      [],
      SEED_NURSES,
      SEED_SENIORITY_LEVELS,
      SEED_DUTY_WINDOWS,
      SEED_CLINICAL_ROLES,
      SEED_SPECIALTIES,
      expandedSessions,
      SEED_LOCKS,
      SEED_LEAVE_ENTRIES,
      SEED_RULES
    );

    if (genResult.assignments && genResult.assignments.length > 0) {
      await repo.bulkUpsert('assignments', genResult.assignments);

      // 19. Initial Baseline Version 1 Checkpoint
      const initialVersion: ScheduleVersion = {
        id: 'ver-oct-2026-v1',
        scheduleId: SEED_SCHEDULE.id,
        number: 1,
        timestamp: '2026-09-25T06:00:00Z',
        author: 'System Seed Engine',
        note: 'Initial deterministic roster baseline for Al Shifa Outpatient Clinic (October 2026)',
        snapshot: {
          schedule: SEED_SCHEDULE,
          assignments: genResult.assignments,
          leaveEntries: SEED_LEAVE_ENTRIES,
          locks: SEED_LOCKS,
          rulesSnapshot: SEED_RULES,
        },
        isPublished: false,
      };

      await repo.bulkUpsert('versions', [initialVersion]);
    }

    // Set initialization status in systemMetadata
    try {
      const existing = await repo.get('systemMetadata', 'initialization_state');
      const now = new Date().toISOString();
      if (existing) {
        await repo.update('systemMetadata', 'initialization_state', {
          status: 'INITIALIZED',
          initializedAt: now,
          note: 'Al Shifa Outpatient Clinic baseline seed dataset active',
        });
      } else {
        await repo.create('systemMetadata', {
          id: 'initialization_state',
          status: 'INITIALIZED',
          initializedAt: now,
          note: 'Al Shifa Outpatient Clinic baseline seed dataset active',
        });
      }
    } catch (mErr) {
      console.warn('[ClinicRoster] Warning setting systemMetadata initialized state:', mErr);
    }
  } catch (genErr) {
    console.warn('[ClinicRoster] Automated assignment pre-generation warning:', genErr);
  }
}

/**
 * Checks whether the client database has been explicitly marked as CLEARED
 */
export async function isClientDatabaseCleared(repo: IRepository): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && localStorage.getItem('clinic_roster_database_cleared') === 'true') {
      return true;
    }
    const meta = await repo.get('systemMetadata', 'initialization_state');
    if (meta?.status === 'CLEARED') {
      if (typeof window !== 'undefined') {
        localStorage.setItem('clinic_roster_database_cleared', 'true');
      }
      return true;
    }
    return false;
  } catch {
    return typeof window !== 'undefined' && localStorage.getItem('clinic_roster_database_cleared') === 'true';
  }
}

export const isDatabaseMarkedCleared = isClientDatabaseCleared;

/**
 * Initialize database if empty: Never auto-seed demo data in production
 */
export async function initializeDatabaseIfEmpty(repo: IRepository): Promise<boolean> {
  // Demo data auto-seed permanently disabled to preserve clean production state
  return false;
}

/**
 * Ensures that the Dedicated Nurse Clinic role and rule are present in repository
 */
export async function ensureNurseClinicDefaults(repo: IRepository): Promise<void> {
  try {
    const existingRoles = await repo.list('clinicalRoles');
    const hasNcRole = existingRoles.some(
      (r) => r.id === 'role-nurse-clinic' || r.acronym === 'NC' || r.name.toLowerCase().includes('nurse clinic')
    );
    if (!hasNcRole) {
      await repo.create('clinicalRoles', {
        id: 'role-nurse-clinic',
        name: 'Nurse Clinic',
        acronym: 'NC',
        description: 'Dedicated nurse-led clinic (triage, dressings, vitals & injections) — independent of doctor sessions',
        defaultDailyQuota: 1,
        defaultStartTime: '09:00',
        defaultEndTime: '17:00',
      });
    }

    const existingRules = await repo.list('rules');
    const hasNcRule = existingRules.some(
      (r) => r.templateKey === 'DEDICATED_NURSE_CLINIC' || r.id === 'rule-nurse-clinic'
    );
    if (!hasNcRule) {
      await repo.create('rules', {
        id: 'rule-nurse-clinic',
        name: 'Dedicated nurse clinic coverage (not assigned to doctor)',
        templateKey: 'DEDICATED_NURSE_CLINIC',
        scope: 'PER_DAY',
        metric: 'DUTIES_WITH_END_TIME_X_COUNT',
        operator: 'MIN',
        value: 1,
        severity: 'HARD',
        enabled: true,
      });
    }

    const hasPlusOneRule = existingRules.some(
      (r) => r.templateKey === 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS' || r.id === 'rule-nurse-plus-one'
    );
    if (!hasPlusOneRule) {
      await repo.create('rules', {
        id: 'rule-nurse-plus-one',
        name: 'At least one additional nurse above doctors during clinic operating hours',
        templateKey: 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS',
        scope: 'PER_DUTY_WINDOW',
        metric: 'DUTIES_WITH_END_TIME_X_COUNT',
        operator: 'MIN',
        value: 1,
        severity: 'HARD',
        enabled: true,
      });
    }
  } catch (err) {
    console.warn('[ClinicRoster] ensureNurseClinicDefaults warning:', err);
  }
}

/**
 * Ensures that the standard Dedicated Working Hours Periods are seeded if empty
 */
export async function ensureWorkingHoursPeriodsDefaults(repo: IRepository): Promise<void> {
  try {
    const isCleared = await isClientDatabaseCleared(repo);
    if (isCleared) return;

    const existing = await repo.list('workingHoursPeriods');
    if (existing.length === 0) {
      await repo.bulkUpsert('workingHoursPeriods', SEED_WORKING_HOURS_PERIODS);
      console.info('[ClinicRoster] Seeded 12 standard dedicated working hours periods (2025-2026).');
    }
  } catch (err) {
    console.warn('[ClinicRoster] ensureWorkingHoursPeriodsDefaults warning:', err);
  }
}

/**
 * Reseed database: Decommissioned for production compliance
 */
export async function reseedDatabase(_repo: IRepository): Promise<void> {
  console.warn('[ClinicRoster] Reseed requested but permanently decommissioned for production compliance.');
}

/**
 * Wipe all collections from the repository and coordinate with backend server
 */
export async function clearDatabase(repo: IRepository): Promise<void> {
  console.info('[ClinicRoster] Initiating dual-tier database wipe (client repository + server)...');

  // 1. Wipe all collections in active repository (excluding systemMetadata for now)
  for (const col of ALL_COLLECTIONS) {
    if (col === 'systemMetadata') continue;
    try {
      await repo.clearCollection(col);
    } catch (e) {
      console.warn(`[ClinicRoster] Could not clear collection ${col}:`, e);
    }
  }

  // 2. Write persistent CLEARED tombstone in active repository
  try {
    const existing = await repo.get('systemMetadata', 'initialization_state');
    const now = new Date().toISOString();
    if (existing) {
      await repo.update('systemMetadata', 'initialization_state', {
        status: 'CLEARED',
        clearedAt: now,
        clearedBy: 'Administrator',
        note: 'All client database records cleared by administrator',
      });
    } else {
      await repo.create('systemMetadata', {
        id: 'initialization_state',
        status: 'CLEARED',
        clearedAt: now,
        clearedBy: 'Administrator',
        note: 'All client database records cleared by administrator',
      });
    }
    console.info('[ClinicRoster] Persistent CLEARED tombstone recorded in client repository.');
  } catch (tErr) {
    console.warn('[ClinicRoster] Warning writing CLEARED tombstone to client repository:', tErr);
  }

  // 3. Set localStorage tombstone flag & purge stale cache keys
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('clinic_roster_database_cleared', 'true');
      localStorage.removeItem('clinic_roster_clinic_name');
      localStorage.removeItem('clinic_roster_clinic_timezone');
      localStorage.removeItem('clinic_roster_active_schedule_id');
    } catch {
      // ignore
    }
  }

  // 4. Concurrently notify backend server to clear server-side store
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('clinic_roster_auth_token') : null;
    const res = await fetch('/api/admin/clear', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.ok) {
      console.info('[ClinicRoster] Coordinated backend server clear completed successfully.');
    } else {
      console.warn('[ClinicRoster] Backend clear responded with status:', res.status);
    }
  } catch (apiErr) {
    console.info('[ClinicRoster] Backend server clear notification note (server may be offline/local-only):', apiErr);
  }
}

/**
 * Full Database Statistics
 */
export interface DatabaseStats {
  nursesCount: number;
  doctorsCount: number;
  sessionsCount: number;
  schedulesCount: number;
  assignmentsCount: number;
  leaveEntriesCount: number;
  locksCount: number;
  rulesCount: number;
  holidaysCount: number;
  versionsCount: number;
  templatesCount: number;
  swapsCount: number;
  auditCount: number;
  workingHoursPeriodsCount?: number;
  lastUpdated: string;
}

export async function getDatabaseStatistics(repo: IRepository): Promise<DatabaseStats> {
  const [
    nurses,
    doctors,
    sessions,
    schedules,
    assignments,
    leaveEntries,
    locks,
    rules,
    holidays,
    versions,
    templates,
    swaps,
    audit,
    periods,
  ] = await Promise.all([
    repo.list('nurses'),
    repo.list('doctors'),
    repo.list('doctorSessions'),
    repo.list('schedules'),
    repo.list('assignments'),
    repo.list('leaveEntries'),
    repo.list('locks'),
    repo.list('rules'),
    repo.list('holidays'),
    repo.list('versions'),
    repo.list('templates'),
    repo.list('swaps'),
    repo.list('audit'),
    repo.list('workingHoursPeriods'),
  ]);

  return {
    nursesCount: nurses.length,
    doctorsCount: doctors.length,
    sessionsCount: sessions.length,
    schedulesCount: schedules.length,
    assignmentsCount: assignments.length,
    leaveEntriesCount: leaveEntries.length,
    locksCount: locks.length,
    rulesCount: rules.length,
    holidaysCount: holidays.length,
    versionsCount: versions.length,
    templatesCount: templates.length,
    swapsCount: swaps.length,
    auditCount: audit.length,
    workingHoursPeriodsCount: periods.length,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Full Database JSON Backup Export
 */
export async function exportFullDatabaseBackup(repo: IRepository): Promise<string> {
  const exportPayload: Record<string, any[]> = {};

  for (const col of ALL_COLLECTIONS) {
    try {
      const records = await repo.list(col);
      exportPayload[col] = records;
    } catch {
      exportPayload[col] = [];
    }
  }

  const backupEnvelope = {
    app: 'ClinicRoster',
    version: '1.0.0',
    phase: 15,
    exportedAt: new Date().toISOString(),
    collections: exportPayload,
  };

  return JSON.stringify(backupEnvelope, null, 2);
}

/**
 * Full Database JSON Backup Import
 */
export async function importFullDatabaseBackup(
  repo: IRepository,
  jsonString: string
): Promise<{ success: boolean; message: string; recordCounts?: Record<string, number> }> {
  try {
    const parsed = JSON.parse(jsonString);
    if (!parsed || !parsed.collections) {
      return { success: false, message: 'Invalid backup file format: Missing "collections" map.' };
    }

    const collections = parsed.collections as Record<string, any[]>;
    const counts: Record<string, number> = {};

    // Clear existing
    await clearDatabase(repo);

    // Import each collection
    for (const col of ALL_COLLECTIONS) {
      const records = collections[col];
      if (Array.isArray(records) && records.length > 0) {
        await repo.bulkUpsert(col, records);
        counts[col] = records.length;
      } else {
        counts[col] = 0;
      }
    }

    return {
      success: true,
      message: `Database successfully restored from backup (${parsed.exportedAt || 'earlier export'}).`,
      recordCounts: counts,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to import backup: ${err.message || 'Malformed JSON'}`,
    };
  }
}
