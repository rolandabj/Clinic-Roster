/**
 * Repro / regression test for FINDINGS F-4 and F-5 (availability guards).
 *
 * F-4: The engine never filtered `nurse.active` — deactivated nurses could be
 *      scheduled (including via the H1 senior-swap pass).
 * F-5: The H1 senior-fixer and the 4.6 float/pool passes did not check
 *      LockEntry(mode='OFF') — nurses explicitly pinned OFF could still be
 *      swapped onto duties or floated into the pool on that very day.
 *
 * Scenario (7-day schedule, one 8h duty window):
 *  - "Ivy Inactive"  — inactive senior. Must receive ZERO assignments (F-4).
 *    (Pre-fix she is also the alphabetically-first senior, so the H1 fixer
 *     swaps her onto the doctor duty.)
 *  - "Sara Senior"   — active senior, pinned OFF on 2026-03-02. Must have no
 *    assignment that day (F-5), but MUST still work other days (no blanket ban).
 *  - "Jon Junior"    — active junior; covers the 2026-03-02 doctor session.
 *
 * Run: npx tsx docs/engine-audit/repro/f4-f5-availability-guards.test.ts
 */
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import type {
  Schedule,
  Nurse,
  DutyWindow,
  SeniorityLevel,
  DoctorSession,
  LockEntry,
  Assignment,
} from '../../../src/types';

const schedule: Schedule = {
  id: 'sched-test-2',
  name: 'Availability Guard Test',
  startDate: '2026-03-01',
  endDate: '2026-03-07',
  blockWeeks: 1,
  hoursTargetFullTime: 40,
  status: 'DRAFT',
  activeVersionNumber: 1,
} as unknown as Schedule;

const duty8h: DutyWindow = {
  id: 'duty-e',
  name: 'Early',
  acronym: 'E',
  startTime: '09:00',
  endTime: '17:00',
  active: true,
} as unknown as DutyWindow;

const levels: SeniorityLevel[] = [
  { id: 'lvl-sr', name: 'Senior', isSenior: true },
  { id: 'lvl-jr', name: 'Junior', isSenior: false },
] as unknown as SeniorityLevel[];

const mkNurse = (id: string, name: string, levelId: string, active: boolean): Nurse =>
  ({
    id,
    fullName: name,
    active,
    isClinicNurse: true,
    contractPercent: 100,
    seniorityLevelId: levelId,
    capabilityIds: [],
    preferences: [],
  } as unknown as Nurse);

const nurses = [
  mkNurse('n-ivy', 'Ivy Inactive', 'lvl-sr', false),
  mkNurse('n-jon', 'Jon Junior', 'lvl-jr', true),
  mkNurse('n-sara', 'Sara Senior', 'lvl-sr', true),
];

const session: DoctorSession = {
  id: 'sess-1',
  doctorId: 'doc-1',
  date: '2026-03-02',
  startTime: '09:00',
  endTime: '17:00',
  cancelled: false,
} as unknown as DoctorSession;

const offLock: LockEntry = {
  id: 'lk-off-sara',
  nurseId: 'n-sara',
  date: '2026-03-02',
  mode: 'OFF',
  createdAt: '2026-02-01T00:00:00Z',
} as unknown as LockEntry;

async function main() {
  const result = await SchedulingEngine.generate(
    schedule,
    'GENERATE_ALL',
    [] as Assignment[],
    nurses,
    levels,
    [duty8h],
    [], // roles
    [], // specialties
    [session],
    [offLock],
    [], // leaves
    [], // rules
  );

  const byNurse = (id: string) => result.assignments.filter((a) => a.nurseId === id);
  const ivy = byNurse('n-ivy');
  const saraOnOffDay = byNurse('n-sara').filter((a) => a.date === '2026-03-02');
  const saraOtherDays = byNurse('n-sara').filter((a) => a.date !== '2026-03-02');
  const sessionCovered = result.assignments.some(
    (a) => a.date === '2026-03-02' && a.kind === 'DOCTOR' && a.doctorId === 'doc-1'
  );

  console.log(`Ivy (inactive) assignments:        ${ivy.length} (expect 0; legacy bug: >0 via H1 swap)`);
  console.log(`Sara on her OFF-pinned day:        ${saraOnOffDay.length} (expect 0; legacy bug: 1)`);
  console.log(`Sara on other days:                ${saraOtherDays.length} (expect >0 — not blanket-banned)`);
  console.log(`Doctor session on 03-02 covered:   ${sessionCovered}`);

  const failures: string[] = [];
  if (ivy.length > 0)
    failures.push(`F-4 REGRESSION: inactive nurse received ${ivy.length} assignment(s): ${ivy.map((a) => a.date).join(', ')}`);
  if (saraOnOffDay.length > 0)
    failures.push(`F-5 REGRESSION: OFF-pinned nurse assigned on 2026-03-02 (${saraOnOffDay[0].note || saraOnOffDay[0].kind})`);
  if (saraOtherDays.length === 0)
    failures.push('OVERCORRECTION: Sara received no assignments at all — OFF lock must only block its own date');
  if (!sessionCovered)
    failures.push('COVERAGE BROKEN: the 2026-03-02 doctor session is no longer staffed');

  if (failures.length) {
    console.error('\nFAIL:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nPASS: F-4 and F-5 fixed — inactive nurses excluded, OFF locks respected by all passes.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
