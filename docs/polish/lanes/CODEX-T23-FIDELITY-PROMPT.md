# TASK: T2.3 residue — fidelity fixtures for the May features (register G30)
Build lane. Branch polish/audit-arc-2026-07 — never switch/pull/reset. Read PLAN-OF-RECORD §T2.3 + register G30.

## Context (verified)
The 3 fidelity fixtures (src/__tests__/fidelity/{marco-bellini,niccolo,raphael}.test.ts) pin the engine chain end-to-end BUT none exercises computeGoalRate (goal-rate.ts) or MacroOptions.absoluteOverrides — the May features are unit-tested in isolation only; the worked-example tier never sees them.

## Deliverable
1. EXTEND each of the 3 fidelity files (append new describe blocks; do NOT alter existing pinned values — they are clinical truth):
   - goal-rate: for that athlete's real stats, pin computeGoalRate outputs for one realistic target (requiredKgPerWeek, dailyDeficitKcal, band, kcalFloor, withinSafetyFloor) — byte-exact numbers like the existing style.
   - absoluteOverrides: run the macro calculation with one absolute override set (e.g. proteinG fixed) and pin the full resulting macro line per day type.
2. NEW `src/__tests__/fidelity/goal-rate-overrides-matrix.test.ts`: a compact matrix (3 athletes × {deficit, surplus} × {no-override, protein-override}) pinning P/F/C/kcal — the regression net for EF2/EF4 rulings later (when Roberto's numbers land, these pins are updated deliberately, never silently).
3. Derive expected values by RUNNING the engine (write a scratch runner if needed under /private/tmp, not committed) — pins must be actual current outputs, marked `(pinned from engine @ HEAD 2026-07-20)`.

## Acceptance
- Suite green; the 4 files' new tests pass; existing fidelity assertions byte-unchanged (git diff shows only additions inside the 3 files).
- Final message: per-file added-test counts + one sample pinned line ONLY.

## Fence
Touch ONLY the 3 fidelity test files (append-only) + the 1 new matrix file. Nothing else. No engine/source edits — if an engine bug blocks a pin, document in docs/polish/lanes/T23-BLOCKED.md and stop (domain freeze: report, never adjust values).
