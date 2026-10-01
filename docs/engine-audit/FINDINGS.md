# Schedule Creation Engine — Logic Audit Findings

**Repo:** `Clinic-Roster` · **Branch:** `arena/01a0f6af-clinic-roster` · **Audit date:** 2026-10-01
**Status:** ✅ **AUDIT + REMEDIATION COMPLETE** — all 24 findings closed (23 fixed, 1 documented as intentional; F-24 user-reported post-audit)
**Companion document:** `docs/schedule-engine-investigation-plan.md` (the plan this audit executed)

---

## Consolidated defect ledger (final)

### Score card

| Severity | Found | Fixed | Documented (intentional) |
|---|---:|---:|---:|
| HIGH     | 6  | 6  | — |
| MEDIUM   | 11 | 11 | — |
| LOW      | 6  | 5  | 1 (F-22) |
| INFO     | 1  | 1  | — |
| **Total**| **24** | **23** | **1** |

Plus 4 pre-seeded hypotheses **disproven / verified OK** (H3 rest formula, UTC date math,
validator cancelled-session filter, determinism) — see the end of this document.

Cumulative remediation diff: **9 source files, +417 / −109 lines**, verified by
**8 differential regression suites** (every one proven to FAIL on the pre-fix code and
PASS on the fixed code) and a clean `tsc --noEmit`.

### Defect table — severity-ranked

| ID | Sev | Component | Defect (one line) | Status | Regression suite |
|---|---|---|---|---|---|
| F-1 | HIGH | Engine | Preserved-assignment hours double-counted → H7 cap & fairness starve pinned nurses | ✅ Fixed | `f1-f2` |
| F-2 | HIGH | Engine | Leave hours charged against the H7 cap twice — 40 h leave costs ~80 h capacity | ✅ Fixed | `f1-f2` |
| F-3 | HIGH | Server solver | Server path omitted `workingHoursPeriods` + `doctors` → different rosters than client (+ collection not registered in store/CRUD) | ✅ Fixed | `f3` |
| F-4 | HIGH | Engine | Inactive nurses receive new duties (incl. via H1 swap and pool) | ✅ Fixed | `f4-f5` |
| F-5 | HIGH | Engine | H1 senior-fixer and float-pool passes ignore `LockEntry(OFF)` | ✅ Fixed | `f4-f5` |
| F-24 | HIGH | Engine | Priority-#1 pairings starved by slot processing order — earlier (late-clinic) slots consume the P1 nurse, their doctor falls to the general pool | ✅ Fixed | `f24` |
| F-6 | MED | Engine | H2 lookback hardcoded to 6 days — configured limits > 6 never enforced | ✅ Fixed | `f6-f7-f13-f14` |
| F-7 | MED | Engine | Float pool hardcodes its own consecutive-day ceiling (5), ignores the H2 rule | ✅ Fixed | `f6-f7-f13-f14` |
| F-8 | MED | Engine + Validator | Partial leave overlap credits the FULL leave entry to the window | ✅ Fixed | `f8-f9-f15` |
| F-9 | MED | Preflight | Readiness demand model blind to recurring sessions and role/NC quotas | ✅ Fixed | `f8-f9-f15` |
| F-10 | MED | Engine + Validator | +1 pass demands coverage for a blanket 09:00–21:00 regardless of actual sessions | ✅ Fixed | `f10-f11-f16` |
| F-11 | MED | Engine | Duty tiers rank priority over coverage — non-covering "priority" duty beats a covering one | ✅ Fixed | `f10-f11-f16` |
| F-12 | MED | Engine | H1 swap rollback asymmetric — released junior keeps removed duty's `lastDutyEndTime`, inflated `weekendsWorked` | ✅ Fixed | `f12-f17-f19-f20-f21` |
| F-13 | MED | Engine | No forward rest check against an already-materialized (locked) tomorrow | ✅ Fixed | `f6-f7-f13-f14` |
| F-14 | MED | Engine + callers | Cross-schedule-boundary streaks/rest invisible (no prior-period history) | ✅ Fixed | `f6-f7-f13-f14` |
| F-15 | MED | Server solver | Delete-all-then-insert persistence — crash/reader window sees an empty schedule | ✅ Fixed | `f8-f9-f15` |
| F-16 | MED | Engine | Strategy-A extension rewrites MANUAL/LOCK assignments and mutates caller objects in place | ✅ Fixed | `f10-f11-f16` |
| F-17 | LOW | Engine | `preservedLocksCount` double-counts retained + re-materialized locks | ✅ Fixed | `f12-f17-f19-f20-f21` |
| F-18 | LOW | Server solver | Always-false `(l as any).scheduleId` lock-scoping clause hidden by cast | ✅ Fixed (type hygiene, behavior unchanged) | `tsc` + all suites |
| F-19 | LOW | Preflight | `existingLeaveDaysCount` counts leave ENTRIES, not days | ✅ Fixed | `f12-f17-f19-f20-f21` |
| F-20 | LOW | Validator | Duplicate-assignment day silently resets the H2/S1 chain, skips H3/H6/H8 | ✅ Fixed | `f12-f17-f19-f20-f21` |
| F-21 | LOW | Server solver | `REGENERATE_BLOCK`: missing `blockIndex` → silent full-roster pass; falsy `blockWeeks` → opaque `RangeError` | ✅ Fixed | `f12-f17-f19-f20-f21` |
| F-22 | LOW | Engine + Validator | H6 hard credential gate covers only PHL | 📝 Documented — intentional design limitation, both sites annotated | n/a |
| F-23 | INFO | Engine | Dead code: unused `uuidv4`, never-read scores, write-only streak shadow counters | ✅ Removed | `tsc` + all suites |

