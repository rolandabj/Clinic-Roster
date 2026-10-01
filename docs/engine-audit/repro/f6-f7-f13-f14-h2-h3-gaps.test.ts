/**
 * Repro / regression test for FINDINGS F-6, F-7, F-13, F-14 (H2/H3 enforcement gaps).
 *
 * F-6:  H2 lookback hardcoded 6 days — configured limits > 6 were never enforced.
 * F-7:  Float pool hardcoded its own ceiling (5) — ignored stricter configured H2.
 * F-13: No forward rest check — today's late duty could violate the 11h rest
 *       before a LOCKED early duty tomorrow that the engine could already see.
 * F-14: Prior-period assignments were invisible — streaks crossing the schedule
 *       start boundary were allowed.
 *
 * Run: npx tsx docs/engine-audit/repro/f6-f7-f13-f14-h2-h3-gaps.test.ts
 */
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import type {
  Schedule, Nurse, DutyWindow, SeniorityLevel, DoctorSession, LockEntry, Rule, Assignment,
} from '../../../src/types';

const mkSchedule = (id: string, start: string, end: string, target: number): Schedule =>
  ({ id, name: id, startDate: start, endDate: end, blockWeeks: 1, hoursTargetFullTime: target, status: 'DRAFT', activeVersionNumber: 1 } as unknown as Schedule);

const dutyE: DutyWindow = { id: 'duty-e', name: 'Early', acronym: 'E', startTime: '08:00', endTime: '17:00', active: true } as unknown as DutyWindow;
const dutyL: DutyWindow = { id: 'duty-l', name: 'Late', acronym: 'L', startTime: '13:00', endTime: '22:00', active: true } as unknown as DutyWindow;

const levels: SeniorityLevel[] = [{ id: 'lvl-sr', name: 'Senior', isSenior: true }] as unknown as SeniorityLevel[];

const mkNurse = (id: string, name: string): Nurse =>
  ({ id, fullName: name, active: true, isClinicNurse: true, contractPercent: 100, seniorityLevelId: 'lvl-sr', capabilityIds: [], preferences: [] } as unknown as Nurse);

const mkSession = (date: string, start = '09:00', end = '17:00'): DoctorSession =>
  ({ id: `sess-${date}-${start}`, doctorId: 'doc-1', date, startTime: start, endTime: end, cancelled: false } as unknown as DoctorSession);

const ncOff: Rule = { id: 'rule-nurse-clinic', templateKey: 'DEDICATED_NURSE_CLINIC', name: 'Dedicated Nurse Clinic', enabled: false, severity: 'HARD', value: 1 } as unknown as Rule;
const h2Rule = (value: number): Rule =>
  ({ id: 'rule-h2', templateKey: 'MAX_CONSECUTIVE_DAYS', name: 'Max Consecutive Working Days', enabled: true, severity: 'HARD', value } as unknown as Rule);

const dates = (start: string, days: number): string[] => {
  const [y, m, d] = start.split('-').map(Number);
  return Array.from({ length: days }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().split('T')[0]);
};

