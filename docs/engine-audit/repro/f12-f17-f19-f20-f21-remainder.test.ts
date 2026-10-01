/**
 * Repro / regression test for FINDINGS F-12, F-17, F-19, F-20, F-21 (step-7 remainder).
 *
 * F-12: The H1 senior swap rolled back the released junior's hours/streaks but left
 *       `lastDutyEndTime` pointing at the REMOVED duty's end — a phantom rest
 *       violation that blocks the junior from early duties the next day.
 * F-17: `preservedLocksCount` double-counted: a retained LOCK-source assignment was
 *       counted once at retention and again when the Lock Pass re-materialized the
 *       same key.
 * F-19: Preflight `existingLeaveDaysCount` returned the number of leave ENTRIES,
 *       not leave days — a 14-day leave reported as 1.
 * F-20: The validator ran rule accounting only when a nurse had EXACTLY one
 *       assignment on a day; a duplicate-assignment day silently reset the
 *       consecutive-day chain, masking H2 violations spanning it.
 * F-21: REGENERATE_BLOCK with a missing blockIndex silently degraded to a
 *       full-roster pass; a missing/zero schedule.blockWeeks threw an opaque
 *       RangeError ("Invalid time value") instead of a clear validation error.
 *
 * (F-18 is a type-hygiene fix with identical behavior; F-22 is a documented design
 *  limitation; F-23 is dead-code removal — none observable, covered by tsc + suites.)
 *
 * Run: npx tsx docs/engine-audit/repro/f12-f17-f19-f20-f21-remainder.test.ts
 */
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import { ScheduleValidator } from '../../../src/services/validation/ScheduleValidator';
import { ScheduleGenerationService } from '../../../server/services/solver/scheduleGenerationService';
import { GenerationPreflightService } from '../../../server/services/solver/generationPreflightService';
import type { IRepository } from '../../../src/services/repository/IRepository';
import type {
  Schedule, Nurse, DutyWindow, SeniorityLevel, DoctorSession, LockEntry, Assignment, LeaveEntry, Rule,
} from '../../../src/types';

const levels: SeniorityLevel[] = [
  { id: 'lvl-sr', name: 'Senior', isSenior: true },
  { id: 'lvl-jr', name: 'Junior', isSenior: false },
] as unknown as SeniorityLevel[];
const dutyE: DutyWindow = { id: 'duty-e', name: 'Early', acronym: 'E', startTime: '08:00', endTime: '16:00', active: true } as unknown as DutyWindow;
const dutyL: DutyWindow = { id: 'duty-l', name: 'Late', acronym: 'L', startTime: '13:30', endTime: '22:00', active: true } as unknown as DutyWindow;
const mkNurse = (id: string, name: string, levelId: string, prefs: any[] = []): Nurse =>
  ({ id, fullName: name, gmail: `${id}@x.com`, active: true, isClinicNurse: true, contractPercent: 100, seniorityLevelId: levelId, capabilityIds: [], preferences: prefs } as unknown as Nurse);
const ncOff: Rule = { id: 'rule-nurse-clinic', templateKey: 'DEDICATED_NURSE_CLINIC', name: 'Dedicated Nurse Clinic', enabled: false, severity: 'HARD', value: 1 } as unknown as Rule;
const plusOneOff: Rule = { id: 'rule-nurse-plus-one', templateKey: 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS', name: '+1 Nurse', enabled: false, severity: 'HARD', value: 1 } as unknown as Rule;
const h2Rule = (value: number): Rule =>
  ({ id: 'rule-h2', templateKey: 'MAX_CONSECUTIVE_DAYS', name: 'Max Consecutive Working Days', enabled: true, severity: 'HARD', value } as unknown as Rule);
const h7Off: Rule = { id: 'rule-h7-max-hours', templateKey: 'MAX_WORKING_HOURS_PER_PERIOD', name: 'Max Hours', enabled: false, severity: 'HARD', value: 105 } as unknown as Rule;

function mkRepo(seed: Record<string, any[]>) {
  const db: Record<string, any[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, [...v]]));
  const ops: { op: string; collection: string; ids: string[] }[] = [];
  const repo = {
    async get(c: string, id: string) { return (db[c] || []).find((x) => x.id === id) || null; },
    async list(c: string) { return [...(db[c] || [])]; },
    async create(c: string, data: any) { const item = { id: data.id || `${c}-${(db[c] || []).length}`, ...data }; (db[c] ||= []).push(item); return item; },
    async update(c: string, id: string, patch: any) { const item = (db[c] || []).find((x) => x.id === id); if (item) Object.assign(item, patch); return item; },
    async bulkRemove(c: string, ids: string[]) { ops.push({ op: 'bulkRemove', collection: c, ids: [...ids] }); const s = new Set(ids); db[c] = (db[c] || []).filter((x) => !s.has(x.id)); },
    async bulkUpsert(c: string, items: any[]) { ops.push({ op: 'bulkUpsert', collection: c, ids: items.map((i) => i.id) }); const col = (db[c] ||= []); for (const it of items) { const i = col.findIndex((x) => x.id === it.id); if (i >= 0) col[i] = it; else col.push(it); } return items; },
  } as unknown as IRepository;
  return { repo, db, ops };
}

