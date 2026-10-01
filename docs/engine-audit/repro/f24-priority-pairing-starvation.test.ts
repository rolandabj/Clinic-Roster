/**
 * Repro / regression test for FINDING F-24 (user-reported, 2026-10-01).
 *
 * F-24: Priority-pairing starvation by slot processing order.
 *   Slots are processed per-day in descending `priority`: late-ending clinics
 *   (endTime >= 19:00) get 130 and are filled BEFORE a clinic that has a
 *   dedicated Priority-#1 nurse (125). Nothing stopped the earlier slot from
 *   consuming that P1 nurse (via their rank-2 / specialty / general candidacy),
 *   so the P1 doctor's own slot fell through to the general pool.
 *
 * Real-world case (user screenshot, Mon Oct 19): nurse Cheene (general pool,
 * "P5" badge) was paired with Dr. Samer while nurse Roland — who holds the
 * Priority #1 preference for Dr. Samer — was consumed elsewhere.
 *
 * Fix: a reservation guard — while a doctor still has an unprocessed session
 * slot today, every nurse holding a rank-1 preference for that doctor is
 * skipped by all OTHER slots processed earlier the same day.
 *
 * Run: npx tsx docs/engine-audit/repro/f24-priority-pairing-starvation.test.ts
 */
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import type {
  Schedule, Nurse, DutyWindow, SeniorityLevel, DoctorSession, Rule,
} from '../../../src/types';

const schedule: Schedule = {
  id: 's-f24', name: 's-f24', startDate: '2026-10-19', endDate: '2026-10-19',
  blockWeeks: 1, hoursTargetFullTime: 12, status: 'DRAFT', activeVersionNumber: 1,
} as unknown as Schedule;

const dutyDay: DutyWindow = { id: 'duty-day', name: 'Full Day', acronym: 'D', startTime: '09:00', endTime: '21:00', active: true } as unknown as DutyWindow;
const levels: SeniorityLevel[] = [{ id: 'lvl-sr', name: 'Senior', isSenior: true }] as unknown as SeniorityLevel[];

const mkNurse = (id: string, name: string, prefs: any[]): Nurse =>
  ({ id, fullName: name, gmail: `${id}@x.com`, active: true, isClinicNurse: true, contractPercent: 100, seniorityLevelId: 'lvl-sr', capabilityIds: [], preferences: prefs } as unknown as Nurse);

// Roland: Priority #1 for Dr. Samer, Priority #2 for Dr. Ahmad.
// Cheene: general pool (no allocations).
const roland = mkNurse('n-roland', 'Roland Abj', [
  { kind: 'DOCTOR', refId: 'doc-samer', rank: 1 },
  { kind: 'DOCTOR', refId: 'doc-ahmad', rank: 2 },
]);
const cheene = mkNurse('n-cheene', 'Cheene Cadiao', []);

const sessions: DoctorSession[] = [
  // Dr. Ahmad 09:00–21:00 → slot priority 130, processed FIRST
  { id: 'se-ahmad', doctorId: 'doc-ahmad', date: '2026-10-19', startTime: '09:00', endTime: '21:00' },
  // Dr. Samer 09:00–17:00 → slot priority 125 (has a dedicated P1 nurse), processed SECOND
  { id: 'se-samer', doctorId: 'doc-samer', date: '2026-10-19', startTime: '09:00', endTime: '17:00' },
] as unknown as DoctorSession[];

const ncOff: Rule = { id: 'rule-nurse-clinic', templateKey: 'DEDICATED_NURSE_CLINIC', name: 'Dedicated Nurse Clinic', enabled: false, severity: 'HARD', value: 1 } as unknown as Rule;
const plusOneOff: Rule = { id: 'rule-nurse-plus-one', templateKey: 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS', name: '+1 Nurse', enabled: false, severity: 'HARD', value: 1 } as unknown as Rule;

async function main() {
  const failures: string[] = [];

  const res = await SchedulingEngine.generate(
    schedule, 'GENERATE_ALL', [], [roland, cheene], levels, [dutyDay], [], [], sessions, [], [], [ncOff, plusOneOff]
  );

  const samerAsgn = res.assignments.find((a) => a.kind === 'DOCTOR' && a.doctorId === 'doc-samer');
  const ahmadAsgn = res.assignments.find((a) => a.kind === 'DOCTOR' && a.doctorId === 'doc-ahmad');
  const p1Count = (res as any).doctorPriority1PairingsCount;

  console.log(`F-24 Dr. Samer  -> ${samerAsgn?.nurseId ?? 'UNSTAFFED'} (expect n-roland, his Priority #1; legacy bug: n-cheene from the general pool)`);
  console.log(`F-24 Dr. Ahmad  -> ${ahmadAsgn?.nurseId ?? 'UNSTAFFED'} (expect n-cheene; legacy bug: n-roland consumed via his P2 candidacy)`);
  console.log(`F-24 P1 pairings counted: ${p1Count} (expect 1; legacy bug: 0 — the P1 match never happened)`);

  if (samerAsgn?.nurseId !== 'n-roland')
    failures.push(`F-24 REGRESSION: Dr. Samer staffed by ${samerAsgn?.nurseId ?? 'nobody'} — P1 nurse starved by an earlier slot`);
  if (ahmadAsgn?.nurseId !== 'n-cheene')
    failures.push(`F-24 REGRESSION: Dr. Ahmad staffed by ${ahmadAsgn?.nurseId ?? 'nobody'} instead of the general-pool nurse`);
  if (p1Count !== 1)
    failures.push(`F-24 REGRESSION: doctorPriority1PairingsCount = ${p1Count}, expected 1`);
  if (res.assignments.filter((a) => a.kind === 'DOCTOR').length !== 2)
    failures.push('F-24 SANITY: both doctor sessions must be staffed');

  if (failures.length) {
    console.error('\nFAIL:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nPASS: F-24 fixed — Priority #1 pairings are reserved and can no longer be starved by slot processing order.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