### Verification matrix

Every suite is a standalone differential test: run against the pre-fix code (via
`git stash`) it fails on the exact defect symptoms; against the fixed code it passes.
Run each with `npx tsx docs/engine-audit/repro/<file>`.

| Suite | Covers | Key legacy → fixed evidence |
|---|---|---|
| `f1-f2-hours-accounting.test.ts` | F-1, F-2 | Alice (40 h leave) 0 h → 40 h; Bella (3 locks) 56 h → 80 h |
| `f4-f5-availability-guards.test.ts` | F-4, F-5 | inactive nurse 5 asgn → 0; OFF-pinned floated → clean |
| `f3-server-parity.test.ts` | F-3 | server 48 h vs dedicated 24 h target → 24 h; doctor session unstaffed → staffed |
| `f6-f7-f13-f14-h2-h3-gaps.test.ts` | F-6, F-7, F-13, F-14 | streak 18 under H2=8 → 8; pool 5 under H2=3 → 2; 10 h rest before lock → none; 7-day cross-boundary streak → rests |
| `f10-f11-f16-plusone-coverage.test.ts` | F-10, F-11, F-16 | phantom 22:00 extension → none; non-covering priority duty → covering duty; MANUAL rewritten + mutated → untouched |
| `f8-f9-f15-leave-preflight-persistence.test.ts` | F-8, F-9, F-15 | 0 h schedulable → 8 h; preflight 1 session/0 required → 2/3 + deficit warning; delete-all-first → upsert-first, only stale removed |
| `f12-f17-f19-f20-f21-remainder.test.ts` | F-12, F-17, F-19, F-20, F-21 | junior on non-overlap late duty → early duty; lock count 2 → 1; 14-day leave = 1 → 10; missing H2 finding → flagged; silent/opaque block errors → clear rejections |
| `f24-priority-pairing-starvation.test.ts` | F-24 | Dr. Samer staffed by general-pool Cheene while P1 nurse Roland consumed by the earlier 9–9 slot → Roland on Samer, P1 pairings 0 → 1 |

### Fix ranking (as executed)

| # | Findings | Theme | Outcome |
|---|---|---|---|
| 1 | F-1, F-2 | Hours accounting (highest roster impact) | ✅ done |
| 2 | F-4, F-5 | Availability guards (inactive nurses, OFF locks) | ✅ done |
| 3 | F-3 | Server/client parity (+ 2 extra root causes found: store & CRUD registration) | ✅ done |
| 4 | F-6, F-7, F-13, F-14 | H2/H3 enforcement gaps | ✅ done |
| 5 | F-10, F-11, F-16 | +1 pass & coverage scoring | ✅ done |
| 6 | F-8, F-9, F-15 | Leave proration, preflight drift, persistence atomicity | ✅ done |
| 7 | F-12, F-17–F-23 | State rollback, metrics, hygiene | ✅ done — ledger closed |

---

## Methodology

- Step 1 baseline: `npm install --legacy-peer-deps` succeeds; `tsc --noEmit` passes with **0 type errors**.
- Full read of `src/services/engine/SchedulingEngine.ts` (1,987 lines) plus the server orchestration
  (`scheduleGenerationService.ts`, `generationPreflightService.ts`), validator
  (`ScheduleValidator.ts` + server wrapper), helper services (`hoursAccounting.ts`,
  `workingHoursPeriodService.ts`, `nurseClinicUtils.ts`), entry routes and UI callers.
- Every finding below was verified against the actual code path (file:line cited); the
  pre-seeded hypotheses from the plan were confirmed, downgraded, or disproven with evidence.

Severity: **CRITICAL** = produces wrong rosters / violates hard rules · **HIGH** = materially wrong
behavior in common cases · **MEDIUM** = wrong in realistic edge cases or metric drift ·
**LOW** = cosmetic / latent.

---

## CRITICAL / HIGH

### F-1 (HIGH) — ✅ FIXED (2026-10-01) — Preserved assignment hours are double-counted → H7 and fairness skewed
`src/services/engine/SchedulingEngine.ts:537–556` and `:854`

