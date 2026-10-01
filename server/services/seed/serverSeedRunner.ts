/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Server-Side Database Initialization & Seed Runner
 * Populates realistic Al Shifa Outpatient Clinic baseline dataset for ClinicRoster.
 */

import { IRepository } from '../../../src/services/repository/IRepository';
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
} from '../../../src/services/seed/seedData';
import {
  DoctorSession,
  WeeklyPatternSlot,
  ScheduleVersion,
  CollectionName,
} from '../../../src/types';
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import { ALL_COLLECTIONS } from '../../db/jsonStore';

/**
 * Expand weekly patterns into concrete DoctorSession records for October 2026
 */
export function buildOctober2026DoctorSessions(): DoctorSession[] {
  const expandedSessions: DoctorSession[] = [];
  const year = 2026;
  const monthIndex = 9; // October (0-indexed)

  for (let day = 1; day <= 31; day++) {
    const dateObj = new Date(Date.UTC(year, monthIndex, day));
    const weekday = dateObj.getUTCDay(); // 0 = Sun ... 6 = Sat
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
 * Ensures critical default roles and rules exist
 */
async function ensureNurseClinicDefaults(repo: IRepository): Promise<void> {
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
    console.warn('[ServerSeed] ensureNurseClinicDefaults warning:', err);
  }
}

/**
 * Core seeder logic that writes all seed data and generates initial October 2026 shift matrix
 */
export async function populateServerSeedData(repo: IRepository): Promise<void> {
  console.info('[ServerSeed] Seeding baseline Al Shifa Outpatient Clinic dataset...');

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

  // 20. Generate Initial 31-Day Shift Assignments
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
  } catch (genErr) {
    console.warn('[ServerSeed] Automated assignment pre-generation warning:', genErr);
  }

  await ensureNurseClinicDefaults(repo);

  // Set system initialization state to INITIALIZED
  try {
    const existingMeta = await repo.get('systemMetadata', 'initialization_state');
    const now = new Date().toISOString();
    if (existingMeta) {
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
    console.warn('[ServerSeed] Warning setting systemMetadata initialized state:', mErr);
  }

  console.info('[ServerSeed] Baseline dataset seeded successfully.');
}

/**
 * Checks whether the server database has been explicitly marked as CLEARED
 */
export async function isServerDatabaseCleared(repo: IRepository): Promise<boolean> {
  try {
    const meta = await repo.get('systemMetadata', 'initialization_state');
    return meta?.status === 'CLEARED';
  } catch {
    return false;
  }
}

/**
 * Wipe all collections from the repository, preserve master admin, and write persistent CLEARED tombstone
 */
export async function clearServerDatabase(repo: IRepository, clearedBy: string = 'Administrator'): Promise<void> {
  console.info('[ServerSeed] Clearing all collections from server database...');
  for (const col of ALL_COLLECTIONS) {
    try {
      await repo.clearCollection(col);
    } catch (e) {
      console.warn(`[ServerSeed] Could not clear collection ${col}:`, e);
    }
  }

  // Preserve Master Admin Whitelist record for rolandabj@gmail.com
  try {
    await repo.create('userAccess', {
      id: 'usr-access-roland',
      email: 'rolandabj@gmail.com',
      name: 'Dr. Roland / Clinical Director',
      status: 'APPROVED',
      appRole: 'EDITOR',
      isManager: true,
      approvedBy: 'rolandabj@gmail.com',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    console.info('[ServerSeed] Preserved Master Admin record in userAccess.');
  } catch (aErr) {
    console.warn('[ServerSeed] Warning creating master admin userAccess record:', aErr);
  }

  // Write persistent CLEARED tombstone
  try {
    await repo.create('systemMetadata', {
      id: 'initialization_state',
      status: 'CLEARED',
      clearedAt: new Date().toISOString(),
      clearedBy,
      note: 'All demo data permanently removed from database',
    });
    console.info('[ServerSeed] Persistent CLEARED tombstone recorded in systemMetadata.');
  } catch (tErr) {
    console.warn('[ServerSeed] Warning recording CLEARED tombstone:', tErr);
  }
}

/**
 * Initialize database if empty: Never auto-seed demo data in production
 */
export async function initializeServerDatabaseIfEmpty(repo: IRepository): Promise<boolean> {
  // Demo data auto-seed permanently disabled to preserve clean database state
  return false;
}

/**
 * Reseed server database: Decommissioned for production compliance
 */
export async function reseedServerDatabase(_repo: IRepository): Promise<void> {
  console.warn('[ServerSeed] Reseed requested but permanently decommissioned for production compliance.');
}

/**
 * Get document counts across all collections
 */
export async function getServerDatabaseStats(repo: IRepository): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const col of ALL_COLLECTIONS) {
    try {
      const items = await repo.list(col);
      counts[col] = items.length;
    } catch {
      counts[col] = 0;
    }
  }
  return counts;
}
