# Corrections Triage — Roberto feedback pt2

**Date:** 2026-06-12
**Branch:** `fix/roberto-corrections-pt2` (from `main` @ `ff4b339`)
**Method:** static code investigation only — no live Supabase/Vercel access, no code changes. Vitest baseline on main: 451/451 green.
**Effort scale:** S < ½ day · M = 1–2 days · L = 3–5 days · XL = 1 week+

Known verification debt inherited from `HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md`: plan-send (#6) and portal invite (#11) deploy-bound and never tested e2e; migrations 002–005 unconfirmed; open product questions on multi-protocol (#3) and unit-snapping (#4). Items below that intersect this debt are flagged.

---

## Item 1 — Plan access email link does not work (CRITICAL)

- **STATUS:** built-but-unverified — code path is complete and plausible; failure is almost certainly deploy configuration. **Direct descendant of handover debt #6/#11 ("deploy-bound, untested e2e").**
- **EVIDENCE:** `src/server/routers/plan.ts:1310-1445` (`shareWithClient`), `src/server/routers/client.ts:613-741` (`sendPortalInvite`), `src/lib/inngest/functions.ts:180-261` (`onPlanDelivered` queues the Resend email), `src/app/portal/login/page.tsx` (magic-link OTP), `src/app/portal/auth/callback/route.ts`, `src/app/portal/(protected)/layout.tsx:34` (auth_user_id → client guard).
- **ROOT-CAUSE HYPOTHESES (ranked):**
  1. Email base URL: `portalUrl()` resolves `NEXT_PUBLIC_APP_URL ?? NEXT_PUBLIC_SITE_URL ?? "https://app.robertoscrigna.it"` (plan.ts:80-82, inngest/functions.ts:61-66). If the env var is unset/wrong on Vercel, the email links to a hardcoded domain that may not exist → dead link.
  2. Supabase auth redirect allowlist missing `/portal/auth/callback` (+ `/portal/login`) for the production domain — login page sends `emailRedirectTo: ${window.location.origin}/portal/auth/callback` (login/page.tsx:94); DEPLOYMENT-GUIDE.md never mentions registering redirect URLs.
  3. Client has no provisioned auth user: `shareWithClient` emails a link but does **not** create/link a Supabase auth user (only `sendPortalInvite` does, client.ts:642-681). If the invite was never sent/completed, the plan-email link lands on a login the client can't pass.
- **LAYER(S):** external-deploy (primary), routers, app-UI.
- **EFFORT:** S–M (config verification + possibly auto-provisioning auth user in `shareWithClient`).
- **DEPENDENCIES / QUESTIONS:** Needs Vercel env access, Supabase dashboard (redirect allowlist + whether the affected client has `auth_user_id`), Inngest dashboard (endpoint registered?), the actual email Roberto received (what URL is in the button?). **Cannot be closed locally.**

## Item 2 — Client profile Overview: demographics, medical history, lifestyle, training

- **STATUS:** partially-built. Overview (Panoramica) shows demographics + latest measurement; medical history, lifestyle and training program are **collected and stored but never rendered**.
- **EVIDENCE:** `src/app/(dashboard)/clients/[id]/page.tsx:166-273` (`PanoramicaTab`: weight, height, age, steps, occupational level, BF%, date, notes; tabs = Panoramica / Cronologia Snapshot / Piani / Check-in). Medical history, lifestyle, training sessions live in `skinfold_data._intake.{medical_history,lifestyle,training_sessions}` JSON and are not displayed.
- **CODE vs REPORT:** the data exists — this is a rendering gap, not a data gap.
- **LAYER(S):** app-UI (read path already returns the snapshot blob).
- **EFFORT:** M.
- **QUESTIONS:** confirm exact field layout Roberto wants on Overview vs separate tab.

## Item 3 — Advanced/interactive/customizable monitoring charts

- **STATUS:** missing (UI). Data layer largely ready.
- **EVIDENCE:** no chart library in `package.json`; no SVG chart components found. `portal.getDashboardData` (portal.ts:214-260) already aggregates weightTrend (last 16 check-ins), diaryEntries (14d macros), trainingLogs (30d). Coach side has only a 5-point text `WeightTrend` (clients/[id]/page.tsx:96-163).
- **LAYER(S):** app-UI (both coach + portal); routers for additional series.
- **EFFORT:** L (choose chart lib, coach + patient surfaces, param selection/customization).
- **QUESTIONS:** which params beyond weight/kcal/macros; "customizable" = selectable series + date range, or saved dashboard configs?

## Item 4 — Retroactively edit previous measurements

- **STATUS:** missing. Measurements/check-ins are append-only.
- **EVIDENCE:** no update mutation anywhere: `checkin.ts` has only submit; `client.ts` only `createSnapshot` (:376); `portal.ts` only `addSnapshot` (:443). Snapshot history UI (`SnapshotHistoryTab`, clients/[id]/page.tsx:1025-1249) has no edit affordance.
- **LAYER(S):** routers, app-UI, db (RLS update policies for the snapshot/check-in tables).
- **EFFORT:** M.
- **QUESTIONS:** should edits recompute downstream plans/derived metrics or just correct the record? Audit trail wanted?

## Item 5 — New body comp & energy expenditure not shown after measurement update

- **STATUS:** partially-built (confirms client's report). Body comp/TDEE are computed **only during plan generation** and surfaced only on `/plans/[id]/review` (Macro tab TDEE breakdown, review/page.tsx:905-954).
- **EVIDENCE:** `client.createSnapshot` returns only `{ snapshotId }` (client.ts:363); `estimateBodyFat` (`src/engine/body-fat.ts:107-146`) and Katch-McArdle BMR (`src/engine/bmr.ts:17-34`) are never invoked on snapshot save.
- **ROOT CAUSE:** computation deferred to plan generation by design; nothing recomputes/displays on measurement save.
- **LAYER(S):** routers (return derived metrics on save), app-UI (display), engine (pure reuse — no changes).
- **EFFORT:** S–M. Pairs naturally with Items 6 and 7.

## Item 6 — Skinfold entry doesn't show new BF%, lean mass, BMR

- **STATUS:** partially-built (same root cause as Item 5). `SkinfoldsEditor` (`src/components/skinfolds-editor.tsx:79-113`) collects 7 J&P sites and shows only "X/7 pliche" + method label; it never calls the engine.
- **ROOT CAUSE:** the engine functions are pure TS and importable client-side — they're simply not wired into the editor for a live preview.
- **LAYER(S):** app-UI.
- **EFFORT:** S (live preview in editor) — recommended quick win.

## Item 7 — Dedicated body-composition section with long-term monitoring

- **STATUS:** missing as a dedicated section — confirms client's report. Today "body comp analysis" is a **manual textarea** (`bodyCompAnalysis`) in the plan review Guidance tab (review/page.tsx:1567-1612); engine-computed BF%/lean-mass live inside each plan bundle. No longitudinal BF%/lean-mass view exists anywhere.
- **LAYER(S):** app-UI, routers (snapshot-series query).
- **EFFORT:** M–L (dedicated client-level section + trend over snapshots; overlaps Item 3 charting).
- **QUESTIONS:** coach-only or also patient portal?

## Item 8 — Customizable per-patient monitoring reminders

- **STATUS:** partially-built. One-shot check-in send with optional `dueDate` exists (`checkin.sendCheckin`, checkin.ts:96-152) plus a **hard-coded** 5-day/10-day escalation (`onCheckinDue`, inngest/functions.ts:265-376). No per-client frequency settings, no recurring scheduler, no body-comp-assessment reminders.
- **EVIDENCE:** no `checkin_frequency`/monitoring-settings column or table in `supabase/migrations/001_initial_schema.sql`; notification router has 12 triggers, none recurring-configurable.
- **LAYER(S):** db-migrations, routers, app-UI, Inngest (daily cron).
- **EFFORT:** M.
- **QUESTIONS:** allowed frequencies; does a missed check-in pause or re-send?

## Item 9 — Interactive macro editing of existing plan + progressive versioning

- **STATUS:** partially-built (editing) / missing (versioning). `plan.adjustPortions` (plan.ts:877-1054) rescales portions to a kcal target; `plan.saveEdits` (plan.ts:1223-1302) covers **supplements + guidance text only — not macro targets**. All edits mutate the same `daily_targets.plan_bundle` JSONB in place: **no version column, no history table, no parent_plan_id** (migrations/001:103-140; status lifecycle draft/active/completed/archived only).
- **ROOT CAUSE (of the gap):** plans were architected as regenerate-don't-edit; in-place mutations are destructive.
- **LAYER(S):** db-migrations, routers, app-UI.
- **EFFORT:** L (macro re-solve on an existing plan + revision chain v1→v1.1 + UI).
- **QUESTIONS:** should a macro edit re-run the meal planner (portions change) or only update targets? Does versioning need diff view/rollback? Relates to handover open question #3 (one-active-plus-archived was the chosen interpretation).

## Item 10 — Vegetables too low; fiber ≥15g ±5 per 1000 kcal

- **STATUS:** missing. **The food data model carries no fiber field at all**, so no constraint can currently be expressed; no vegetable-portion floor logic in the planner.
- **EVIDENCE:** `src/engine/meal-plan/` (planner, scaler, types) and `src/data/meals/templates.ts` — macros are kcal/P/C/F only.
- **LAYER(S):** engine (planner constraint), data (fiber values for every food/template — the real cost), pdf/UI display.
- **EFFORT:** L (mostly data backfill + constraint solving + tests).
- **QUESTIONS:** fiber source data (CREA/USDA?); is the ±5 a hard constraint or a warning?

## Item 11 — Combat-sport protocols: water loading / fiber restriction / sodium restriction

- **STATUS:** missing. Hydration today is a flat daily target (training/rest variants: `water_ml_training`/`water_ml_rest`, salt g/day); the Sport Correction Protocol is an **energy-expenditure calculator**, not a peak-week protocol engine. No water-loading taper, no fiber cap (no fiber data — see Item 10), no sodium tracking in food data (<500mg/day cannot be computed).
- **EVIDENCE:** `src/engine/hydration.ts`, `src/engine/sport-correction/` (10-stage EE pipeline), plan table hydration columns.
- **LAYER(S):** engine (new protocol module with date-phased targets), app-UI, pdf; data (sodium per food if restriction must be food-level rather than guidance-level).
- **EFFORT:** L as guidance-level protocols (per-day fluid/fiber/sodium targets over a fight-week timeline); XL if food-level sodium/fiber accounting is required.
- **QUESTIONS:** Roberto to confirm exact protocol triggers (days before weigh-in), and whether targets are prescriptive text or computed from the plan's foods. Safety review essential (water loading is medically sensitive).

## Item 12 — Meal alternatives / automatic food swap with auto-recalculated quantities

- **STATUS:** working (coach-side) — **code contradicts the client's report in part.** `generateSubstitutions` (`src/engine/meal-plan/substitution.ts:1-70`) produces 2–4 alternatives per slot, pre-scaled to slot macro targets via `scaleMealToTarget`; `plan.swapMealSelection` (plan.ts:1062-1215) swaps in place and recomputes day totals/tolerance. Covered by `src/__tests__/e2e/meal-swap.e2e.test.ts`.
- **THE ACTUAL GAP:** it is coach-only. The patient portal shows meals read-only — the client's ask ("patient clicks a food, sees alternatives") is the **portal-facing** version, plus possibly more alternatives per slot (config `substitutionsPerSlot` is clamped 2–4).
- **LAYER(S):** app-UI (portal), routers (authorize swap for portal user or make it request-approval), engine (only if >4 alternatives wanted).
- **EFFORT:** M.
- **QUESTIONS:** may patients swap autonomously or should swaps need coach approval? Raise the 2–4 alternative clamp?

## Item 13 — Full patient personal dashboard (inventory by sub-area)

- **STATUS:** partially-built overall. Portal routes today: `/portal/login`, `/portal/auth/callback`, `/portal/(protected)/dashboard` (920-line overview), `/portal/(protected)/training`, `/portal/checkin/[token]`. Portal API (~15 endpoints in portal.ts) is ahead of the UI.

| Sub-area | Status | Evidence / gap |
|---|---|---|
| (a) Home: weight/progress/goals/check-ins | exists | portal dashboard page |
| (b) Plan access: meals/subs/supplements/notes | partial | meals + supplements shown; **no substitutions UI** (see Item 12), no notes |
| (c) Weight graphs + weekly averages | missing | data via `getDashboardData`; no chart UI (Item 3) |
| (d) Progress photos | missing | `check_in.photos` field exists; no upload/gallery UI |
| (e) Measurements & body comp | partial | check-in captures girths; no body-comp view (Item 7) |
| (f) Workout log | exists | `/portal/training` full form (RPE, duration, HR, screenshots) |
| (g) Wearables (Polar/Garmin/Apple Health/Whoop) | missing | no integrations at all |
| (h) Expenditure-calc integration | missing | engine exists server-side; no client-facing calc |
| (i) Periodic check-in questionnaires | exists | `/portal/checkin/[token]` (scales: energy/sleep/stress/hunger/digestive, adherence, photos) |
| (j) Food diary + MFP/Yazio/FatSecret | partial | `portal.addDiaryEntry`/`getDiaryEntries` exist; manual only, no UI page, no integrations |
| (k) Chat with nutritionist | partial | `getMessages`/`sendMessage`/`markMessagesRead` exist; embedded in dashboard, no dedicated page |
| (l) PDFs/documents | missing | PDFs generated server-side; no portal download page |
| (m) Appointments calendar + reminders | missing | no schema at all |
| (n) Invoices archive | missing | invoices are coach-side only |
| (o) Smart notifications | partial | `savePushSubscription` exists; no UI, no notification center |
| (p) Full data history | missing | only check-in list on dashboard |
| (q) Symptoms/sleep/recovery tracking | partial | captured in check-ins; no dedicated tracking view |
| (r) Fight-week/weight-cut/rehydration section | missing | nothing (depends on Item 11) |
| (s) Mobile-first UX | partial | inline styles, maxWidth 760px; not mobile-first, untested on phones |

- **LAYER(S):** app-UI dominant; routers exist for ~60% of it; wearables/food-app integrations are external-API XL items.
- **EFFORT:** by sub-area — quick wins S–M: (c) weight chart, (l) documents, (k) chat page, (j) diary UI, (d) photos. M–L: (p)(q)(o)(e). L–XL: (m) appointments, (n) portal invoices, (r) athlete section. XL: (g) wearables, (j) third-party food-app integrations.
- **QUESTIONS:** priority order from Roberto; wearables realistically need OAuth apps per vendor (Apple Health needs a native app — flag expectation).

## Item 14 — Supplement database + custom supplements; better auto-assignment

- **STATUS:** partially-built. Library of 30+ supplements across 6 categories with condition-based auto-selection (`src/services/supplements.ts:76-405`, `generateSupplementProtocol`), 4 interaction checks (:483-565). `plan.saveEdits` already accepts **free-text supplements**, so custom entries are technically possible — but there's no picker UI distinguishing library vs custom, no ID linkage, and interaction checking on customs is substring-fragile.
- **LAYER(S):** app-UI (library picker + custom-add form), routers (ID-linked schema), services.
- **EFFORT:** M.
- **QUESTIONS:** "auto-assignment needs improvement" — need Roberto's concrete examples of wrong assignments to tune `condition()` rules.

## Item 15 — Eggs as whole units; egg whites in mL

- **STATUS:** missing — **this is exactly the handover's deferred open question #4 (unit-snapping).** `engine/meal-plan/rounding.ts` does grams-only rounding (5g/1g); no per-ingredient unit weights in the food model. A best-guess whole-unit weight list sits unconfirmed in `ROBERTO-QUESTIONS-2026-05.md` §"Whole-unit food weights".
- **NOTE:** client states 1 egg ≈ 60g — reconcile against the guessed list before implementing (the guesses must be replaced by his numbers).
- **LAYER(S):** data (unit weights per food), engine (snap-to-unit rounding for flagged foods + mL rendering for liquids), app-UI, pdf.
- **EFFORT:** M.
- **DEPENDENCY:** Roberto's confirmed unit-weight list (egg, egg white mL density, fruit, bread slices…). Unblocks immediately on his answer.

## Item 16 — Clearer daily calories/macros screen

- **STATUS:** working-but-unintuitive (UX issue, not a data gap — **code partially contradicts report**: totals are shown prominently). Review Macro tab renders kcal/P/C/F cards per day type, TDEE breakdown, Energy Availability and a summary line (review/page.tsx:840-1023); per-meal totals inline in the Meals tab (:1188-1193).
- **ROOT CAUSE (of complaint):** information is split across tabs and day-types; likely the at-a-glance "one screen per day: total + per-meal" view is what's missing, and possibly the portal-side equivalent.
- **LAYER(S):** app-UI.
- **EFFORT:** S–M (needs a concrete sketch/confirmation from Roberto of what "clear" means to him).

## Item 17 — Training expenditure overestimated; RPE has little effect

- **STATUS:** working-as-coded but the code matches the complaint — partly **by spec'd design**. Verified directly:
  - Formula (`src/engine/exercise.ts:55-57,151`): `kcal = MET × kg × hours × 0.85` (recalibration), unless SCP/HR data present.
  - METs are **gross** (`sport-taxonomy.ts`: BJJ class 9.0, sparring 10.0, wrestling/judo 9.5, boxing 9.0–9.5) — resting metabolism is not netted out, so exercise kcal double-counts ~1 MET·h (~70–90 kcal/h) on top of BMR within TDEE.
  - RPE → MET multiplier is a narrow band: RPE 1→0.84×, 5→1.0×, 10→1.2× (`training-modality.ts:64-72`). 80kg, 60-min BJJ class: RPE 6 ≈ **636 kcal**, RPE 9 ≈ **710 kcal** — only ~11% apart. Client's "RPE has little effect" is literally accurate.
  - **Strength is a hard no-op:** `rpeAdjusts: false`, MET pinned at 3.0 regardless of RPE (sport-taxonomy.ts:16,46) → 80kg × 60min = flat **204 kcal** at any RPE. This is an explicit spec rule from Roberto's own protocol.
- **ROOT-CAUSE HYPOTHESIS:** (a) gross-vs-net MET inflation; (b) base METs represent continuous effort, not class-average (a 60-min BJJ "class" averages well below MET 9 once instruction/rest is included); (c) RPE band too narrow to matter.
- **LAYER(S):** engine (constants + formula), tests (**fidelity tests pin current outputs — changing these numbers is a spec change requiring Roberto sign-off, then re-pinning**).
- **EFFORT:** M.
- **DEPENDENCY:** the client offered technical input — take it. Get his expected kcal for 2–3 concrete sessions and calibrate against those.

## Item 18 — "Post-workout protein shake" on rest days

- **STATUS:** partially-built / confirmed plausible bug. The meal-slot distribution is **identical for all day types** — the `post_workout` slot (present in the 6-meal distribution) appears on OFF days too. Handover removed hard-coded whey but not the slot itself.
- **EVIDENCE:** `src/engine/meal-plan/` distribution presets + `src/data/meals/templates.ts` slot `validTypes`; mealCount not varied by dayType.
- **LAYER(S):** engine/meal-plan, data templates, app-UI/pdf labels.
- **EFFORT:** S–M (per-day-type slot relabel/substitution: post_workout → spuntino on OFF days, or day-type-aware distributions).
- **QUESTIONS:** rename only, or different food composition on rest days?

## Item 19 — Periodization modes (weekly avg / train-rest / 3-tier / 5-tier)

- **STATUS:** partially-built — half missing-feature, half discoverability.
  - Mode 1 (weekly average): implicitly exists as the fallback when no per-day sessions are set (plan.ts:396,423-430) — **not presented as a choice**.
  - Mode 2 (training vs rest): fully exists (Phase B day-type calendar ON/OFF/Refeed/Deload, per-day kcal via `plan.previewWeek`, plan.ts:612-716).
  - Mode 3 (OFF/medium/intense) & Mode 4 (+light/+double-session): **missing.** No intensity tiers — RPE is captured but barely moves EE (Item 17) and isn't surfaced as a tier; no support for two sessions on one day (`buildTrainingSessionForDay` reduces to a single ExerciseSession).
- **ROOT CAUSE of the complaint:** no explicit "generation mode" selector — the wizard exposes mechanics (day types) rather than the 4 conceptual modes Roberto thinks in.
- **LAYER(S):** app-UI (mode selector reframing — cheap), engine + routers (intensity tiers, multi-session days — the real work).
- **EFFORT:** S for reframing modes 1–2 as an explicit choice; M–L for tiers + double sessions (interacts with Item 17 RPE work — do them together).
- **QUESTIONS:** how should tiers map to kcal (fixed multipliers? per-tier MET)? Confirm with Roberto.

## Item 20 — Intraday distribution, session times, pre/intra/post-workout sections

- **STATUS:** missing entirely. No time-of-day anywhere: `ExerciseSession` has no time field (`src/engine/types.ts:84-100`), `MealSlot` has no time/workout-relative position (`engine/meal-plan/types.ts:134-144`), intake collects modality/duration/RPE only, hydration is a daily aggregate. `pre_workout`/`post_workout` meal *types* exist but are not anchored to clock times.
- **LAYER(S):** db/intake schema, engine types + meal-plan distribution, app-UI, pdf. Cross-cutting design change.
- **EFFORT:** XL (full); an M-sized first slice = collect session times at intake + render a training box with time in the day view + order slots around it, without engine-level intraday kcal solving.
- **QUESTIONS:** does Roberto need computed intraday kcal/carb timing, or structural presentation (timeline with pre/intra/post boxes) first?

## Item 21 — CRITICAL: macro inconsistency (prescribed 160–170g protein, plan totals 262g)

- **STATUS:** partially confirmed locally — divergence is architecturally possible and unguarded; exact trigger needs the real plan to reproduce.
- **DATA FLOW:** prescription (`src/engine/macros.ts`) → planner solves slots against per-meal targets (`engine/meal-plan/planner.ts`) → each meal's macros derived as **template label values × scale factor** (`scaledMacros`, `engine/meal-plan/scaler.ts:80-92`) → day total = blind sum of `slot.primary.actualMacros` (`planner.ts:60-74`, `sumActualMacros`) → review/PDF display that sum. **Prescription and summed plan are never reconciled anywhere.**
- **ROOT-CAUSE HYPOTHESES (ranked):**
  1. **Template macro values diverge from prescription solve** — meal macros come from template reference values scaled by one factor; nothing recomputes from ingredients, and slot-level overruns accumulate. A 160→262g (+60%) gap = ~25g/meal on 4 meals — consistent with protein-dense templates being scaled up to hit kcal.
  2. **Day-type/display mismatch** — prescribed figure quoted as average/rest-day while the displayed day is a training/refeed day with higher targets (compounded by per-day overrides from Phase B/C).
  3. **Rounding accumulation** (5g bins) — contributes but cannot alone explain +90g.
- **TEST GAP (answer to "do the fidelity tests pin the WRONG values?"):** worse — they pin **only the prescription formula** (marco-bellini/niccolo/raphael) and never assert `sum(meal portions) ≈ prescription`. They neither pin wrong values nor protect against this bug; the reconciliation invariant is simply untested.
- **LAYER(S):** engine (meal-plan scaler/planner), app-UI/pdf (what figure is labelled "assigned"), tests.
- **EFFORT:** M — step 1 (S): add a reconciliation test prescription-vs-summed-portions across fixtures to reproduce; step 2: fix at the divergence point; step 3: permanent invariant test + tolerance gate at generation time.
- **DEPENDENCY:** ideally the actual plan/client parameters Roberto saw 262g on, to confirm which hypothesis fires.

## Item 22 — Legal compliance & safety per patient (GDPR, consent, engagement doc)

- **STATUS:** missing (<5%). Only artifacts: a GDPR mention in a middleware comment (`src/lib/supabase/middleware.ts:14`) and one boilerplate privacy sentence in guidance text (`src/services/guidance/blocks.ts:548`). No consent tables/columns, no acceptance flow, no informativa page, no engagement-letter template, no audit/erasure mechanics.
- **LAYER(S):** db-migrations (consent records), routers, app-UI (consent capture at portal first-login + coach-side status), pdf (engagement letter), policy documents.
- **EFFORT:** L for the platform mechanics; the **legal content itself needs an Italian legal professional** — not something to author from code.
- **QUESTIONS:** does Roberto have existing informativa/consent text from his albo/professional practice? Who is data controller (him) vs processor (platform/Supabase) — needs a DPA statement.

---

## Cross-cutting notes

1. **Items 5+6+7 share one root cause** (derived metrics computed only at plan generation) — fix together as one "body-comp visibility" work package.
2. **Items 17+19 are one engine work package** (RPE/intensity model) and will trip the fidelity tests by design — requires Roberto's calibration numbers and a deliberate re-pin.
3. **Items 10+11+15 are all blocked on food-data enrichment** (fiber, sodium, unit weights) — one schema migration should add all three fields.
4. **Item 1 + migrations 002–005 cannot be verified locally** — first session with Vercel/Supabase access should close these before anything else ships.
5. **Items 12, 16, 2, 19(modes 1–2) contradict the client's framing**: the capability exists but is invisible to him (coach-only, buried, or unlabelled). Cheap wins: surface what's already built.