At nurse-state init, every preserved assignment (lock-materialized, MANUAL, and in
`EMPTY_ONLY` mode all retained GENERATED ones) is summed into
`initialPreservedDutyHours` → `state.totalDutyHoursEarned` (line 553). Then, when the day
loop reaches each preserved assignment's date, the **same shift hours are added again**
(line 854: `state.totalDutyHoursEarned += calculateDutyDurationHours(duty)`).

**Effect:** any nurse with pinned/manual shifts — or any `FILL_UNASSIGNED` /
`REGENERATE_BLOCK` run (which preserves all out-of-scope GENERATED shifts) — has their
earned hours inflated up to 2×. The H7 max-hours hard check (line 1177) then rejects them
far too early, and the S3 fairness score (line 1287) deprioritizes them. **Partial
regeneration systematically starves nurses who already have assignments.**
*Fix:* drop the per-day re-add for preserved assignments, or initialize
`totalDutyHoursEarned` to leave hours only and let the day loop accumulate.

### F-2 (HIGH) — ✅ FIXED (2026-10-01) — Leave hours are double-counted against nurses in the H7 cap
`SchedulingEngine.ts:553, 568–575, 1177`

`state.totalDutyHoursEarned` is initialized **including** `nurseLeaveHours` (line 553),
while `dutyTarget = contractTarget − leaveHours` (line 570) and `maxAllowedHours` derive
from that already-reduced `dutyTarget`. The H7 check compares
`totalDutyHoursEarned + shift > maxAllowedHours` **without subtracting the leave credit
back** — so leave is subtracted from the allowance *and* added to the consumption.
A nurse with 40 h approved leave loses ~80 h of schedulable capacity.
Note the S3 fairness formula (line 1287) *does* subtract `leaveHoursCredited` back —
proving the H7 comparison is inconsistent, not intentional.
*Fix:* compare `(totalDutyHoursEarned − leaveHoursCredited) + shift > maxAllowedHours`.

### F-3 (HIGH) — ✅ FIXED (2026-10-01) — Server and client generation paths produce different rosters
`server/services/solver/scheduleGenerationService.ts:118–131` vs `src/components/views/SchedulesView.tsx:792–810`

The engine takes `workingHoursPeriods` and `doctors` as its last parameters. The client
passes both; the **server service passes neither** (grep: no `workingHoursPeriods` or
`doctors` anywhere in `server/services/solver/`). Consequences server-side:
1. Dedicated working-hours periods are ignored — hour targets fall back to
   `schedule.hoursTargetFullTime` or the 40 h/week prorate, so H7 caps and fairness
   targets differ from the client run.
2. `doctorSpecialtiesMap` is built only from sessions, so H8 strict-allocation checks
   (`doctorId → specialtyIds` fallback at line 1140) are weaker.
Generating from the API vs the UI yields different schedules for identical data.
*Fix:* load and pass `workingHoursPeriods` and `doctors` in `ScheduleGenerationService.execute`.

### F-4 (HIGH) — ✅ FIXED (2026-10-01) — Inactive nurses are schedulable
`SchedulingEngine.ts:333` (`sortedNurses = [...nurses]`) + `scheduleGenerationService.ts:48`

The engine never filters `nurse.active`, and the server service passes the raw
`repo.list('nurses')`. Preflight reports counts for *active* nurses only
(`generationPreflightService.ts:41`), but generation will happily assign duties to
deactivated staff (resigned/suspended nurses reappear on the roster).
*Fix:* filter `n.active` once at engine entry (also covers the client path).

### F-5 (HIGH) — ✅ FIXED (2026-10-01) — Senior-fixer (H1) and float-pool passes ignore OFF locks
`SchedulingEngine.ts:1443–1516` (senior swap) and `:1824–1860` (float pool)

The main slot pass correctly skips nurses with a `LockEntry(mode='OFF')` (lines
1109–1112), and the +1 Strategy-B pass checks it too (line 1705). But:
- the **H1 senior-swap** candidate filter checks leave, H2, H3, H7, S1 — and never OFF
  locks → a senior explicitly pinned OFF can be swapped onto a duty;
- the **4.6 float/pool pass** checks only leave → any nurse pinned OFF can be floated
  into the pool on that very day.
*Fix:* add the same `activeLocks … mode === 'OFF'` guard to both passes.

---

### F-24 (HIGH) — ✅ FIXED (2026-10-01) — Priority-#1 pairings starved by slot processing order (user-reported)
`src/services/engine/SchedulingEngine.ts` — daily slot loop (4.3)

Reported from production (Mon Oct 19 roster): nurse Cheene (general pool, "P5" badge)
was paired with Dr. Samer although nurse Roland holds the **Priority #1** preference
for him. Root cause: day slots are processed in descending `priority` — late-ending
clinics (`endTime >= '19:00'`) get **130**, which outranks a clinic with a dedicated
P1 nurse (**125**). The earlier slot could consume the P1 nurse through their rank-2 /
specialty / general candidacy, so by the time the P1 doctor's own slot was processed,
its tier-1 cohort was already exhausted and the pairing degraded to the general pool.
*Fix:* reservation guard — per day, each doctor's pending (not-yet-processed) DOCTOR
slot count is tracked; every other slot skips any nurse holding a rank-1 preference
for a doctor that still has pending slots. The nurse is released the moment their P1
doctor's slot comes up (or for anything after it). Trade-off (intentional): if the P1
nurse turns out to be hard-blocked for their own doctor that day, an earlier slot may
have passed over them — the +1/float passes still pick such nurses up afterwards.

