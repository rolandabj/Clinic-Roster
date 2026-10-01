/**
 * Repro / regression test for FINDINGS F-1 and F-2 (hours accounting).
 *
 * F-1: Preserved (lock/manual/retained) assignment hours were counted once at
 *      nurse-state init AND again when the day loop reached their dates,
 *      inflating totalDutyHoursEarned up to 2x and tripping the H7 cap early.
 * F-2: Leave hours were baked into totalDutyHoursEarned while maxAllowedHours
 *      already derives from the leave-reduced dutyTarget, costing a nurse ~2x
 *      their leave in schedulable capacity.
 *
 * Run: npx tsx docs/engine-audit/repro/f1-f2-hours-accounting.test.ts
 */
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import type {
  Schedule,
  Nurse,
  DutyWindow,
  SeniorityLevel,
  LeaveEntry,
  LockEntry,
  Assignment,
} from '../../../src/types';

const DAYS = 14; // 2026-03-01 .. 2026-03-14
const schedule: Schedule = {
  id: 'sched-test',
  name: 'Audit Test',
  startDate: '2026-03-01',
  endDate: '2026-03-14',
  blockWeeks: 2,
  hoursTargetFullTime: 80, // 80h target over 2 weeks => ten 8h shifts for a full-timer
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

const senior: SeniorityLevel = { id: 'lvl-sr', name: 'Senior', isSenior: true } as unknown as SeniorityLevel;

const mkNurse = (id: string, name: string): Nurse =>
  ({
    id,
    fullName: name,
    active: true,
    isClinicNurse: true,
    contractPercent: 100,
    seniorityLevelId: 'lvl-sr',
    capabilityIds: [],
    preferences: [],
  } as unknown as Nurse);

// Nurse A: has a 40h approved leave entry fully inside the window (F-2 target)
// Nurse B: has 3 locked 8h shifts (F-1 target)
// Nurse C: control (no leave, no locks)
const nurses = [mkNurse('n-a', 'Alice Leave'), mkNurse('n-b', 'Bella Locked'), mkNurse('n-c', 'Cora Control')];

const leave: LeaveEntry = {
  id: 'lv-1',
  nurseId: 'n-a',
  leaveTypeId: 'lt-al',
  startDate: '2026-03-02',
  endDate: '2026-03-06',
  approved: true,
  hoursCredited: 40,
} as unknown as LeaveEntry;

const locks: LockEntry[] = ['2026-03-01', '2026-03-03', '2026-03-05'].map((date, i) => ({
  id: `lk-${i}`,
  nurseId: 'n-b',
  date,
  mode: 'ASSIGNMENT',
  dutyWindowId: 'duty-e',
  assignmentKind: 'CLINICAL_ROLE',
  targetRefId: 'role-float',
  createdAt: '2026-02-01T00:00:00Z',
})) as unknown as LockEntry[];

async function main() {
  const result = await SchedulingEngine.generate(
    schedule,
    'GENERATE_ALL',
    [] as Assignment[],
    nurses,
    [senior],
    [duty8h],
    [], // roles
    [], // specialties
    [], // sessions (no doctor demand; float pool drives assignment up to target)
    locks,
    [leave],
    [], // rules => defaults: H7 tolerance 105%
  );

  const hoursByNurse = new Map<string, number>();
  for (const a of result.assignments) {
    hoursByNurse.set(a.nurseId, (hoursByNurse.get(a.nurseId) || 0) + 8);
  }
  const hA = hoursByNurse.get('n-a') || 0; // includes nothing for leave days (engine blocks leave days)
  const hB = hoursByNurse.get('n-b') || 0; // includes the 3 locked shifts (24h)
  const hC = hoursByNurse.get('n-c') || 0;

  // Targets: full-time contractTarget = 80h.
  // Alice: dutyTarget = 80 - 40 leave = 40h  -> expect ~40h of duty (5 shifts).
  // Bella: dutyTarget = 80h -> expect ~80h total INCLUDING her 3 locked shifts.
  // Cora:  dutyTarget = 80h -> expect ~80h.
  console.log(`Alice (40h leave): ${hA}h duty  (expect 40, legacy-bug value: ~0-8)`);
  console.log(`Bella (3 locks):   ${hB}h total (expect 80, legacy-bug value: ~56)`);
  console.log(`Cora (control):    ${hC}h       (expect 80)`);

  const failures: string[] = [];
  // F-2: with leave double-counted, Alice's consumption started at 40h vs max ~42h -> almost nothing schedulable.
  if (hA < 32 || hA > 48) failures.push(`F-2 REGRESSION: Alice got ${hA}h, expected ~40h`);
  // F-1: with lock hours double-counted, Bella's 24 locked hours consumed 48h of her cap.
  if (hB < 72) failures.push(`F-1 REGRESSION: Bella got ${hB}h, expected ~80h`);
  if (hC < 72) failures.push(`CONTROL BROKEN: Cora got ${hC}h, expected ~80h`);
  // H7 must still cap everyone at <= 105% + indivisible-shift allowance (84..88h here).
  for (const [nid, h] of hoursByNurse) {
    if (h > 88) failures.push(`H7 BREACH: ${nid} scheduled ${h}h > 88h cap`);
  }
  // Alice must never be scheduled on her leave days.
  const leaveDays = new Set(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06']);
  for (const a of result.assignments) {
    if (a.nurseId === 'n-a' && leaveDays.has(a.date)) failures.push(`H5 BREACH: Alice assigned on leave day ${a.date}`);
  }

  if (failures.length) {
    console.error('\nFAIL:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nPASS: F-1 and F-2 fixed — preserved hours counted once, leave not double-charged, H7 cap intact.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
