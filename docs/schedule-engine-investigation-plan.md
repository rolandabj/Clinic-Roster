# Investigation Plan — Schedule Creation Engine Logic Audit

**Repo:** `Clinic-Roster` · **Branch:** `arena/01a0f6af-clinic-roster` · **Date:** 2026-10-01

## Objective

Systematically audit the schedule-generation pipeline for logic errors, flag each finding
with severity and reproduction evidence, and produce a defect ledger that can drive fixes.

## Scope — the engine surface

| Layer | File(s) | Role |
|---|---|---|
| Core solver | `src/services/engine/SchedulingEngine.ts` (~1,986 lines) | Constraint-satisfaction generator: demand model, hard rules H1–H8, soft rules S1–S7, cohort/tier pairing, hours accounting |
| Engine helpers | `src/services/engine/nurseClinicUtils.ts`, `src/services/engine/types.ts` | Nurse-clinic slot rules, `RegenerateMode` types |
| Server orchestrator | `server/services/solver/scheduleGenerationService.ts` | Mode mapping, lock/leave filtering, persistence, audit |
| Preflight | `server/services/solver/generationPreflightService.ts` | Readiness scoring, demand-vs-supply analysis |
| Validation | `src/services/validation/ScheduleValidator.ts`, `server/services/validation/scheduleValidator.ts` | Post-generation constraint audit |
| Entry points | `server/routes/schedules.ts`, `server/routes/roster.ts`, `src/components/modals/CreateScheduleModal.tsx` | API + UI triggers |
| Data fixtures | `data/db/*.json` | Realistic seed data usable as test fixtures |

## Deliverables

1. `docs/engine-audit/FINDINGS.md` — defect ledger: ID, file:line, severity (CRITICAL / HIGH / MEDIUM / LOW / INFO), description, repro, suggested fix.
2. Minimal repro scripts/tests under `docs/engine-audit/repro/` (run with `bun`/`vitest` against the JSON fixtures).
3. Summary report with a fix-priority ranking.

---

## Step 1 — Baseline & environment (½ unit of effort)

1.1 Install deps (`bun install`), confirm `tsc --noEmit` passes — type errors are the cheapest logic-error signal.
1.2 Start the server, run one end-to-end generation against the seeded `data/db` fixtures; capture the `SolverResult` (counts, unmet slots, validation counts) as the **baseline artifact**.
1.3 Run generation twice with identical inputs and diff the assignments — the engine claims to be **deterministic**; any diff is an immediate finding.

## Step 2 — Trace the data flow end-to-end (map before judging)

2.1 Trace one request from `POST` route → `ScheduleGenerationService.execute` → `SchedulingEngine.generate` → `repo.bulkRemove`/`bulkUpsert` → `validateScheduleById`.
2.2 Document every filter applied along the way (sessions by date, locks, leaves, mode-based assignment retention) in a data-flow diagram.
2.3 Cross-check that the preflight service, generation service, and validator use **identical filter predicates** — divergence between them is itself a bug class (see pre-seeded findings P-2, P-6).

## Step 3 — Audit the orchestration layer (`scheduleGenerationService.ts`)

Checklist, one item per finding candidate:

- 3.1 **Lock scoping** (lines ~65–72): locks are included when `scheduleId` matches **OR** the lock date merely falls inside the window. Verify this doesn't import locks belonging to a *different overlapping schedule*.
- 3.2 **`preserveManualLocks === false` semantics**: locks are dropped from the engine input, but are MANUAL/locked *assignments* also meant to be regenerated? Check interaction with each `RegenerateMode`.
- 3.3 **`REGENERATE_BLOCK` date math** (lines ~90–98): epoch-millisecond arithmetic + `toISOString()`. Verify block boundaries for: last partial block, `blockIndex` out of range, `blockWeeks` missing/0 (→ `NaN` dates silently pass every string comparison).
- 3.4 **Mode fall-through**: `REGENERATE_BLOCK` without `blockIndex`, or `REGENERATE_DATE_RANGE` without dates, silently degrades to `GENERATE_ALL` behavior (engineMode stays `'GENERATE_ALL'` but existing assignments are passed in). Confirm intended.
- 3.5 **Persistence atomicity** (lines ~134–141): `bulkRemove` of ALL old assignments then `bulkUpsert` of new ones — a crash between the two loses the schedule. Also verify: in `REGENERATE_BLOCK`/`DATE_RANGE` modes, do preserved assignments outside the block survive the blanket `bulkRemove`? They only survive if the engine echoes them back in `engineResult.assignments` — verify.
- 3.6 **Leave filtering**: only `approved` leaves are honored — confirm pending leaves are intentionally schedulable.

## Step 4 — Audit the core solver (`SchedulingEngine.ts`) — the deep dive

Split into sub-audits; each produces findings independently:

- 4.1 **Rule resolution (`resolveRule`, lines ~43–105)**: defaults when rules are missing/disabled; unit consistency (hours vs days vs counts).
- 4.2 **Demand model (lines ~700–840)**: slot construction per date — doctor sessions, phlebotomy quota, nurse-clinic rule. Check duplicate-slot creation when a session appears both in `doctorSessions` and a recurring weekly pattern; check cancelled-session handling; check the `endTime >= '19:00'` string comparisons for formats like `"9:00"` vs `"09:00"`.
- 4.3 **Hours accounting (lines ~525–580)**: leave-hour crediting, `contractPercent` proration, the max-hours cap `max(dutyTarget, min(dutyTarget+8, round(dutyTarget*1.05)))` — verify edge cases (part-timers where 5% < one shift; `dutyTarget = 0`).
- 4.4 **Hard rules H1–H8**: for each, locate the enforcement site and construct a falsifying scenario:
  - H2 consecutive days: lookback (lines ~595–608) only inspects `resultAssignmentsMap` — does it see assignments from the *previous schedule period* (cross-boundary streaks)? Loop caps at 6 — correct for a "max 6" rule, off-by-one risk.
  - H3 min rest between duties: overnight/late→early transitions, string-time subtraction across midnight.
  - H7 max hours per period: interplay with retained manual/locked hours.
  - H8 strict profile allocation (lines ~646–700): the "no preferences = unrestricted" rule and the inverse "has preferences = NEVER elsewhere" claim at line ~972 — verify both directions.
- 4.5 **Soft rules S1–S7**: S1 late-duty streak lookback uses `maxConsecutiveLate + 2` iterations — verify sufficiency; verify soft rules degrade (penalize) rather than block when infeasible.
- 4.6 **Cohort/tier pairing (lines ~905–1100)**: tier ordering (Priority 1 → specialty → general pool), tie-breaking determinism, fairness under scarcity, behavior when all cohorts are empty (does `unmetSlotsCount` increment exactly once?).
- 4.7 **Mode semantics (`EMPTY_ONLY`, `REBALANCE`, `CLEAR_GENERATED`)**: verify each respects locks/manual assignments and that `preservedLocksCount`/`preservedManualCount` are accurate.
- 4.8 **Date/time hygiene across the file**: mixed `new Date(str)` vs `Date.UTC` construction; ISO-string comparisons; DST immunity (the engine must be pure-UTC).

## Step 5 — Audit the preflight service (`generationPreflightService.ts`)

- 5.1 Demand proxy "requiredNurses = sessions on date" vs the engine's richer demand model (phlebotomy + nurse-clinic slots are *counted* in `estimatedTotalAssignments` but *excluded* from the daily deficit check) — understates deficits.
- 5.2 `existingLeaveDaysCount = approvedLeaves.length` counts **entries, not days** — misnamed/wrong metric.
- 5.3 Readiness score arithmetic: verify `score` clamping and threshold boundaries (`<50 / <75 / <90`).
- 5.4 Preflight does **not** filter sessions to recurring doctor patterns the way `computePreflight` in the engine does (line ~169) — compare the two preflight implementations for drift.