## MEDIUM

### F-6 (MEDIUM) — ✅ FIXED (2026-10-01) — H2 lookback hardcodes 6 days; rule values > 6 are never enforced
`SchedulingEngine.ts:595–608` (`for (let i = 1; i <= 6; i++)`)

`maxConsecutiveDays` is rule-configurable (default 6), but the lookback helper can return
at most 6. If the rule is set to 7+, `consecutive >= maxConsecutiveDays` can never fire →
**unlimited consecutive working days**. (With the default 6 it works by coincidence.)
The S1 helper does this correctly (`i <= maxConsecutiveLate + 2`, line 614).
*Fix:* loop to `maxConsecutiveDays` (+1).

### F-7 (MEDIUM) — ✅ FIXED (2026-10-01) — Float pool hardcodes its own consecutive-day ceiling (5) and ignores rule severity
`SchedulingEngine.ts:1836–1839`

The 4.6 pool pass uses `consecutiveDaysEndingYesterday < 5` regardless of the configured
H2 rule (comment admits "never push to 6 or 7"). If H2 is configured at 3, the pool pass
can push nurses to 5 consecutive days; if H2 were ever raised legitimately, the pool is
too strict. It also skips the `consecutiveDaysSeverity === 'HARD'` gate used everywhere else.
*Fix:* use `maxConsecutiveDays` and the severity gate.

### F-8 (MEDIUM) — ✅ FIXED (2026-10-01) — Partial leave overlap credits the full leave entry to the schedule period
`SchedulingEngine.ts:526–534` + `server/routes/leave.ts:185`

`hoursCredited` is a **total for the whole leave entry** (computed at request time). The
engine credits the entire amount to any schedule whose window merely *overlaps* the leave
(`le.startDate <= schedule.endDate && le.endDate >= schedule.startDate`). A 2-week,
80 h leave overlapping the schedule by one day reduces that period's `dutyTarget` by all
80 h (and, via F-2, inflates consumption by 80 h too).
*Fix:* prorate `hoursCredited` by the number of leave days inside the schedule window.

### F-9 (MEDIUM) — ✅ FIXED (2026-10-01) — Preflight deficit analysis ignores demand the engine will actually create
`server/services/solver/generationPreflightService.ts:103–135`

The daily demand-vs-supply check uses `requiredNurses = sessionsOnDate.length` only —
phlebotomy quota, nurse-clinic quota, and the +1-additional-nurse rule are *counted* in
`estimatedTotalAssignments` but *excluded* from the deficit calculation. Preflight can
report OPTIMAL readiness while generation ends with unmet slots. Confirmed drift: three
preflight implementations exist (server service, engine `computePreflight`, modal
estimate) and only the engine one injects recurring weekly doctor sessions (line 171).
*Fix:* unify on one preflight implementation that mirrors the engine demand model.

### F-10 (MEDIUM) — ✅ FIXED (2026-10-01) — "+1 nurse" hourly pass demands coverage for all of 09:00–21:00 on any day with sessions
`SchedulingEngine.ts:1593` — `const isOperating = docsActive > 0 || (hour >= 9 && hour <= 20 && daySessions.length > 0)`

The second clause is **always true** inside the 9–20 loop whenever the day has any
session, so a day with a single 09:00–12:00 clinic still demands `minAdditionalNurses`
present at 20:00 → spurious deficits → duty extensions / float assignments on hours when
the clinic is closed. Same pattern exists in the validator (`ScheduleValidator.ts:142`),
so the validator confirms rather than catches the overstaffing.
*Fix:* `isOperating` should derive from the day's actual session span (min start → max end).

### F-11 (MEDIUM) — ✅ FIXED (2026-10-01) — Duty-window choice ignores slot coverage in scoring; priority tier beats a covering fallback duty
`SchedulingEngine.ts:258–306` (suitability used only for sort order) + `:1086–1356` (score)

`partitionCandidateDuties` ranks duties by overlap suitability, but the selection loop
picks by **score**, which includes `isPriority` (+30) and `priorityRank * 0.05` bonuses
and *no coverage term*. Worse, once *any* nurse/duty in the priority tier passes hard
checks, fallback-tier duties are never evaluated (`break` at line 1360). A duty window
flagged `isPriority` that doesn't even overlap an evening session can "cover" it, leaving
the session hours actually unstaffed while the roster looks filled.
*Fix:* hard-require overlap (or full cover) between chosen duty and slot, or add a
dominant coverage term to the score and drop the tier short-circuit.

