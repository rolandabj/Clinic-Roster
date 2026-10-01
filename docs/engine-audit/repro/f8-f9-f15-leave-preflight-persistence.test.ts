/**
 * Repro / regression test for FINDINGS F-8, F-9, F-15.
 *
 * F-8:  `hoursCredited` is a TOTAL for a leave entry, but the engine credited the
 *       full amount to any schedule merely overlapping the leave — a long leave
 *       touching the window wiped out the nurse's schedulable capacity.
 * F-9:  Server preflight counted doctor sessions only (no recurring weekly
 *       patterns, no clinical-role/nurse-clinic quotas) — it could report a
 *       healthy roster for a generation that ends with unmet slots.
 * F-15: Persistence was delete-ALL-then-insert — a crash or concurrent reader
 *       between the two writes saw an empty schedule.
 *
 * Run: npx tsx docs/engine-audit/repro/f8-f9-f15-leave-preflight-persistence.test.ts
 */
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import { ScheduleGenerationService } from '../../../server/services/solver/scheduleGenerationService';
import { GenerationPreflightService } from '../../../server/services/solver/generationPreflightService';
import type { IRepository } from '../../../src/services/repository/IRepository';
import type {
  Schedule, Nurse, DutyWindow, SeniorityLevel, LeaveEntry, Rule,
} from '../../../src/types';

const levels: SeniorityLevel[] = [{ id: 'lvl-sr', name: 'Senior', isSenior: true }] as unknown as SeniorityLevel[];
const dutyE: DutyWindow = { id: 'duty-e', name: 'Early', acronym: 'E', startTime: '09:00', endTime: '17:00', active: true } as unknown as DutyWindow;
const mkNurse = (id: string, name: string): Nurse =>
  ({ id, fullName: name, active: true, isClinicNurse: true, contractPercent: 100, seniorityLevelId: 'lvl-sr', capabilityIds: [], preferences: [] } as unknown as Nurse);
const ncOff: Rule = { id: 'rule-nurse-clinic', templateKey: 'DEDICATED_NURSE_CLINIC', name: 'Dedicated Nurse Clinic', enabled: false, severity: 'HARD', value: 1 } as unknown as Rule;

