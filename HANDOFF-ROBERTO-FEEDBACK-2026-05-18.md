# Handover — Roberto feedback closeout

**Date:** 2026-05-18
**Author:** Claude Code (Opus 4.7)
**For:** Alfred / next operator
**Branch:** `fix/roberto-feedback-phase0` (pushed to `origin`, **33 commits ahead of `main`, NOT merged**)

---

## 0. TL;DR

Roberto sent 12-point feedback in May 2026. All code-only work to address it is **done, committed, pushed, and deployed to a Vercel preview**. Tests/typecheck/build are green. **Nothing is merged to production** — the live site (`roberto-scrigna-platform.vercel.app`) still runs old `main`.

What is **not** done: a real click-through of the UI in a live environment, confirming DB migrations 002–005 are applied, and the two deploy-bound flows (#6 send, #11 portal invite). Confidence: **~95 % on logic, unproven on live UI/UX.**

The single biggest next action: get past the preview's Vercel SSO gate (HTTP 401) and run a click-through + the Playwright suite. Details in §5.

---

## 1. Project context (1 paragraph)

`~/roberto-scrigna-platform` — Next.js 16 (App Router) nutrition-practice platform for Roberto Scrigna, Italian sports nutritionist. Two surfaces: coach dashboard (`/`) and client portal (`/portal`). Stack: tRPC 11, Supabase (Postgres + Auth + RLS), Inngest, Resend, Anthropic SDK (Claude Vision OCR, model `claude-opus-4-7`), Bun runtime, Vitest + Playwright. UI is **in Italian**. Crown jewel: pure-TS engine `src/engine/` (body-fat → BMR → NEAT → exercise → TEF → TDEE → macros → hydration → meal-plan) + `src/engine/sport-correction/` (Roberto's 10-stage Sport Correction Protocol). `AGENTS.md` warning applies: this is a modified Next.js — read `node_modules/next/dist/docs/` before changing framework code.

Background docs in repo root: `FEEDBACK-RESOLUTION-PLAN-2026-05.md` (full plan + §6 final implementation log + scorecard), `CLOSEOUT-PLAN-2026-05.md` (Phase A–D plan + execution log), `SPEC-ANSWERS-2026-05.md`, `ROBERTO-QUESTIONS-2026-05.md` (decisions taken + the 2 hard asks), `HANDOFF-V1-2026-04-27.md`, `HANDOFF-SCP-2026-04-30.md`.

---

## 2. How to get the work

```bash
cd ~/roberto-scrigna-platform
git fetch origin
git checkout fix/roberto-feedback-phase0
git pull
bun install
bunx vitest run        # expect ~451 pass (446 + 5 new), all green
bunx tsc --noEmit      # clean
bun run build          # succeeds, 23 routes
```

Remotes: `origin` = github.com/BA-AI-JM/roberto-scrigna-platform (Vercel-connected), `upstream` = github.com/agentarmy72-del/roberto-scrigna-platform.

---

## 3. All changes made (grouped)

### Phase 0 + answer-independent items (commits `0262b5d` … `b428731`, `73f2b76`, `f31b0e3`, `ab97cf2`, `ea26029`, `abd19c6`)

- **#7 Fixed `/plans/[id]` 404** — pages were mis-routed; resolved.
- **#5 `plan.adjustPortions`** rewritten against the real `slots[].primary` shape and the *Aggiusta Porzioni* button wired; `plan.saveEdits` added for supplement/guidance persistence; meal substitutions render as **selectable cards with quantities** + new `plan.swapMealSelection`.
- **#1 Editable client context** — `/clients/[id]/edit` extended with goal, occupational level, training routine (`WeekSessionsEditor`), new plicometria (`SkinfoldsEditor`).
- **#1 Client photo upload + gallery** via new private `client-media` Supabase Storage bucket (migration **002**).
- **#8 Workout-screenshot upload** coach-side + new `/portal/training` client-side log with screenshot upload (migration **003**); training-log dropdown uses Appendix-D taxonomy.
- **#8 OCR** — Claude Vision extracts workout-screenshot data (`ab97cf2`) and HR-zones map into the Sport Correction Protocol (`73f2b76`). Migration **005** relaxes `exercise_method` CHECK for `sport_correction_protocol`; **004** relaxes `training_log.session_type` CHECK.
- **#12 Supplements** — 9 added (Curcumina, Vit B, Iodio+Selenio, MSM, Mio-inositolo, Spirulina, Glicina, Tirosina, CoQ10) + interaction warnings (Ferro+Calcio, Caffeina+Magnesio, Omega-3>3g, VitD-senza-K2); whey no longer hard-coded post-workout.
- **#4 Food rounding** — `engine/meal-plan/rounding.ts`: solids 5 g (≥20 g) / 1 g (<20 g); never zero for positive input.
- **#10 Taxonomy** — `src/engine/sport-taxonomy.ts` (53 Appendix-D entries) + `LEGACY_DISPLAY_TO_CANONICAL` map; strength MET capped at 3 regardless of RPE. Responsive-grid pass on dashboard pages.
- **Review page** surfaces Energy Availability (spec §Step 9) + per-meal tolerance OOT badges.

### Phase A — Target-date deficit calculator (#9) — `bcea3c6`, `c1d6242`, `8360374`

- `src/engine/goal-rate.ts`: `computeGoalRate({currentKg,targetKg,weeks,tdeeKcal,leanMassKg})` → required kg/wk, % BW/wk, daily deficit, band (`comfortable|moderate|aggressive|extreme`), kcal floor = `max(22×leanMassKg, 1200)`, `belowFloor`, `suggestedWeeks`. Caps: 1.0 %/wk fat-loss, 0.5 %/wk muscle-gain; band bumps up if deficit > 25 % TDEE. 17 tests.
- Engine `PlanOptions.dailyDeficitKcal` subtracts from TDEE pre-macros.
- `plan.estimateForClient` query (weight, lean mass, avg TDEE, saved-goal blob, weekSchedule, intake sessions — for prefill).
- `/plans/generate` *Obiettivo & deficit* card: goal/target-kg/target-date, live 5-stat readout, band badge, kcal-floor block on the generate button, suggested-weeks hint, manual deficit slider + reset.

### Phase B — Day-type structure + per-day training (#3, #2) — `267cb17`

- Engine `PlanOptions.perDayTrainingSession?: (ExerciseSession|null)[7]` — applied on training days only. 3 tests.
- `services/training-modality.ts` `buildTrainingSessionForDay()` helper.
- `plan.generate` accepts `weekScheduleOverride` (7×DayType) + `perDayTrainingSession`; snapshot schedule substituted per-plan (intake untouched).
- New `plan.previewWeek` query — read-only engine run, per-day kcal/macros + weekly averages, no DB writes.
- *Struttura del piano* card: presets (3/4/5/6 sessions/wk), 7-day calendar with per-day type select (ON/OFF/Refeed/Deload), per-training-day modality + duration + RPE, **live weekly EE/intake table**.

### Phase C — Per-day-type absolute macro overrides (#2) — `8657494`

- Engine `MacroOptions.absoluteOverrides?: Partial<Record<DayType,{proteinG?,fatG?,carbG?}>>`; any subset, unset macros use formula. 3 tests.
- `plan.generate` + `plan.previewWeek` accept `macroOverrides` (Zod: P 0–800 g, F 0–400 g, C 0–1500 g per day-type).
- *Macro per giorno (opzionale)* card: rows only for day-types in the current schedule, engine-computed values as placeholders, per-row reset.

### Phase D + Tier-0 hardening — `5ea5e33`, `54f6aea`, `02a2fe2`

- Docs: §6 implementation log + scorecard in `FEEDBACK-RESOLUTION-PLAN-2026-05.md`; execution table in `CLOSEOUT-PLAN-2026-05.md`.
- **Provenance fix** (`54f6aea`): `collectAssumptions` now emits Italian notes for macro overrides and per-day-training overrides, rendered by the existing assumptions panel on `/plans/[id]/review`. (Before this, the review page showed correct numbers but no sign a manual override was applied — the "view" half of #2.)
- **Edge tests** (`02a2fe2`): 5 tests — all-OFF week, perDayTrainingSession on a zero-training week, deficit+full-pin, deficit+protein-only-pin, negative-carb guard. 49 engine tests green.

---

## 4. Roberto feedback scorecard (current)

| # | Point | Confidence | Note |
|---|---|---:|---|
| 1 | Edit goal/routine/plicometria at plan time | 95 | Edit page + generate-time override both done |
| 2 | View **and edit** params before generate | 90 | Goal/schedule/activity/calories/macros all editable + provenance on review |
| 3 | Day types + multiple protocols + weekly EE table | 80 | Per-day types + EE table done; **multi named protocol switching NOT built** (one-active-plus-archived only) |
| 4 | Food quantity rounding | 75 | 5 g/1 g done; **unit-snapping deferred** (needs per-ingredient unit-weight tags) |
| 5 | Adjust portion + alternatives | 85 | Done; unverified in live UI |
| 6 | App sends plans to clients | 75 | Code exists; **deploy-bound, untested e2e** |
| 7 | Open plans from client profile | 95 | Fixed |
| 8 | Screenshots → training log → real-time EE | 90 | Built generic (any app); OCR never run on a real screenshot |
| 9 | Target-date deficit + safety floor | 90 | Phase A |
| 10 | Desktop/mobile + taxonomy | 80 | Taxonomy unified; **new cards' mobile layout unverified** |
| 11 | Client portal invite | 75 | `client.sendPortalInvite` exists; **deploy-bound, untested** |
| 12 | Supplements | 85 | Done |

**Overall ~85 % on shippable code; capped ~92 % until deploy-bound items demonstrated.**

---

## 5. What's needed to test it (the actual gap)

### 5a. Deployment facts

| Target | Code | URL | Reachable |
|---|---|---|---|
| Production | OLD (`main`) | `roberto-scrigna-platform.vercel.app` | Public; lacks the new work |
| Preview | NEW (this branch) | `https://roberto-scrigna-platform-git-fix-38fcd5-james-projects-c22b5a27.vercel.app` (stable branch alias — always newest branch build) | **HTTP 401 — Vercel SSO** |

### 5b. Blockers to clear before functional/UX testing

1. **Vercel Deployment Protection (401).** The preview is SSO-gated. James (logged into Vercel) can open the alias URL in a browser and it works. For automated/agent testing, enable **Vercel → project → Settings → Deployment Protection → "Protection Bypass for Automation"**, get the secret, send requests with header `x-vercel-protection-bypass: <secret>`. Do **not** fully disable preview protection (preview talks to real Supabase).
2. **DB migrations 002–005 — UNVERIFIED.** The preview pulls Vercel env (likely the same Supabase as prod). Migrations 002 (client-media bucket), 003 (client write policy), 004 (training_log.session_type CHECK), 005 (exercise_method CHECK) must be applied or the photo-upload / screenshot-log / OCR→SCP-write paths will error **even though the code is correct**. Confirm via Supabase dashboard or `bun run db:migrate`. Migration runner: `supabase/migrate.ts`.

### 5c. Functional test plan (once 5b cleared)

Existing Playwright harness: `e2e/` (`full-workflow.spec.ts` walks Login→Intake→Plan Gen→Invoicing→Monitoring→Portal; also `auth-and-dashboard`, `routes-and-navigation`, `screenshots`). Config: `playwright.config.ts`, `baseURL: http://localhost:3000`, auto-starts `bun run dev`.

- **Local against real Supabase:** create `.env.local` from `.env.local.example` (keys: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `RESEND_*`, `INNGEST_*`, `NEXT_PUBLIC_APP_URL`, `CHROMIUM_PATH`) → `bun run dev` → `bunx playwright test`.
- **Against the preview:** point Playwright `baseURL` at the branch-alias URL and inject the protection-bypass header in `playwright.config.ts` `use.extraHTTPHeaders`.
- **New spec to write (does not exist yet):** `e2e/wizard-phase-abc.spec.ts` — select a client with a snapshot → `/plans/generate` → assert *Obiettivo & deficit* prefills + band badge changes with target date + slider moves the deficit + below-floor blocks the button; *Struttura del piano* preset + per-day toggle re-renders the live EE table; *Macro per giorno* pin changes the table; generate → `/plans/[id]/review` shows the override assumption notes.

### 5d. UI/UX checks (manual, fastest path — James can do now in browser)

Open the branch-alias URL → log into the coach app → a client with a measurement → **Genera Piano**. Verify:
- The 3 new cards render and are usable on **desktop AND a phone viewport** (the 7-day calendar grid is `repeat(7,1fr)` and the macro rows are 5-col — most likely mobile weak point, ties to Roberto #10).
- Prefill from the client's saved goal/schedule actually populates.
- The live weekly EE table updates within ~1 s of editing schedule/macros (it re-runs the engine via `plan.previewWeek`; watch for lag or spinner stuck).
- Generate → review page shows the new "Macro impostate manualmente…" / "L'attività è stata impostata manualmente…" assumption lines.
- PDF export still renders.

---

## 6. What's left to fully align with Roberto

| Item | Effort | Needs |
|---|---|---|
| Confirm migrations 002–005 applied | 10 min | Supabase access |
| Live click-through + new e2e spec | ~½ day | 401 bypass or local env |
| #4 unit-snapping (1 uovo 50 g, 1 mela 150 g…) | ~1 day | Per-ingredient unit-weight tags in food DB; Roberto's list is best-guessed in `ROBERTO-QUESTIONS-2026-05.md` §"Whole-unit food weights" — confirm/correct then implement |
| #3 multi named protocol switching | ~1–2 days | Product decision: is "one active + archived" enough, or does he want named switchable protocols? **Biggest interpretation risk.** |
| #6 / #11 e2e verification | ~½ day | Real deploy + a test client/email |
| OCR real-world accuracy | ~2 hrs | A few real workout-app screenshots; feature is built generic so this is verification only, not build |
| Merge to `main` + apply migrations to prod | ~½ day | Go-decision after the above |

### Hard asks for Roberto (only 2 — see `ROBERTO-QUESTIONS-2026-05.md`)
1. **Logo** (PNG/SVG) — doesn't exist yet.
2. **P.IVA + albo registration number** — for PDF footer.
(Screenshots are *not* a hard ask — OCR is app-agnostic; any sample suffices for verification.)

Everything in the "What we've decided" half of `ROBERTO-QUESTIONS-2026-05.md` is best-guessed and shipped; he only needs to push back on anything wrong. Two worth an explicit yes/no: the **whole-unit food-weight list** (drives #4) and the **multi-protocol interpretation** (drives #3).

---

## 7. Key files

- Engine: `src/engine/goal-rate.ts`, `src/engine/macros.ts` (`absoluteOverrides`), `src/engine/index.ts` (`PlanOptions`), `src/engine/sport-taxonomy.ts`
- Services: `src/services/plan-generator.ts` (`collectAssumptions`), `src/services/training-modality.ts`
- Server: `src/server/routers/plan.ts` (`generate`, `estimateForClient`, `previewWeek`, schemas)
- UI: `src/app/(dashboard)/plans/generate/page.tsx` (3 wizard cards + helpers), `src/app/(dashboard)/plans/[id]/review/page.tsx`
- Tests: `src/engine/__tests__/{engine,goal-rate}.test.ts`
- Migrations: `supabase/migrations/00{2,3,4,5}_*.sql`; runner `supabase/migrate.ts`
- e2e: `e2e/*.spec.ts`, `playwright.config.ts`

## 8. Commands cheat-sheet

```bash
bunx vitest run                 # unit/engine tests (~451)
bunx tsc --noEmit               # typecheck
bun run build                   # prod build
bun run dev                     # local dev (needs .env.local)
bunx playwright test            # e2e (needs running app + backend)
bun run db:migrate              # apply supabase/migrations/*
vercel ls roberto-scrigna-platform           # list deploys
vercel inspect <deployment-url>              # aliases / commit / status
gh api repos/BA-AI-JM/roberto-scrigna-platform/commits/fix/roberto-feedback-phase0/statuses  # Vercel build state
```

## 9. Recommended first 3 moves for Alfred

1. `git checkout fix/roberto-feedback-phase0 && bunx vitest run && bun run build` — confirm green from a clean state.
2. Confirm migrations 002–005 are applied to the target Supabase (ask James / Supabase dashboard). If not, apply with `bun run db:migrate`.
3. Resolve the preview 401 (bypass secret) **or** stand up `.env.local` locally, then do the §5d manual click-through and write `e2e/wizard-phase-abc.spec.ts`. Report what breaks before any merge to `main`.

**Do not merge to `main` until the live click-through passes.** Build-clean ≠ works.