async function main() {
  const failures: string[] = [];

  // ---------- F-12: released junior must not carry the removed duty's end time ----------
  // 3-day schedule, H2 max = 2, duty target = 8h, H7 rule DISABLED. The pool's entry
  // condition (earned < target) is what keeps it from re-floating the released junior
  // on 03-02 and overwriting the stale lastDutyEndTime — this holds even for the
  // LEGACY pool whose own F-7 bug ignores the configured streak ceiling.
  //  03-01: doc session 10:00–15:00 → junior (rank-1 pairing) on duty-e; H1 swaps the
  //         senior in; pool re-floats the released junior (earned 0 < 8) on duty-e.
  //  03-02: doc session 14:00–21:30 → junior on duty-l (13:30–22:00); H1 swap releases
  //         the junior again (senior rest 21.5h OK). Pool skips her (earned 8 = target).
  //         Legacy leaves junior.lastDutyEndTime = '2026-03-02 22:00' — a duty she no
  //         longer works. Fixed code restores her real last duty end (03-01 16:00).
  //  03-03: doc session 08:00–12:00 → only duty-e fully covers. The senior is H2-blocked
  //         (worked 03-01 + 03-02). Junior rested all of 03-02: fixed → junior on
  //         duty-e; legacy → phantom 10h-rest block on duty-e degrades the slot to the
  //         non-overlapping late duty.
  {
    const schedule: Schedule = { id: 's-f12', name: 's-f12', startDate: '2026-03-01', endDate: '2026-03-03', blockWeeks: 1, hoursTargetFullTime: 8, status: 'DRAFT', activeVersionNumber: 1 } as unknown as Schedule;
    const junior = mkNurse('n-jr', 'Alice Junior', 'lvl-jr', [{ kind: 'DOCTOR', refId: 'doc-1', rank: 1 }]);
    const senior = mkNurse('n-sr', 'Zara Senior', 'lvl-sr');
    const sessions: DoctorSession[] = [
      { id: 'se-1', doctorId: 'doc-1', date: '2026-03-01', startTime: '10:00', endTime: '15:00' },
      { id: 'se-2', doctorId: 'doc-1', date: '2026-03-02', startTime: '14:00', endTime: '21:30' },
      { id: 'se-3', doctorId: 'doc-1', date: '2026-03-03', startTime: '08:00', endTime: '12:00' },
    ] as unknown as DoctorSession[];
    const res = await SchedulingEngine.generate(
      schedule, 'GENERATE_ALL', [], [junior, senior], levels, [dutyE, dutyL], [], [], sessions, [], [], [ncOff, plusOneOff, h2Rule(2), h7Off]
    );
    const day2Doc = res.assignments.find((a) => a.date === '2026-03-02' && a.kind === 'DOCTOR');
    const day3Doc = res.assignments.find((a) => a.date === '2026-03-03' && a.kind === 'DOCTOR');
    console.log(`F-12 03-02 doctor duty: ${day2Doc?.nurseId}/${day2Doc?.dutyWindowId} (expect n-sr/duty-l via H1 swap — scenario precondition)`);
    console.log(`F-12 03-03 doctor duty: ${day3Doc?.nurseId}/${day3Doc?.dutyWindowId} (expect n-jr/duty-e; legacy bug: phantom rest block → ${day3Doc?.dutyWindowId ?? 'none'})`);
    if (!(day2Doc?.nurseId === 'n-sr' && day2Doc?.dutyWindowId === 'duty-l'))
      failures.push(`F-12 PRECONDITION: H1 swap did not place the senior on 03-02 (got ${day2Doc?.nurseId}/${day2Doc?.dutyWindowId})`);
    if (!(day3Doc?.nurseId === 'n-jr' && day3Doc?.dutyWindowId === 'duty-e'))
      failures.push(`F-12 REGRESSION: released junior not on duty-e for the 08:00 session (got ${day3Doc?.nurseId}/${day3Doc?.dutyWindowId}) — stale lastDutyEndTime`);
  }

  // ---------- F-17: retained LOCK assignment + matching LockEntry counted ONCE ----------
  {
    const schedule: Schedule = { id: 's-f17', name: 's-f17', startDate: '2026-03-02', endDate: '2026-03-02', blockWeeks: 1, hoursTargetFullTime: 8, status: 'DRAFT', activeVersionNumber: 1 } as unknown as Schedule;
    const existing: Assignment[] = [
      { id: 'asgn-lock-n1-2026-03-02', scheduleId: 's-f17', nurseId: 'n1', date: '2026-03-02', dutyWindowId: 'duty-e', kind: 'CLINICAL_ROLE', clinicalRoleId: 'role-x', locked: true, source: 'LOCK' },
    ] as unknown as Assignment[];
    const locks: LockEntry[] = [
      { id: 'lk-1', nurseId: 'n1', date: '2026-03-02', mode: 'ASSIGNMENT', dutyWindowId: 'duty-e', assignmentKind: 'CLINICAL_ROLE', targetRefId: 'role-x', createdAt: '2026-02-01T00:00:00Z' },
    ] as unknown as LockEntry[];
    const res = await SchedulingEngine.generate(
      schedule, 'REBALANCE', existing, [mkNurse('n1', 'Ana', 'lvl-sr')], levels, [dutyE], [], [], [], locks, [], [ncOff, plusOneOff]
    );
    console.log(`F-17 preservedLocksCount: ${res.preservedLocksCount} (expect 1; legacy bug: 2 — retained + re-materialized)`);
    if (res.preservedLocksCount !== 1) failures.push(`F-17 REGRESSION: preservedLocksCount = ${res.preservedLocksCount}, expected 1`);
  }

  // ---------- F-19: leave DAYS inside the window, not leave entries ----------
  {
    const { repo } = mkRepo({
      schedules: [{ id: 's-f19', name: 's-f19', startDate: '2026-03-01', endDate: '2026-03-14', blockWeeks: 2, hoursTargetFullTime: 80, status: 'DRAFT', activeVersionNumber: 1 }],
      nurses: [mkNurse('n1', 'Ana', 'lvl-sr'), mkNurse('n2', 'Bo', 'lvl-jr')],
      doctors: [], doctorSessions: [], clinicalRoles: [], locks: [], rules: [ncOff],
      leaveEntries: [
        // 14-day leave, 10 days inside the window (02-25..03-10 → 03-01..03-10)
        { id: 'lv-1', nurseId: 'n1', leaveTypeId: 'lt', startDate: '2026-02-25', endDate: '2026-03-10', approved: true, hoursCredited: 112 },
      ],
    });
    const report = await GenerationPreflightService.evaluate('s-f19', repo);
    console.log(`F-19 existingLeaveDaysCount: ${report.existingLeaveDaysCount} (expect 10 in-window days; legacy bug: 1 — entry count)`);
    if (report.existingLeaveDaysCount !== 10) failures.push(`F-19 REGRESSION: existingLeaveDaysCount = ${report.existingLeaveDaysCount}, expected 10`);
  }

  // ---------- F-20: duplicate-assignment day must not reset the H2 chain ----------
  {
    const schedule: Schedule = { id: 's-f20', name: 's-f20', startDate: '2026-03-02', endDate: '2026-03-04', blockWeeks: 1, hoursTargetFullTime: 24, status: 'DRAFT', activeVersionNumber: 1 } as unknown as Schedule;
    const nurse = mkNurse('n1', 'Ana', 'lvl-sr');
    const asgns: Assignment[] = [
      { id: 'a1', scheduleId: 's-f20', nurseId: 'n1', date: '2026-03-02', dutyWindowId: 'duty-e', kind: 'CLINICAL_ROLE', locked: false, source: 'GENERATED' },
      { id: 'a2', scheduleId: 's-f20', nurseId: 'n1', date: '2026-03-03', dutyWindowId: 'duty-e', kind: 'CLINICAL_ROLE', locked: false, source: 'GENERATED' },
      { id: 'a2b', scheduleId: 's-f20', nurseId: 'n1', date: '2026-03-03', dutyWindowId: 'duty-l', kind: 'CLINICAL_ROLE', locked: false, source: 'MANUAL' }, // duplicate day
      { id: 'a3', scheduleId: 's-f20', nurseId: 'n1', date: '2026-03-04', dutyWindowId: 'duty-e', kind: 'CLINICAL_ROLE', locked: false, source: 'GENERATED' },
    ] as unknown as Assignment[];
    const report = ScheduleValidator.validate(schedule, asgns, [nurse], levels, [dutyE, dutyL], [], [], [], [], [h2Rule(2), ncOff]);
    const dupFinding = report.findings.find((f) => f.id.startsWith('h4-dup-n1'));
    const h2Finding = report.findings.find((f) => f.id.startsWith('h2-days-n1'));
    console.log(`F-20 duplicate-day DATA_ISSUE: ${dupFinding ? 'reported' : 'MISSING'} (must stay reported)`);
    console.log(`F-20 H2 finding across the duplicate day: ${h2Finding ? h2Finding.id : 'none'} (expect h2-days-n1-2026-03-04 = 3 consecutive > 2; legacy bug: chain silently reset)`);
    if (!dupFinding) failures.push('F-20 SANITY: duplicate-assignment DATA_ISSUE disappeared');
    if (!h2Finding) failures.push('F-20 REGRESSION: 3-day streak spanning a duplicate day raised no H2 finding');
  }

  // ---------- F-21: REGENERATE_BLOCK bound validation ----------
  {
    const seed = (id: string, blockWeeks: number | undefined) => mkRepo({
      schedules: [{ id, name: id, startDate: '2026-03-02', endDate: '2026-03-15', blockWeeks, hoursTargetFullTime: 80, status: 'DRAFT', activeVersionNumber: 1 }],
      nurses: [mkNurse('n1', 'Ana', 'lvl-sr')],
      seniorityLevels: levels as unknown as any[],
      dutyWindows: [dutyE as unknown as any],
      clinicalRoles: [], specialties: [], doctors: [], workingHoursPeriods: [],
      doctorSessions: [], leaveEntries: [], locks: [], assignments: [], rules: [ncOff as unknown as any], audit: [],
    });
    // (a) missing blockIndex — legacy silently ran a FULL-ROSTER regeneration
    let errA: Error | null = null;
    try {
      await ScheduleGenerationService.execute('s-f21a', { mode: 'REGENERATE_BLOCK' } as any, seed('s-f21a', 2).repo, 'Audit Bot');
    } catch (e) { errA = e as Error; }
    console.log(`F-21a missing blockIndex: ${errA ? `rejected ("${errA.message}")` : 'ACCEPTED'} (expect clear rejection; legacy bug: silent full-roster pass)`);
    if (!errA || !errA.message.includes('blockIndex'))
      failures.push(`F-21 REGRESSION: missing blockIndex ${errA ? `threw unrelated error "${errA.message}"` : 'silently ran a full-roster pass'}`);
    // (b) blockWeeks undefined — legacy threw an opaque RangeError from toISOString()
    let errB: Error | null = null;
    try {
      await ScheduleGenerationService.execute('s-f21b', { mode: 'REGENERATE_BLOCK', blockIndex: 0 } as any, seed('s-f21b', undefined).repo, 'Audit Bot');
    } catch (e) { errB = e as Error; }
    console.log(`F-21b blockWeeks undefined: ${errB ? `rejected ("${errB.message}")` : 'ACCEPTED'} (expect clear blockWeeks error; legacy bug: "Invalid time value")`);
    if (!errB || !errB.message.includes('blockWeeks'))
      failures.push(`F-21 REGRESSION: invalid blockWeeks ${errB ? `surfaced as opaque "${errB.message}"` : 'was accepted'}`);
  }

  if (failures.length) {
    console.error('\nFAIL:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nPASS: F-12, F-17, F-19, F-20, F-21 fixed — symmetric swap rollback, honest lock/leave metrics, unbroken validator chains, validated block bounds.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