// Minimal in-memory repository with an operation log (for F-9 / F-15)
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

  // ---------- F-8: 10-day / 80h leave overlapping the window by 6 days credits 48h, not 80h ----------
  {
    const schedule: Schedule = { id: 's-f8', name: 's-f8', startDate: '2026-03-01', endDate: '2026-03-07', blockWeeks: 1, hoursTargetFullTime: 56, status: 'DRAFT', activeVersionNumber: 1 } as unknown as Schedule;
    const leave: LeaveEntry = { id: 'lv-1', nurseId: 'n1', leaveTypeId: 'lt', startDate: '2026-02-25', endDate: '2026-03-06', approved: true, hoursCredited: 80 } as unknown as LeaveEntry;
    // leave spans 10 days total, 6 inside the window (03-01..03-06) => prorated 48h
    const res = await SchedulingEngine.generate(
      schedule, 'GENERATE_ALL', [], [mkNurse('n1', 'Lia')], levels, [dutyE], [], [], [], [], [leave], [ncOff]
    );
    const asgns = res.assignments.filter((a) => a.nurseId === 'n1');
    const hours = asgns.length * 8;
    console.log(`F-8  duty hours with partial-overlap leave: ${hours}h on [${asgns.map((a) => a.date).join(', ')}] (expect 8h on 2026-03-07; legacy bug: 0h — full 80h charged)`);
    // dutyTarget = 56 contract − 48 prorated leave = 8h ⇒ exactly one shift, on the only non-leave day.
    if (hours !== 8) failures.push(`F-8 REGRESSION: expected 8h schedulable, got ${hours}h`);
    if (asgns.some((a) => a.date !== '2026-03-07')) failures.push('F-8/H5 BREACH: assigned during leave days');
  }

  // ---------- F-9: preflight demand = sessions (incl. recurring patterns) + role quotas + NC quota ----------
  {
    const { repo } = mkRepo({
      schedules: [{ id: 's-f9', name: 's-f9', startDate: '2026-03-02', endDate: '2026-03-04', blockWeeks: 1, hoursTargetFullTime: 24, status: 'DRAFT', activeVersionNumber: 1 }],
      nurses: [mkNurse('n1', 'Ana'), mkNurse('n2', 'Bo')],
      doctors: [{ id: 'doc-1', fullName: 'Dr. Pat', active: true, specialtyIds: ['spec-x'], weeklyPattern: [{ weekday: 1, startTime: '09:00', endTime: '13:00' }] }], // Monday = 2026-03-02, NOT stored
      doctorSessions: [{ id: 'sess-stored', doctorId: 'doc-2', date: '2026-03-03', startTime: '09:00', endTime: '13:00', cancelled: false }],
      clinicalRoles: [{ id: 'role-phl', name: 'Blood Collection & IV', acronym: 'PHL', defaultDailyQuota: 1 }],
      locks: [], leaveEntries: [], rules: [], // NC rule absent => enabled, quota 1
    });
    const report = await GenerationPreflightService.evaluate('s-f9', repo);
    const day1 = report.doctorCoverageDemand.find((d) => d.date === '2026-03-02');
    console.log(`F-9  sessions counted:   ${report.doctorSessionsCount} (expect 2 = 1 stored + 1 recurring; legacy bug: 1)`);
    console.log(`F-9  required on 03-02:  ${day1?.requiredNurses} (expect 3 = 1 session + 1 PHL + 1 NC; legacy bug: 0 — recurring invisible, quotas ignored)`);
    if (report.doctorSessionsCount !== 2) failures.push(`F-9 REGRESSION: doctorSessionsCount ${report.doctorSessionsCount}, recurring pattern not counted`);
    if (day1?.requiredNurses !== 3) failures.push(`F-9 REGRESSION: requiredNurses on 03-02 = ${day1?.requiredNurses}, expected 3`);
    if (!report.warnings.some((w) => w.toLowerCase().includes('deficit')))
      failures.push('F-9 REGRESSION: 3-required vs 2-available day raised no staffing deficit warning');
  }

  // ---------- F-15: upsert first, then remove ONLY stale ids ----------
  {
    const lockAsgnId = 'asgn-lock-n1-2026-03-02';
    const { repo, db, ops } = mkRepo({
      schedules: [{ id: 's-f15', name: 's-f15', startDate: '2026-03-02', endDate: '2026-03-02', blockWeeks: 1, hoursTargetFullTime: 8, status: 'DRAFT', activeVersionNumber: 1 }],
      nurses: [mkNurse('n1', 'Ana')],
      seniorityLevels: levels as unknown as any[],
      dutyWindows: [dutyE as unknown as any],
      clinicalRoles: [], specialties: [], doctors: [], workingHoursPeriods: [],
      doctorSessions: [], leaveEntries: [], rules: [ncOff as unknown as any], audit: [],
      locks: [{ id: 'lk-1', nurseId: 'n1', date: '2026-03-02', mode: 'ASSIGNMENT', dutyWindowId: 'duty-e', assignmentKind: 'CLINICAL_ROLE', targetRefId: 'role-float', createdAt: '2026-02-01T00:00:00Z' }],
      assignments: [
        { id: lockAsgnId, scheduleId: 's-f15', nurseId: 'n1', date: '2026-03-02', dutyWindowId: 'duty-e', kind: 'CLINICAL_ROLE', locked: true, source: 'LOCK' },
        { id: 'asgn-old-stale', scheduleId: 's-f15', nurseId: 'n-gone', date: '2026-03-02', dutyWindowId: 'duty-e', kind: 'CLINICAL_ROLE', locked: false, source: 'GENERATED' },
      ],
    });
    await ScheduleGenerationService.execute('s-f15', { mode: 'GENERATE_ALL' }, repo, 'Audit Bot');
    const asgnOps = ops.filter((o) => o.collection === 'assignments');
    const firstOp = asgnOps[0]?.op;
    const removed = asgnOps.filter((o) => o.op === 'bulkRemove').flatMap((o) => o.ids);
    console.log(`F-15 first persistence op:  ${firstOp} (expect bulkUpsert; legacy bug: bulkRemove of ALL rows first)`);
    console.log(`F-15 removed ids:           [${removed.join(', ')}] (expect only asgn-old-stale; legacy bug: every old id incl. the preserved lock)`);
    if (firstOp !== 'bulkUpsert') failures.push(`F-15 REGRESSION: first op was ${firstOp} — empty-schedule window exists`);
    if (removed.includes(lockAsgnId)) failures.push('F-15 REGRESSION: preserved lock assignment was deleted during persistence');
    if (!removed.includes('asgn-old-stale')) failures.push('F-15 SANITY: stale assignment was not cleaned up');
    if (!db.assignments.some((a: any) => a.id === lockAsgnId)) failures.push('F-15 SANITY: lock assignment missing after persistence');
    if (db.assignments.some((a: any) => a.id === 'asgn-old-stale')) failures.push('F-15 SANITY: stale assignment still present after persistence');
  }

  if (failures.length) {
    console.error('\nFAIL:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nPASS: F-8, F-9, F-15 fixed — leave prorated to the window, preflight demand matches the engine, persistence never exposes an empty schedule.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