### F-12 (MEDIUM) — ✅ FIXED (2026-10-01) — H1 senior swap corrupts the released junior's state
`SchedulingEngine.ts:1521–1536`

When the junior is released: `lastDutyEndTime` is **not cleared/restored** (still points
at the removed duty's end → false H3 rest blocks for the junior next day), and
`weekendsWorked` is **not decremented** (inflating their S4 weekend-equity penalty), while
hours and late-streak are rolled back. Asymmetric rollback.
*Fix:* restore all state fields (or recompute from `resultAssignmentsMap`).

### F-13 (MEDIUM) — ✅ FIXED (2026-10-01) — Today's assignment is never rest-checked against a *locked tomorrow*
`SchedulingEngine.ts:1130–1148` (H3 only looks backward)

Locks for future dates are materialized into `resultAssignmentsMap` up front, but H3 only
checks `state.lastDutyEndTime` (yesterday). Assigning a late duty (ends 21:00) today when
tomorrow holds a locked early duty (starts 08:00) creates an 11 h-rest violation the
engine itself can see but doesn't check. The validator will flag it afterwards — the
generator shouldn't produce it.
*Fix:* forward-check against `resultAssignmentsMap[nurse_tomorrow]` before placing.

### F-14 (MEDIUM) — ✅ FIXED (2026-10-01) — Cross-schedule-boundary streaks are invisible (confirmed P-8)
`SchedulingEngine.ts:595–625`

H2/S1 lookbacks read only `resultAssignmentsMap` (this schedule's assignments). A nurse
who worked the last 6 days of the previous schedule can be assigned the first 6 days of
the next one — a 12-day real-world streak. Same blind spot in the validator (scoped to
one schedule).
*Fix:* pass trailing N days of the previous period's assignments into `generate`.

### F-15 (MEDIUM) — ✅ FIXED (2026-10-01) — Non-atomic persistence: delete-all then insert (confirmed P-2, narrowed)
`server/services/solver/scheduleGenerationService.ts:134–141`

All old assignments are `bulkRemove`d, then new ones `bulkUpsert`ed. Out-of-block
preserved assignments *are* echoed back by the engine (verified in the EMPTY_ONLY retain
logic, lines 466–487), so no data is lost **on success** — but a crash between the two
calls loses the entire schedule, and concurrent readers see an empty roster in between.
*Fix:* compute a diff (remove only stale IDs) or write within a transaction/single batch.

### F-16 (MEDIUM) — ✅ FIXED (2026-10-01) — Strategy A duty extension mutates preserved MANUAL assignments in place
`SchedulingEngine.ts:1640–1664`

The +1 extension filter excludes `a.locked` but not `source === 'MANUAL'` (manual edits
have `locked: false`), so a planner's manual 09:00–16:00 shift can be silently rewritten
to a 21:00-ending duty. It also mutates the retained `Assignment` object **in place** —
the same object reference the caller passed in `existingAssignments` (side effect on
caller state in the client path).
*Fix:* exclude MANUAL source; clone before mutating.

---

## LOW / METRIC-ONLY

### F-17 (LOW) — ✅ FIXED (2026-10-01) — `preservedLocksCount` double-counts
`SchedulingEngine.ts:466–487` + `:489–513`. In `EMPTY_ONLY`/`REBALANCE`, retained
`source === 'LOCK'` assignments increment the counter; the subsequent Lock Pass
re-materializes the same `LockEntry` keys and increments again. Reported counts in the
UI/audit log are inflated up to 2×.

### F-18 (LOW) — ✅ FIXED (2026-10-01) — Lock scoping pretends schedule-scoped locks exist (confirmed P-1, downgraded)
`scheduleGenerationService.ts:69` uses `(l as any).scheduleId === scheduleId`, but
`LockEntry` (`src/types/index.ts:299`) **has no `scheduleId` field** — the clause is
always false and the cast hides it from the compiler. Behavior degrades to date-range
scoping: overlapping schedules share all locks (may be intended; the type cast is not).

### F-19 (LOW) — ✅ FIXED (2026-10-01) — `existingLeaveDaysCount` counts entries, not days (confirmed P-7)
`generationPreflightService.ts:168` returns `approvedLeaves.length`. A single 14-day
leave counts as 1. Mislabeled metric feeding the readiness report.

### F-20 (LOW) — ✅ FIXED (2026-10-01) — Validator skips H2/H3/S1 accounting on duplicate-assignment days
`src/services/validation/ScheduleValidator.ts:446` — rule accounting runs only
`if (asgnsToday.length === 1)`; a day with duplicates (already an ERROR) silently breaks
the consecutive-day/rest chain, masking follow-on violations.

### F-21 (LOW) — ✅ FIXED (2026-10-01) — `REGENERATE_BLOCK` with falsy `blockWeeks` throws; missing options silently degrade (confirmed P-3/P-4, downgraded)
`scheduleGenerationService.ts:90–104`. `blockWeeks` undefined/0 → `NaN` epoch →
`new Date(NaN).toISOString()` **throws RangeError** (500 to the caller). `blockIndex`
undefined → silently behaves like a full-roster pass instead of erroring. Low because the
create route defaults `blockWeeks = 2`, but direct DB edits/imports can hit it.

### F-22 (LOW) — 📝 DOCUMENTED (2026-10-01, intentional design limitation) — H6 capability enforcement covers only PHL
`SchedulingEngine.ts:1121–1127`. Hard capability check is `role?.acronym === 'PHL'` only;
all other clinical roles admit uncredentialed nurses via the `ROLE_FALLBACK` cohort
(`:1008–1012`). Matches the validator (also PHL-only) — flag as a design limitation.

### F-23 (INFO) — ✅ FIXED (2026-10-01) — Dead/unused code
`SchedulingEngine.ts`: `uuidv4` imported, never used; `bestScore`/`cohortBestScore`
assigned, never read; `state.consecutiveWorkingDays`/`consecutiveLateEnds` maintained but
decisions use the lookback helpers instead (two sources of truth).

---

## Disproven / verified-OK hypotheses from the plan

- **H3 rest formula** `(24 − prevEnd) + currStart` — correct for the adjacent-day case;
  gap days guarantee ≥ 24 h rest. ✔
- **DST risk in block date math** — all date arithmetic is UTC (`Date.UTC`, ISO parsing);
  no DST exposure. ✔
- **P-6 (validator counts cancelled sessions)** — the server wrapper passes them, but
  `ScheduleValidator.validate` filters `!s.cancelled` internally (lines 98, 113). Only the
  redundant pre-filter asymmetry remains; no behavioral bug. ✔ (downgraded, no finding)
- **Determinism** — inputs are sorted (`fullName`, acronym tiebreaks), ties broken by
  strict `>` on iteration order, no RNG in the decision path (`uuidv4` unused). Static
  analysis supports the determinism claim. ✔

## Fix log

- **2026-10-01 — F-1 + F-2 fixed** in `src/services/engine/SchedulingEngine.ts`:
  - `totalDutyHoursEarned` now holds **duty hours only** (leave credit removed from the
    accumulator at init; S3 formula adjusted to stop compensating). Fixes the leave
    double-charge in all five H7 check sites, the float-pool entry condition, and the
    Strategy-B deficit sort in one change.
  - The day loop no longer re-adds hours/weekends for preserved assignments already
    credited upfront at state init.
  - Regression test: `docs/engine-audit/repro/f1-f2-hours-accounting.test.ts`
    (`npx tsx …`). Against the pre-fix engine it fails with Alice (40 h leave) = **0 h**
    scheduled and Bella (3 locked shifts) = **56 h**; post-fix both hit their exact
    targets (40 h / 80 h), control nurse unchanged, H7 cap and leave-day blocking intact.

- **2026-10-01 — F-4 + F-5 fixed** in `src/services/engine/SchedulingEngine.ts`:
  - `sortedNurses` now filters `n.active !== false` at engine entry (lenient on legacy
    records missing the flag). Inactive nurses receive no NEW duties in any pass;
    their preserved/locked assignments are still retained.
  - `LockEntry(mode='OFF')` guards added to the H1 senior-swap candidate filter and the
    4.6 float/pool pass — matching the guard the main slot pass and +1 Strategy-B pass
    already had.
  - Regression test: `docs/engine-audit/repro/f4-f5-availability-guards.test.ts`
    (`npx tsx …`). Against the pre-fix engine it fails with the inactive nurse scheduled
    **5 days** (float pool) and the OFF-pinned nurse floated onto her blocked day;
    post-fix both are clean, the OFF-pinned nurse still works her other 5 days (no
    blanket ban), and the doctor session stays covered. F-1/F-2 test re-run: still green.

- **2026-10-01 — F-3 fixed** (scope turned out wider than first flagged):
  - `server/services/solver/scheduleGenerationService.ts` now loads and forwards
    `workingHoursPeriods` + `doctors` to `SchedulingEngine.generate` — dedicated-period
    hour targets and doctor-profile H8 allocation now match the client path.
  - **Two additional root causes found during the fix:** the `workingHoursPeriods`
    collection was missing from `ALL_COLLECTIONS` in `server/db/jsonStore.ts` (persisted
    writes were never reloaded after a server restart — silent data loss) and from
    `ALLOWED_COLLECTIONS` in `server/routes/crud.ts` (client `repo.list/create/update`
    on periods returned **400 Invalid collection** in server mode). Both registered.
  - Bonus parity: `server/services/validation/scheduleValidator.ts` now passes
    `workingHoursPeriods`, `specialties`, and `doctors` through to
    `ScheduleValidator.validate` like the client does.
  - Regression test: `docs/engine-audit/repro/f3-server-parity.test.ts` (`npx tsx …`),
    driving `ScheduleGenerationService.execute` with an in-memory repo. Pre-fix: nurses
    scheduled **48 h** against the stale 80 h schedule target (dedicated 24 h period
    ignored) and the doctor session left **unstaffed** (H8 blind to doctor specialty).
    Post-fix: exactly 24 h each and the session staffed. F-1/F-2 and F-4/F-5 suites
    re-run green.

- **2026-10-01 — F-6 + F-7 + F-13 + F-14 fixed**:
  - **F-6** (`SchedulingEngine.ts`): H2 lookback horizon now derives from the configured
    rule (`maxConsecutiveDays + 1`, safety-bounded at 60) instead of a hardcoded 6.
  - **F-7**: float-pool ceiling now follows the configured H2 rule with the legacy
    one-day pacing margin (`< maxConsecutiveDays − 1`) instead of a hardcoded 5.
  - **F-13**: new `violatesRestBeforeNextDay` forward rest check applied at **all five**
    placement sites (main slot pass, H1 senior swap, +1 Strategy-A duty extension,
    Strategy-B float, 4.6 pool) — the engine no longer creates rest violations against
    locked/manual duties it can already see on the next day.
  - **F-14**: `generate` accepts `priorPeriodAssignments` (trailing ~30 days before
    `schedule.startDate`); H2/S1 lookbacks consult this history and day-1 rest checks
    seed `lastDutyEndTime` from the prior period's final day. Both callers forward it
    (`scheduleGenerationService.ts` server-side, `SchedulesView.tsx` client-side).
  - Regression test: `docs/engine-audit/repro/f6-f7-f13-f14-h2-h3-gaps.test.ts`
    (`npx tsx …`). Legacy engine: streak **18** under an H2=8 rule, pool streak **5**
    under H2=3, a **10 h-rest violation** placed before a locked 08:00 duty, and a
    **7-day cross-boundary streak**. Post-fix: 8 / 2 / none / rests on the boundary day
    (while still correctly working the day the streak merely *reaches* the limit).
    All earlier suites (F-1/2, F-3, F-4/5) re-run green.

- **2026-10-01 — F-10 + F-11 + F-16 fixed**:
  - **F-10** (`SchedulingEngine.ts` +1 pass, and the twin logic in
    `ScheduleValidator.ts`): the "operating" window is now the span of the day's actual
    sessions (first start → last end) instead of a blanket, always-true 09:00–21:00 —
    no more phantom evening deficits, duty extensions, or validator errors for hours
    the clinic is closed.
  - **F-11**: duty tiers are now partitioned by **coverage class first** (full cover →
    overlap → non-overlap last-resort), with priority ordering preserved *within* each
    class. A fully-covering standard duty now always beats a non-overlapping
    "priority" duty.
  - **F-16**: Strategy-A duty extension now skips `source === 'MANUAL'`/`'LOCK'`
    assignments (the `locked` flag alone let planner-authored manual entries be
    rewritten) and writes a **cloned** assignment back to the result map instead of
    mutating the caller-owned object in place.
  - Regression test: `docs/engine-audit/repro/f10-f11-f16-plusone-coverage.test.ts`
    (`npx tsx …`). Legacy engine: a 09:00–12:00 clinic got a nurse extended to
    **22:00**; a 17:00–21:00 session was "covered" by a **08:00–14:00** priority duty;
    a MANUAL assignment was rewritten to the late duty **and** the caller's object
    mutated. Post-fix: all clean. (Scenario design note: the first legacy test run
    revealed the F-11/F-16 symptoms can be *masked* by other buggy passes rescuing
    them — scenarios were isolated with the +1 rule disabled / a single nurse so each
    defect manifests independently.) All five suites green.

- **2026-10-01 — F-8 + F-9 + F-15 fixed**:
  - **F-8** (`SchedulingEngine.ts` + the twin crediting in `ScheduleValidator.ts`):
    leave credit is now prorated — `hoursCredited × (days inside the window / total
    leave days)`, with a `days × 8h` fallback when the snapshot is missing. A 10-day
    80 h leave overlapping a week-long schedule by 6 days now credits 48 h, not 80 h.
  - **F-9** (`generationPreflightService.ts`): preflight demand now mirrors the engine —
    recurring weekly-pattern sessions are injected (deduped against stored ones), and
    daily `requiredNurses` = sessions + ALL non-NC clinical-role quotas + nurse-clinic
    quota. `estimatedTotalAssignments` uses the same role sum.
  - **F-15** (`scheduleGenerationService.ts`): persistence is now upsert-new-FIRST,
    then remove only the ids absent from the result. No window where a crash or a
    concurrent reader sees an empty schedule; worst case after a crash is a few stale
    extras cleaned up by the next pass. (Each jsonStore write is itself atomic via
    tmp-file rename.)
  - Regression test: `docs/engine-audit/repro/f8-f9-f15-leave-preflight-persistence.test.ts`
    (`npx tsx …`). Legacy: nurse with partially-overlapping leave got **0 h** scheduled;
    preflight saw 1 of 2 sessions and required **0** nurses on a 3-demand day; first
    persistence op was `bulkRemove` of **all** rows including the preserved lock.
    Post-fix: 8 h on the only free day / 2 sessions & 3 required with a deficit
    warning / upsert-first with only `asgn-old-stale` removed. All six suites green.

- **2026-10-01 — F-12 + F-17 + F-18 + F-19 + F-20 + F-21 + F-22 + F-23 closed (final step)**:
  - **F-12** (`SchedulingEngine.ts` H1 swap): the released junior's rollback is now
    symmetric — `weekendsWorked` is decremented on weekend releases and
    `lastDutyEndTime` is recomputed from their most recent REMAINING duty (including
    prior-period history) instead of pointing at the removed duty's end.
  - **F-17** (`SchedulingEngine.ts` Lock Pass): re-materializing a `LockEntry` for a
    nurse/date already retained as a LOCK-source assignment no longer increments
    `preservedLocksCount` a second time.
  - **F-18** (`scheduleGenerationService.ts`): the always-false
    `(l as any).scheduleId === scheduleId` clause removed — locks are date-scoped by
    design and the code now says so honestly (no type-cast hiding it).
  - **F-19** (`generationPreflightService.ts`): `existingLeaveDaysCount` now sums
    window-clamped leave DAYS, not leave entries.
  - **F-20** (`ScheduleValidator.ts`): per-day rule accounting now runs for `>= 1`
    assignment (first assignment of the day); a duplicate-assignment day still raises
    its DATA_ISSUE but no longer silently resets the H2/S1 chain or skips H3/H6/H8.
  - **F-21** (`scheduleGenerationService.ts`): `REGENERATE_BLOCK` now validates its
    bounds — missing/negative `blockIndex` and missing/`< 1` `schedule.blockWeeks`
    throw clear errors instead of a silent full-roster pass / opaque
    `RangeError: Invalid time value`.
  - **F-22**: intentionally NOT changed — PHL-only hard credential gating is a design
    limitation mirrored by engine and validator; both sites now carry an F-22 comment
    requiring any extension to change them together.
  - **F-23** (`SchedulingEngine.ts`): dead code removed — unused `uuidv4` import,
    never-read `bestScore`/`cohortBestScore`, and the write-only
    `consecutiveWorkingDays`/`consecutiveLateEnds` shadow counters (all H2/S1
    decisions use the calendar lookback helpers; the second source of truth was pure
    drift hazard).
  - Regression test: `docs/engine-audit/repro/f12-f17-f19-f20-f21-remainder.test.ts`
    (`npx tsx …`). Legacy: released junior forced onto the non-overlapping late duty
    for an 08:00 session by a phantom 10 h-rest block; `preservedLocksCount` **2** for
    one lock; a 14-day leave counted as **1**; a 3-day streak spanning a duplicate day
    raised **no** H2 finding; missing `blockIndex` silently ran a full-roster pass and
    missing `blockWeeks` surfaced as `"Invalid time value"`. Post-fix: all six
    assertions clean. All seven suites green, `tsc --noEmit` clean.

- **2026-10-01 — F-24 fixed** (user-reported after the audit closed):
  - `SchedulingEngine.ts`: added the priority-pairing reservation to the 4.3 slot
    pass — `pendingDoctorSlotCounts` built per day, decremented as each DOCTOR slot
    is processed; the per-nurse candidate filter skips anyone who is rank-1 for a
    doctor with pending slots unless the current slot IS that doctor's.
  - Regression test: `docs/engine-audit/repro/f24-priority-pairing-starvation.test.ts`
    (`npx tsx …`), modeled 1:1 on the reported case. Pre-fix: Dr. Samer staffed by
    **n-cheene** (general pool) while P1 nurse **n-roland** was consumed by the
    earlier 09:00–21:00 slot via his rank-2 candidacy; `doctorPriority1PairingsCount`
    = 0. Post-fix: Roland → Samer, Cheene → Ahmad, P1 count = 1, both sessions
    staffed. All 8 suites green, `tsc --noEmit` clean.

## Recommended fix order (original plan — fully executed, see "Fix ranking" at top)

1. ~~**F-1, F-2** — hours accounting~~ ✅ done (see fix log)
2. ~~**F-4, F-5** — inactive nurses & OFF-lock bypasses~~ ✅ done (see fix log)
3. ~~**F-3** — server/client parity~~ ✅ done (see fix log; included two extra root causes in jsonStore + CRUD route)
4. ~~**F-6, F-7, F-13, F-14** — H2/H3 enforcement gaps~~ ✅ done (see fix log)
5. ~~**F-10, F-11, F-16** — +1 pass overreach and duty-coverage scoring~~ ✅ done (see fix log)
6. ~~**F-8, F-9, F-15** — leave proration, preflight drift, persistence atomicity~~ ✅ done (see fix log)
7. ~~F-12, F-17 … F-23 — state rollback, metrics, cleanup~~ ✅ done (see fix log) — **all findings closed**
