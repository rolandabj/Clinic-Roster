/**
 * Repro / regression test for FINDINGS F-10, F-11, F-16.
 *
 * F-10: The +1 hourly pass treated 09:00–21:00 as "operating" on ANY day with a
 *       session — a clinic that closed at noon still demanded evening coverage,
 *       producing phantom duty extensions to 22:00.
 * F-11: Duty choice let the isPriority flag dominate coverage — a "priority"
 *       morning window with ZERO overlap beat a fully-covering standard duty
 *       for an evening session.
 * F-16: Strategy-A duty extension rewrote planner-authored MANUAL assignments
 *       (locked=false) and mutated the caller's Assignment objects in place.
 *
 * Run: npx tsx docs/engine-audit/repro/f10-f11-f16-plusone-coverage.test.ts
 */
import { SchedulingEngine } from '../../../src/services/engine/SchedulingEngine';
import type {
  Schedule, Nurse, DutyWindow, SeniorityLevel, DoctorSession, Rule, Assignment,
} from '../../../src/types';

const mkSchedule = (id: string, day: string, target: number): Schedule =>
  ({ id, name: id, startDate: day, endDate: day, blockWeeks: 1, hoursTargetFullTime: target, status: 'DRAFT', activeVersionNumber: 1 } as unknown as Schedule);

const levels: SeniorityLevel[] = [{ id: 'lvl-sr', name: 'Senior', isSenior: true }] as unknown as SeniorityLevel[];

const mkNurse = (id: string, name: string): Nurse =>
  ({ id, fullName: name, active: true, isClinicNurse: true, contractPercent: 100, seniorityLevelId: 'lvl-sr', capabilityIds: [], preferences: [] } as unknown as Nurse);

const mkDuty = (id: string, acronym: string, start: string, end: string, isPriority = false): DutyWindow =>
  ({ id, name: acronym, acronym, startTime: start, endTime: end, active: true, isPriority } as unknown as DutyWindow);

const mkSession = (date: string, start: string, end: string): DoctorSession =>
  ({ id: `sess-${date}-${start}`, doctorId: 'doc-1', date, startTime: start, endTime: end, cancelled: false } as unknown as DoctorSession);

const ncOff: Rule = { id: 'rule-nurse-clinic', templateKey: 'DEDICATED_NURSE_CLINIC', name: 'Dedicated Nurse Clinic', enabled: false, severity: 'HARD', value: 1 } as unknown as Rule;

const DAY = '2026-03-02';

async function main() {
  const failures: string[] = [];

  // ---------- F-10: morning-only clinic must not demand evening +1 coverage ----------
  {
    const dutyE = mkDuty('duty-e', 'E', '09:00', '17:00');
    const dutyL = mkDuty('duty-l', 'L', '14:00', '22:00');
    const res = await SchedulingEngine.generate(
      mkSchedule('s-f10', DAY, 8), 'GENERATE_ALL', [],
      [mkNurse('n1', 'Ana'), mkNurse('n2', 'Bea'), mkNurse('n3', 'Cia')],
      levels, [dutyE, dutyL], [], [], [mkSession(DAY, '09:00', '12:00')], [], [], [ncOff]
    );
    const lateCount = res.assignments.filter((a) => a.dutyWindowId === 'duty-l').length;
    console.log(`F-10 22:00-ending duties for a 09:00-12:00 clinic: ${lateCount} (expect 0; legacy bug: >=1 phantom extension)`);
    if (lateCount > 0) failures.push(`F-10 REGRESSION: ${lateCount} nurse(s) extended to 22:00 for a clinic that closes at noon`);
  }

  // ---------- F-11: covering standard duty must beat a non-overlapping "priority" duty ----------
  {
    const dutyP = mkDuty('duty-p', 'P', '08:00', '14:00', true); // priority, zero overlap with 17-21
    const dutyL = mkDuty('duty-l', 'L', '13:00', '22:00');       // standard, fully covers 17-21
    // +1 pass disabled so its duty-extension cannot mask the slot-pass bug.
    const plusOneOff: Rule = { id: 'rule-nurse-plus-one', templateKey: 'MIN_ADDITIONAL_NURSE_OVER_DOCTORS', name: 'Additional Nurse Above Doctors', enabled: false, severity: 'HARD', value: 1 } as unknown as Rule;
    const res = await SchedulingEngine.generate(
      mkSchedule('s-f11', DAY, 16), 'GENERATE_ALL', [],
      [mkNurse('n4', 'Dina')], levels, [dutyP, dutyL], [], [],
      [mkSession(DAY, '17:00', '21:00')], [], [], [ncOff, plusOneOff]
    );
    const docAsgn = res.assignments.find((a) => a.kind === 'DOCTOR' && a.doctorId === 'doc-1');
    const dutyId = docAsgn?.dutyWindowId;
    console.log(`F-11 duty chosen for the 17:00-21:00 session:      ${dutyId} (expect duty-l; legacy bug: duty-p — nurse gone by 14:00)`);
    if (!docAsgn) failures.push('F-11 SANITY: evening session not staffed at all');
    else if (dutyId !== 'duty-l') failures.push(`F-11 REGRESSION: session covered by non-overlapping duty ${dutyId}`);
  }

  // ---------- F-16: Strategy-A must not rewrite MANUAL assignments nor mutate caller objects ----------
  {
    const dutyE = mkDuty('duty-e', 'E', '09:00', '17:00');
    const dutyL = mkDuty('duty-l', 'L', '14:00', '22:00');
    const manualAsgn: Assignment = {
      id: 'asgn-manual-mia', scheduleId: 's-f16', nurseId: 'n5', date: DAY, dutyWindowId: 'duty-e',
      kind: 'CLINICAL_ROLE', clinicalRoleId: 'role-float', locked: false, source: 'MANUAL',
      note: 'Planner decision',
    } as unknown as Assignment;

    // Mia is the ONLY nurse: the evening-tail deficit (session runs to 19:00, her
    // manual duty ends 17:00) makes Strategy-A target HER manual assignment directly.
    const res = await SchedulingEngine.generate(
      mkSchedule('s-f16', DAY, 24), 'EMPTY_ONLY', [manualAsgn],
      [mkNurse('n5', 'Mia')], levels, [dutyE, dutyL], [], [],
      [mkSession(DAY, '09:00', '19:00')], [], [], [ncOff]
    );
    const miaResult = res.assignments.find((a) => a.nurseId === 'n5' && a.date === DAY);
    console.log(`F-16 Mia's MANUAL duty in result:                  ${miaResult?.dutyWindowId} (expect duty-e; legacy bug: duty-l)`);
    console.log(`F-16 caller's original object dutyWindowId:        ${manualAsgn.dutyWindowId} (expect duty-e; legacy bug: mutated to duty-l)`);
    if (miaResult?.dutyWindowId !== 'duty-e')
      failures.push(`F-16 REGRESSION: MANUAL assignment rewritten to ${miaResult?.dutyWindowId}`);
    if (manualAsgn.dutyWindowId !== ('duty-e' as string))
      failures.push('F-16 REGRESSION: caller-owned Assignment object mutated in place');
  }

  if (failures.length) {
    console.error('\nFAIL:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nPASS: F-10, F-11, F-16 fixed — operating hours follow real session spans, coverage beats priority flags, manual assignments are inviolable.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
