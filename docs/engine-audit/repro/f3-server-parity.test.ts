/**
 * Repro / regression test for FINDING F-3 (server/client generation parity).
 *
 * The server ScheduleGenerationService did not forward `workingHoursPeriods`
 * and `doctors` to SchedulingEngine.generate (the client path does), so:
 *  1. Dedicated working-hours periods were ignored server-side — hour targets
 *     silently fell back to schedule.hoursTargetFullTime (or 40 h/week).
 *  2. H8 doctor→specialty allocation lost the doctor-profile fallback, so
 *     nurses allocated to a doctor's specialty could not staff that doctor's
 *     sessions when the session record itself carried no specialtyId.
 *
 * Discriminators (7-day schedule 2026-03-01..07):
 *  - schedule.hoursTargetFullTime = 80h, but a dedicated period exactly
 *    matching the range sets 24h. Post-fix each nurse gets 24h (3 shifts);
 *    pre-fix ~80h (10 shifts... capped by days => 7+).
 *  - "Pria" (only SPECIALTY pref 'spec-x') is the only clinic nurse; doctor
 *    doc-1 has specialtyIds ['spec-x'] but his session has NO specialtyId.
 *    Post-fix the session is staffed by Pria; pre-fix H8 blocks her and the
 *    slot goes unmet.
 *
 * Run: npx tsx docs/engine-audit/repro/f3-server-parity.test.ts
 */
import { ScheduleGenerationService } from '../../../server/services/solver/scheduleGenerationService';
import type { IRepository } from '../../../src/services/repository/IRepository';

// ---------- minimal in-memory repository ----------
const db: Record<string, any[]> = {
  schedules: [
    {
      id: 'sched-par',
      name: 'Parity Test',
      startDate: '2026-03-01',
      endDate: '2026-03-07',
      blockWeeks: 1,
      hoursTargetFullTime: 80, // stale value — dedicated period below must win
      status: 'DRAFT',
      activeVersionNumber: 1,
    },
  ],
  workingHoursPeriods: [
    {
      id: 'whp-1',
      name: 'March Week 1',
      year: '2026',
      startDate: '2026-03-01',
      endDate: '2026-03-07',
      workingHours: 24, // authoritative: 3 x 8h shifts per full-timer
    },
  ],
  nurses: [
    {
      id: 'n-nora',
      fullName: 'Nora Float',
      active: true,
      isClinicNurse: false, // cannot take DOCTOR slots — isolates the H8 check on Pria
      contractPercent: 100,
      seniorityLevelId: 'lvl-sr',
      capabilityIds: [],
      preferences: [],
    },
    {
      id: 'n-pria',
      fullName: 'Pria Specialty',
      active: true,
      isClinicNurse: true,
      contractPercent: 100,
      seniorityLevelId: 'lvl-sr',
      capabilityIds: [],
      preferences: [{ kind: 'SPECIALTY', refId: 'spec-x', rank: 1 }],
    },
  ],
  seniorityLevels: [{ id: 'lvl-sr', name: 'Senior', isSenior: true }],
  dutyWindows: [
    { id: 'duty-e', name: 'Early', acronym: 'E', startTime: '09:00', endTime: '17:00', active: true },
  ],
  clinicalRoles: [],
  specialties: [{ id: 'spec-x', code: 'SPX', name: 'Specialty X' }],
  doctors: [
    { id: 'doc-1', fullName: 'Dr. One', active: true, specialtyIds: ['spec-x'] },
  ],
  doctorSessions: [
    // NOTE: no specialtyId on the session — only the doctor profile links doc-1 to spec-x
    { id: 'sess-1', doctorId: 'doc-1', date: '2026-03-02', startTime: '09:00', endTime: '17:00', cancelled: false },
  ],
  locks: [],
  leaveEntries: [],
  rules: [],
  assignments: [],
  audit: [],
};

const repo = {
  async get(collection: string, id: string) {
    return (db[collection] || []).find((x) => x.id === id) || null;
  },
  async list(collection: string) {
    return [...(db[collection] || [])];
  },
  async create(collection: string, data: any) {
    const item = { id: data.id || `${collection}-${db[collection]?.length || 0}`, ...data };
    (db[collection] ||= []).push(item);
    return item;
  },
  async update(collection: string, id: string, patch: any) {
    const item = (db[collection] || []).find((x) => x.id === id);
    if (item) Object.assign(item, patch);
    return item;
  },
  async bulkRemove(collection: string, ids: string[]) {
    const set = new Set(ids);
    db[collection] = (db[collection] || []).filter((x) => !set.has(x.id));
  },
  async bulkUpsert(collection: string, items: any[]) {
    const col = (db[collection] ||= []);
    for (const item of items) {
      const idx = col.findIndex((x) => x.id === item.id);
      if (idx >= 0) col[idx] = item;
      else col.push(item);
    }
    return items;
  },
} as unknown as IRepository;

async function main() {
  const result = await ScheduleGenerationService.execute('sched-par', { mode: 'GENERATE_ALL' }, repo, 'Audit Bot');

  const assignments = db.assignments;
  const hoursOf = (nid: string) => assignments.filter((a) => a.nurseId === nid).length * 8;
  const noraHours = hoursOf('n-nora');
  const priaHours = hoursOf('n-pria');
  const doctorCovered = assignments.some((a) => a.kind === 'DOCTOR' && a.doctorId === 'doc-1' && a.date === '2026-03-02');

  console.log(`Nora duty hours:        ${noraHours}h (expect 24h from dedicated period; legacy bug: 56h+ toward the stale 80h target)`);
  console.log(`Pria duty hours:        ${priaHours}h (expect 24h)`);
  console.log(`doc-1 session staffed:  ${doctorCovered} (expect true via doctor-profile specialty; legacy bug: false)`);
  console.log(`Unmet slots reported:   ${result.unmetSlotsCount}`);

  const failures: string[] = [];
  // F-3a: dedicated period must cap hours at 24h (+ indivisible-shift tolerance => max 25h ⇒ 3 shifts).
  if (noraHours > 24) failures.push(`F-3a REGRESSION: Nora scheduled ${noraHours}h — dedicated 24h period ignored`);
  if (priaHours > 24) failures.push(`F-3a REGRESSION: Pria scheduled ${priaHours}h — dedicated 24h period ignored`);
  if (noraHours < 24) failures.push(`UNDERFILL: Nora got ${noraHours}h, expected 24h`);
  // F-3b: the doctor session must be staffable via the doctor-profile specialty link.
  if (!doctorCovered) failures.push('F-3b REGRESSION: doc-1 session unstaffed — doctors[] not forwarded, H8 blocked the allocated nurse');

  if (failures.length) {
    console.error('\nFAIL:\n' + failures.map((f) => ' - ' + f).join('\n'));
    process.exit(1);
  }
  console.log('\nPASS: F-3 fixed — server generation honors dedicated periods and doctor specialty profiles.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