const maxStreak = (asgns: Assignment[], nurseId: string): number => {
  const ds = [...new Set(asgns.filter((a) => a.nurseId === nurseId).map((a) => a.date))].sort();
  let best = 0, cur = 0, prev: string | null = null;
  for (const day of ds) {
    if (prev) {
      const gap = (Date.parse(day + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z')) / 86400000;
      cur = gap === 1 ? cur + 1 : 1;
    } else cur = 1;
    best = Math.max(best, cur);
    prev = day;
  }
  return best;
};

const gen = (
  schedule: Schedule, nurses: Nurse[], duties: DutyWindow[], sessions: DoctorSession[],
  locks: LockEntry[], rules: Rule[], prior: Assignment[] = []
) =>
  SchedulingEngine.generate(
    schedule, 'GENERATE_ALL', [], nurses, levels, duties, [], [], sessions, locks, [], rules,
    undefined, undefined, [], prior
  );

async function main() {
  const failures: string[] = [];

  // ---------- F-6: H2 configured at 8 must be enforced (lookback was capped at 6) ----------
  {
    const sched = mkSchedule('s-f6', '2026-03-01', '2026-03-20', 160);
    const sessions = dates('2026-03-01', 20).map((d) => mkSession(d));
    const res = await gen(sched, [mkNurse('n1', 'Nina')], [dutyE], sessions, [], [ncOff, h2Rule(8)]);
    const streak = maxStreak(res.assignments, 'n1');
    console.log(`F-6  max streak with H2=8:        ${streak} (expect <= 8; legacy bug: 20 — rule >6 never enforced)`);
    if (streak > 8) failures.push(`F-6 REGRESSION: streak ${streak} > configured limit 8`);
  }

  // ---------- F-7: float pool must honor a STRICTER configured H2 (was hardcoded 5) ----------
  {
    const sched = mkSchedule('s-f7', '2026-03-01', '2026-03-14', 80);
    // No sessions => only the float/pool pass assigns duties.
    const res = await gen(sched, [mkNurse('n2', 'Pola')], [dutyE], [], [], [ncOff, h2Rule(3)]);
    const streak = maxStreak(res.assignments, 'n2');
    console.log(`F-7  pool max streak with H2=3:   ${streak} (expect <= 2 — pool keeps a 1-day margin; legacy bug: 5)`);
    if (streak > 2) failures.push(`F-7 REGRESSION: float pool built streak ${streak} despite H2=3`);
  }

  // ---------- F-13: no late duty today when a locked EARLY duty tomorrow breaks min rest ----------
  {
    const sched = mkSchedule('s-f13', '2026-03-01', '2026-03-03', 24);
    const lock: LockEntry = {
      id: 'lk-1', nurseId: 'n3', date: '2026-03-02', mode: 'ASSIGNMENT', dutyWindowId: 'duty-e',
      assignmentKind: 'CLINICAL_ROLE', targetRefId: 'role-float', createdAt: '2026-02-01T00:00:00Z',
    } as unknown as LockEntry;
    // Evening session on 03-01: best-covering duty is L (ends 22:00) → only 10h rest before 08:00.
    const res = await gen(sched, [mkNurse('n3', 'Lena')], [dutyE, dutyL], [mkSession('2026-03-01', '17:00', '22:00')], [lock], [ncOff]);
    const day1 = res.assignments.filter((a) => a.nurseId === 'n3' && a.date === '2026-03-01');
    const lateEnd = day1.some((a) => a.dutyWindowId === 'duty-l');
    console.log(`F-13 late duty before locked 08:00 duty: ${lateEnd} (expect false; legacy bug: true — 10h rest violation created)`);
    if (lateEnd) failures.push('F-13 REGRESSION: engine placed a 22:00-ending duty 10h before a locked 08:00 duty');
    const lockKept = res.assignments.some((a) => a.nurseId === 'n3' && a.date === '2026-03-02' && a.source === 'LOCK');
    if (!lockKept) failures.push('SANITY: locked assignment on 2026-03-02 was not preserved');
  }

  // ---------- F-14: streak crossing the schedule boundary must count prior-period days ----------
  {
    const sched = mkSchedule('s-f14', '2026-03-01', '2026-03-07', 56);
    const prior: Assignment[] = dates('2026-02-24', 5).map((d) => ({
      id: `prev-${d}`, scheduleId: 'sched-prev', nurseId: 'n4', date: d, dutyWindowId: 'duty-e',
      kind: 'CLINICAL_ROLE', clinicalRoleId: 'role-float', locked: false, source: 'GENERATED',
    })) as unknown as Assignment[];
    const sessions = dates('2026-03-01', 7).map((d) => mkSession(d));
    const res = await gen(sched, [mkNurse('n4', 'Hana')], [dutyE], sessions, [], [ncOff], prior);
    // Prior streak = 5 (02-24..02-28, default limit 6) → may work 03-01 (streak 6), MUST rest 03-02.
    const day1 = res.assignments.some((a) => a.nurseId === 'n4' && a.date === '2026-03-01');
    const day2 = res.assignments.some((a) => a.nurseId === 'n4' && a.date === '2026-03-02');
    console.log(`F-14 works 03-01 (streak 6, ok):  ${day1} (expect true)`);
    console.log(`F-14 rests 03-02 (streak would be 7): ${!day2} (expect true; legacy bug: false — prior period invisible)`);
    if (!day1) failures.push('OVERCORRECTION: 2026-03-01 should still be workable (streak exactly at limit 6)');
    if (day2) failures.push('F-14 REGRESSION: assigned on 2026-03-02 — cross-boundary streak of 7 days');
  }

  if (failures.length) {
    console.error('\nFAIL:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nPASS: F-6, F-7, F-13, F-14 fixed — H2 limits enforced at any configured value, pool follows the rule, rest respected around locks and across period boundaries.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