## Step 6 — Audit the validator (cross-check layer)

- 6.1 `server/.../scheduleValidator.ts` includes **cancelled** sessions (no `!s.cancelled` filter, unlike the generator) and scopes locks by date only (no `scheduleId` clause, unlike the generator) — confirm and flag the asymmetry.
- 6.2 Verify every hard rule enforced by the engine has a corresponding validator check (coverage matrix H1–H8 × S1–S7) — gaps mean silent violations.
- 6.3 Confirm validator leave overlap predicate matches the generator's.

## Step 7 — Dynamic falsification tests

For every suspicious site from Steps 3–6, write a minimal fixture + script in `docs/engine-audit/repro/`:

- 7.1 Overlapping-schedules lock bleed test (3.1).
- 7.2 Block regeneration at a DST boundary and with a trailing partial block (3.3).
- 7.3 Crash-window simulation between `bulkRemove` and `bulkUpsert` (3.5).
- 7.4 Consecutive-days streak spanning two schedule periods (4.4/H2).
- 7.5 Part-time nurse (20% contract) hours-cap test (4.3).
- 7.6 Determinism test: 10 consecutive runs, assert byte-identical assignment sets (1.3, promoted to a repeatable test).
- 7.7 Zero-nurse / zero-session / single-day schedule degenerate inputs.

## Step 8 — Consolidate & report

- 8.1 Fill `FINDINGS.md`: confirmed defects with severity, file:line, repro reference; downgrade disproven hypotheses to INFO with the evidence.
- 8.2 Produce the coverage matrix (rule × enforced-in-engine × checked-by-validator × tested).
- 8.3 Rank fixes: data-loss / hard-rule violations first, then correctness drift between layers, then metric/reporting bugs.

---

## Pre-seeded findings from initial reconnaissance (to confirm in Steps 3–6)

| ID | Severity (prelim.) | Location | Suspicion |
|---|---|---|---|
| P-1 | HIGH | `scheduleGenerationService.ts` ~65 | Lock filter `scheduleId === X OR date in range` pulls in locks from other overlapping schedules |
| P-2 | HIGH | `scheduleGenerationService.ts` ~134 | Non-atomic delete-then-insert persistence; preserved out-of-block assignments survive only if echoed back by the engine |
| P-3 | MEDIUM | `scheduleGenerationService.ts` ~90 | `REGENERATE_BLOCK` ms-epoch date math; `blockWeeks` falsy → `NaN` block bounds that match nothing/everything in string comparisons |
| P-4 | MEDIUM | `scheduleGenerationService.ts` ~104 | Missing `blockIndex`/dates silently falls through to full `GENERATE_ALL` regeneration |
| P-5 | MEDIUM | `generationPreflightService.ts` ~103 | Daily deficit check ignores phlebotomy + nurse-clinic demand that the engine will actually schedule |
| P-6 | MEDIUM | `server/.../scheduleValidator.ts` ~57 | Validator includes cancelled sessions and uses a different lock predicate than the generator (layer drift) |
| P-7 | LOW | `generationPreflightService.ts` ~168 | `existingLeaveDaysCount` counts leave *entries*, not days |
| P-8 | LOW | `SchedulingEngine.ts` ~595 | H2/S1 lookbacks only see in-memory result map — streaks crossing the schedule start boundary are invisible |
| P-9 | LOW | engine-wide | Time-of-day logic relies on string comparison (`endTime >= '19:00'`); non-zero-padded times break it |

## Execution estimate

Steps 1–2: ~1 session · Step 3: ~1 · Step 4: ~2–3 (largest) · Steps 5–6: ~1 · Step 7: ~1–2 · Step 8: ~½.
Steps 3, 5, and 6 are independent and can be parallelized; Step 7 depends on all of them.
