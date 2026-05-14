# Roberto Feedback — Review & Resolution Plan

**Date:** 2026-05-12
**Source:** Roberto's 12-point feedback (May 2026) + still-open items from the April/May audit docs
**Status:** Phase 0 + all answer-independent items from Phases 1–4 shipped on branch `fix/roberto-feedback-phase0` (8 commits, +3.1k lines). Remaining work in Phases 1–4 is gated on the open questions in §4 (rounding rules, day-type structures, deficit aggressiveness, etc.).

---

## 0. Phase 0 — implemented 2026-05-12 (branch `fix/roberto-feedback-phase0`)

Build green (`next build`), typecheck clean, 393/393 vitest tests pass (the 2 previously-failing SCP `require()` tests fixed). The 4 `bun test` "failures" are the Playwright `e2e/*.spec.ts` files, which only run under `playwright test` — pre-existing, unrelated.

| Item | Files touched | What changed |
|---|---|---|
| **#7 — broken plan link** | `src/app/(dashboard)/clients/[id]/page.tsx`, **new** `src/app/(dashboard)/plans/[id]/page.tsx` | Client-profile "Piani" tab now links to `/plans/[id]/review`; added a `/plans/[id]` server route that `redirect()`s to `…/review` so any stale link also resolves. (This was the "le pagine sono state spostate" 404.) |
| **#5 — "Aggiusta Porzioni" broken** | `src/server/routers/plan.ts`, `src/app/(dashboard)/plans/[id]/review/page.tsx` | Rewrote `plan.adjustPortions` against the real bundle shape (`slots[].primary` + `slots[].substitutions[]`, not the assumed flat shape): scales every meal slot by one factor, rounds grams, recomputes slot + day macros, `deviation` and `withinTolerance` (using `DEFAULT_TOLERANCES`), and writes back into both `reportData.dayTypePlans` and the `mealPlans` record. The review-page button now actually calls the mutation (was dead `alert()` code) and is disabled while pending. |
| **#12 — whey always post-workout / add supplements** | `src/services/supplements.ts`, `src/server/routers/plan.ts` (new `plan.saveEdits`), `src/app/(dashboard)/plans/[id]/review/page.tsx` | Whey timing/rationale softened to "liberamente nell'arco della giornata… opzionale, adattare o rimuovere". Added `plan.saveEdits` mutation + a **"Salva modifiche"** button on the review page so supplement and guidance-text edits actually persist (they were local-only before — so "add a supplement" never stuck). |
| **#6 — plan-send flow unclear** | `src/app/(dashboard)/plans/[id]/review/page.tsx` | After approval the review page shows an explicit banner: "Piano attivo — il cliente lo vede su `<app>/portal/login`; usa *Condividi con Cliente* per inviargli l'email; se non ha accesso, invitalo dalla scheda cliente." (The actual email delivery still needs `RESEND_*` + `NEXT_PUBLIC_APP_URL` + Inngest endpoint registered on Vercel — env config, not code.) |
| **#11 / #6 — client portal access** | `src/server/routers/client.ts` (new `client.sendPortalInvite`), `src/app/(dashboard)/clients/[id]/page.tsx` | New **"Invita al portale"** button on the client page: ensures a Supabase auth user exists for the client's email, links `client.auth_user_id`, and emails the client a link to `/portal/login` (the proven magic-link flow). Previously there was *no* way to provision portal access — the portal was effectively dead for real clients. Requires `SUPABASE_SERVICE_ROLE_KEY` + `RESEND_API_KEY` + `NEXT_PUBLIC_APP_URL`. |
| **#1 (small part) — meal count asked at intake** | `src/app/(dashboard)/plans/new/IntakeForm.tsx` | Removed the "Numero di pasti al giorno" question from the intake form (Stile di Vita page) — it's chosen at plan-generation time, where it actually matters. |
| **housekeeping** | `src/engine/sport-correction/__tests__/edge-cases.test.ts` | Replaced two `require("../stage2-cutoff")` calls (which vitest can't resolve) with a top-level `import` — fixes the 2 failing tests. |

**Deploy note for Phase 0:** Phase 0 changes nothing about env config. For email (plan share + portal invite) to actually send, the Vercel project still needs `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (verified domain), `NEXT_PUBLIC_APP_URL`, and the Inngest endpoint registered post-deploy (see `DEPLOYMENT-GUIDE.md`).

---

## 0b. Answer-independent items from Phases 1–4 — also implemented 2026-05-12/13

| Item | Files touched | What changed |
|---|---|---|
| **#2 (engine) — real training data drives exercise EE** | new `src/services/training-modality.ts` (+ 10 vitest tests), `src/server/routers/plan.ts`, `src/services/plan-generator.ts` | Replaces the flat 300 kcal `default_estimate` on training days. Intake's per-day modality + duration + RPE is mapped to a Compendium-ish MET table and an RPE multiplier (0.84× at RPE 1, 1.0× at 5, 1.2× at 10), summed within a day and averaged across training days into a single representative `met_value` `ExerciseSession` passed through `engineOptions.trainingSession`. `collectAssumptions` distinguishes the MET-based path vs the bare default. |
| **#2 (UI) — TDEE breakdown visible** | `src/app/(dashboard)/plans/[id]/review/page.tsx` | Each day-type card on the Macro tab now shows BMR · NEAT · Esercizio · TEF · TDEE plus a label of the exercise estimation method (METs / FC / SCP / default). Renamed the footer strip "Target Calorico" → "Apporto pianificato" so the *expenditure* vs *intake* distinction is obvious. |
| **#5 (cont'd) — selectable meal alternatives** | new `plan.swapMealSelection` server mutation + `src/app/(dashboard)/plans/[id]/review/page.tsx` | The previous name-only "Alternative: A, B, C" line is now an expandable section per slot. Each substitution renders as a card (name, kcal/macro line, full scaled ingredient list with grams) with a **"Usa come principale"** button that swaps primary ↔ substitution in place (count stays stable) and recomputes day macros + deviation + tolerance. |
| **#1 (cont'd) — editable client context** | new `src/components/week-sessions-editor.tsx`, `src/components/skinfolds-editor.tsx`, `src/app/(dashboard)/clients/[id]/edit/page.tsx` | New reusable Tailwind editors (the same `WeekSessionsEditor` powers the engine MET work above). "Nuova misurazione" renamed to **"Aggiorna scheda"** and extended with: Obiettivo (dropdown + target weight + target date), Livello occupazionale, Scheda allenamento settimanale (per-day sessions), Nuova plicometria (7 sites with live method label). Pre-filled from the latest snapshot's `_intake` blob so the coach edits incrementally; new snapshot rows carry over weight/height/lifestyle/medical history from prev so each is a complete picture, not a partial diff. |
| **#1 (cont'd) — patient photo upload** | new `supabase/migrations/002_client_media_storage.sql`, `src/components/client-photo-gallery.tsx`, edits in `clients/[id]/page.tsx` + `clients/[id]/edit/page.tsx` | New private "client-media" Supabase Storage bucket (10 MiB, image MIME types) with RLS policies: partner full access on their subtree, client SELECT on theirs. Path: `client-photos/<partner_id>/<client_id>/<uuid>-<file>`. Browser-side uploader + grid gallery with click-to-zoom, available on both the client detail page and the edit page. |
| **#8 (cont'd) — workout screenshots, end to end** | new `src/components/screenshot-uploader.tsx`, `src/server/routers/training-log.ts` (relaxed `screenshotUrls` schema), edits in `monitoring/training/page.tsx`, new `supabase/migrations/003_client_media_client_write.sql`, new `src/app/portal/(protected)/training/page.tsx`, `src/server/routers/portal.ts` (extended `addTrainingLog` schema + insert) | Coach side: the decorative `<div>` is replaced by a real `<ScreenshotUploader>` with drag-and-drop, instant thumbnails, and storage path persistence; the training-log list now shows a "📸 N" badge per row. Migration 003 grants clients INSERT/UPDATE/DELETE on the bucket's `training-screenshots/<partner_id>/<client_id>/...` subtree. New portal page **/portal/training** lets the client log their own workouts (day type, duration, HR, kcal, steps, RPE slider, notes) and upload screenshots — surfaced from the portal dashboard via a "🏋️ I miei allenamenti" tile. |
| **#10 — responsiveness pass** | 6 dashboard pages | Every fixed inline `gridTemplateColumns: "1fr 1fr 1fr"` / `"repeat(4, 1fr)"` etc. swapped to `repeat(auto-fit, minmax(<min>px, 1fr))` so layouts collapse gracefully on phones (~360px) without forcing tiny columns. Desktop appearance unchanged. |

**Still not built** (genuinely answer-blocked or out of scope until the §4 questions land):

- #4 practical food rounding (needs Roberto's macro-planner rules / v4.4 spec).
- #3 day-type structure chooser + manual ON/OFF/refeed/deload assignment + weekly EE table view + multiple active protocols per client.
- #9 target-date-driven deficit calculator (rate of loss → deficit + aggressiveness slider). Engine helper module + UI in the configure-plan wizard.
- #2 (UI) full plan-configuration wizard (per-day TDEE overrides + macro overrides) — viewing is in place; *editing* needs the wizard.
- #10 activity / sport-category taxonomy unification across intake / training-log / SCP — needs Roberto's call on the canonical list (touches a DB CHECK constraint).
- Live Claude-Vision OCR on training screenshots (stub still returns `[]`).
- Audit leftovers from the May report: weekly macro distribution chart, meal-timing recommendations, supplement interaction warnings, body-fat-method nudge, PDF QA pass.
- Tech debt: normalize the `daily_targets` JSONB (promote `plan_bundle` to its own column).

**Deploy note for 0b:** apply the two new SQL migrations:
```sh
bun run db:migrate   # picks up 002_client_media_storage.sql + 003_client_media_client_write.sql
```
The `client-media` Storage bucket and its RLS policies are created idempotently. No new env vars are required beyond what Phase 0 already documented.

---

## 1. Cross-reference: each feedback point vs the current build

| # | Roberto's point | What the code actually does today | Verdict |
|---|---|---|---|
| 1 | Can't edit goal / training routine / add a new plicometria from the client folder; want patient photo upload; intake asks "n° pasti" even though the plan isn't generated then; can't change goal/routine when generating a new plan from the profile | `/clients/[id]/edit` only edits anagrafica + can add a *new snapshot* with weight / circumferences / steps. `client.update` never touches goal, training routine, skinfolds, or occupational level. Goal + per-day training sessions are written **once** into `client_snapshot.skinfold_data._intake` (an immutable blob) and never re-editable. No photo upload; no Supabase Storage bucket exists. Intake Page 6 asks `meal_count`; `/plans/generate` **also** asks meal count — redundant & confusing. | **Confirmed.** Real gap (frozen-snapshot model). |
| 2 | Can't see the maintenance kcal attributed to each specific day; numbers feel "too automatic"; not editable; want to review/modify key params before generating (goal, routine, day types, activity level, kcal, macros…) | The engine *does* compute per-day `TdeeResult` = BMR + NEAT + Exercise + TEF, and the review page shows "Target Calorico" per day-type. **But:** (a) every "training" day is identical — exercise = a flat **300 kcal `default_estimate`**; the modality/duration/RPE entered at intake are **never passed to the engine**, and the Sport Correction Protocol is **never invoked**; (b) `/plans/generate` only lets you set meal count / allergens / tags / one optional "maintenance estimate" — no editing of goal, day types, activity level, per-day TDEE, or macros; (c) the review page is read-only for TDEE/macros. | **Confirmed.** The engine is richer than the UI exposes, *and* exercise expenditure isn't really computed. |
| 3 | Can't manually pick day types (ON/OFF) or keep the weekly-average model; can't build different protocols / nutritional days for the same client by training load; want the app to ask the plan *structure* first; want a weekly EE table (Mon: 2 sessions → 2900 kcal; Tue: rest → 2200 kcal; …) | `week_schedule` is auto-derived: a day with ≥1 session → `"training"`, else `"rest"`. `refeed`/`deload` day types exist in the engine but **no UI ever sets them**. Multiple plans per client are technically supported (plan list filters by clientId) but each is just a re-run of `generate` against the same frozen snapshot — no "protocol structure" chooser. No weekly EE table view anywhere. | **Confirmed.** |
| 4 | Food quantities are uneven / impractical; apply the rounding logic "already defined in the macro planner" | `scaleIngredients` does `Math.round(grams)` — 1-gram precision, nothing else. No practical rounding (5 g steps, egg = 50 g units, liquids to 10 ml…). The "macro-planner rounding logic" Roberto refers to is **not in this repo** — it's almost certainly in the v4.4 spec doc, which lives in a sibling repo not present on this machine. | **Confirmed.** Need Roberto's exact rules; sensible defaults proposable. |
| 5 | "Adjust portion" button doesn't work; can't select breakfast alternatives / see their quantities; would like foods grouped by category (proteins / carbs / fruit…) | **The button is double-broken:** its `onClick` runs dead client-side code that just `alert()`s "salva per applicare" — it never persists or even updates state. The wired `trpc.plan.adjustPortions` mutation exists but **the button never calls it**. And the server mutation reads `slot.actualMacros` / `slot.scaledIngredients`, which don't exist — the real shape is `slot.primary.actualMacros` / `slot.primary.scaledIngredients` + `slot.substitutions[]` — so even if it were called it'd throw "Calorie attuali non calcolabili." Substitutions **are** generated with full scaled ingredients & macros, but the review UI renders only `slot.substitutions.map(s => s.template.name).join(", ")` — names only, not selectable, no quantities. | **Confirmed broken** end-to-end. |
| 6 | The app doesn't seem to send plans to clients; the flow should be clear (saved? auto-visible? manual send? link?) | `plan.approve` → Inngest `plan/delivered`; `plan.shareWithClient` sends a branded Resend email with a portal link. The portal dashboard *does* read the client's `active` plan from the DB. **But** delivery depends on: Resend domain verified + `NEXT_PUBLIC_APP_URL` set + Inngest endpoint registered post-deploy (per DEPLOYMENT-GUIDE) — likely **not fully configured** on the live Vercel deploy, so nothing arrives. And there's no in-app affordance beyond "Condividi con Cliente" on the review page, plus no surfaced client-account-provisioning flow. | **Confirmed** — partly "not deployed", partly missing UX clarity. |
| 7 | Can't open client plans from the client *profile* on desktop ("the plans have been moved"); worked on phone yesterday | The "Piani" tab on `/clients/[id]` links to **`/plans/${plan.id}`** — a route that **doesn't exist** (only `/plans/[id]/review` does). So it falls through to the custom 404, whose copy is *"La pagina che stai cercando non esiste o è stata spostata."* The `/plans` **list** page links correctly to `/plans/[id]/review`. ("Worked on phone" = he opened plans from the sidebar/Piani list, not from a profile.) | **Confirmed — trivial routing bug.** |
| 8 | Can't drag workout screenshots into the training log for analysis; the training log should be entered by the *client* in their profile, linked to a session; this could give real-time daily EE | The training-log "screenshot upload area" is a **decorative `<div>`** — no `<input type=file>`, no drag handlers, no upload, no Storage bucket. `extractExercisesFromScreenshot()` is a **stub** returning `{exercises: [], confidence: 0}`. Training logs are **coach-entered only** (`/monitoring/training`); the portal has no training-log entry. Nothing feeds training logs back into TDEE/EE. | **Confirmed — scaffolded, not built.** |
| 9 | Want target-date-driven deficit: set goal weight/composition + a date → app computes a realistic proportional deficit; show current weight, target weight, time available, weekly loss needed, avg deficit, aggressiveness (% bodyweight or % TDEE); let the pro view/modify/validate | Intake collects `target_weight_kg`, `target_event`, `target_event_date` — but they're stored in `skinfold_data._intake.goal` and **never used**. The engine has no goal-rate / timeline logic. `energyBalance` is just `weeklyAvg vs maintenanceEstimate`, and `maintenanceEstimate` **defaults to the average TDEE** → it'll always say "maintenance" unless the pro manually types a different estimate. No deficit sizing, no rate display, no aggressiveness control. | **Confirmed — net-new feature.** |
| 10 | Desktop vs mobile differ; e.g. the training-log activity dropdown shows "Arti marziali" on phone but not desktop | "Arti marziali" exists **only** in the **intake form's** `MODALITY_OPTIONS` (Page 5). The **training-log** `sessionType` enum is `strength / hypertrophy / cardio / hiit / flexibility / deload / other` — no "arti marziali". So "phone" = intake form's modality select; "desktop" = training-log's session-type select. **Two different dropdowns, not a responsive bug.** Separately: most `(dashboard)` pages use inline styles with fixed `maxWidth` and `gridTemplateColumns: "1fr 1fr 1fr"` and **no mobile breakpoints** → genuinely cramped on phones (the intake form & login *do* use responsive Tailwind). | **Half misunderstanding, half real responsiveness gap.** Fix both. |
| 11 | Wants the client-side link to test the patient experience | Portal = `<app>/portal/login` (magic-link). On the live deploy: `https://roberto-scrigna-platform.vercel.app/portal/login`. A client needs: a `client.email` on file + a linked Supabase auth user (portal layout maps `auth.uid` → client). There's **no self-serve "invita cliente al portale" button**; magic links are sent ad hoc and check-in links via `checkin.sendCheckin`. | **Mostly an info/onboarding answer + a small "invite to portal" feature.** |
| 12 | Wants to add more supplements; stop whey always being shown as post-workout | The whey master entry has `condition: () => true` (always added) and `timing: "Post-allenamento o tra i pasti…"` → whey is always present and always says post-workout. Master library = 20 fixed entries; no UI to add to the master library. The review page's Supplements tab *does* have "+ Aggiungi" / edit / remove per-plan — **need to verify those persist on save.** | **Confirmed — small fixes** (soften whey, verify persistence, optionally expand the library). |

**Plus still-open items from the April/May audits:** weekly macro distribution chart (overlaps #3), meal timing recommendations, supplement interaction/synergy warnings, BMI-based body-fat formula imprecision, PDF export QA, surfacing the plan-validation warnings in the UI.

---

## 2. Cross-cutting root causes

1. **The UI exposes far less than the engine computes, and the engine ignores the rich intake data it's handed.** Modality/duration/RPE → ignored (flat 300 kcal). SCP → never invoked. Goal/target weight/date → stored, never used. Per-day TDEE breakdown → computed, partly shown, not editable.
2. **Frozen-snapshot model.** Goal & training routine are buried in an immutable `client_snapshot.skinfold_data._intake` blob; "edit client" can't touch them; generating a new plan re-uses the same blob. There's no editable "current context" separate from historical measurements.
3. **`daily_targets` JSONB overloading + shape drift.** The `adjustPortions` bug is a direct symptom: code written against an assumed flat shape vs the real nested `slots[].primary` / `slots[].substitutions[]` shape.
4. **Inline-styled dashboard pages with no responsive breakpoints.**
5. **Deployment not fully wired** (Resend domain, `NEXT_PUBLIC_APP_URL`, Inngest registration) → "nothing gets sent."

---

## 3. Plan — 5 workstreams, phased

### Phase 0 — Quick wins / "stop the bleeding"  (~1–2 days)

- **P0.1 — Fix the broken plan link (#7).** Change `/clients/[id]` "Piani" tab links to `/plans/[id]/review`; add `src/app/(dashboard)/plans/[id]/page.tsx` that redirects to `…/review` so stale links also work.
- **P0.2 — Fix "Aggiusta Porzioni" (#5).** Wire the button → `adjustMutation.mutate({ planId, dayType })`; rewrite `plan.adjustPortions` against the real shape (`slots[].primary` + `slots[].substitutions[]`), scale grams, recompute macros from the scaled grams (via the food DB, not naïve ×scale), recompute `withinTolerance`/`deviation`, persist. Add a vitest. (Will later route through the new rounding from P2.1.)
- **P0.3 — Soften whey (#12).** Change whey `timing` → "Tra i pasti o post-allenamento per raggiungere il target proteico"; make it conditional on a real protein gap rather than `() => true`; verify per-plan supplement add/edit/remove persist on review-page save (fix if not).
- **P0.4 — Make the plan-send flow visible (#6, partial).** On the review page post-approval, show an explicit panel: *"Piano approvato — visibile nel portale del cliente · [Invia email al cliente] · Link portale: <copia>"* reusing `plan.shareWithClient`. Fix & document the deploy config (`NEXT_PUBLIC_APP_URL`, Resend domain, Inngest endpoint registration) so the email actually goes out.
- **P0.5 — Client-portal access (#11).** Document the portal URL; add an "Invita al portale" button on `/clients/[id]` that emails a magic-link sign-in to `client.email` (provisioning the auth user if needed). Hand Roberto a working test-client login.
- **P0.6 — De-dupe the meal-count question (#1, small part).** Remove `meal_count` from intake Page 6 (or relabel it "preferenza — modificabile alla generazione"); keep it only at plan-generation time (this dovetails with Phase 1).

### Phase 1 — Editable client context + a real "configure plan" step  (#1, #2, #3, #9)  (~1–1.5 weeks)

**This is the core of the feedback.** Two halves:

**1A. Make the client's *current context* editable.**
- Lift goal, training routine (per-day sessions: modality + duration + RPE), occupational level, and "new plicometria" out of the frozen `_intake` blob into editable surfaces. Recommended approach: allow creating a **new dated snapshot** that also carries an updated goal + routine + skinfolds, and always read "latest" — preserves history. Add a migration (new columns or a normalized `training_session` / `client_goal` table).
- Rebuild `/clients/[id]/edit` (or add an "Aggiorna scheda" flow) to edit: goal + target weight + target date; occupational level; the full weekly training schedule (reuse the intake `Page5` component); a new skinfold set; body-fat override; photos.
- **Photo upload (#1):** create a Supabase Storage bucket (`client-photos`), RLS-scoped per partner; upload UI on the edit/profile page + a gallery on `/clients/[id]`. (Same bucket later serves training-log screenshots — P3.)

**1B. A "configure plan" wizard before generation.** Replace the thin `/plans/generate` form with:
1. **Struttura** — choose a protocol type: *Media settimanale* / *ON-OFF (allenamento vs riposo)* / *Leggero–Medio–Pesante* / *Personalizzato* — and assign each weekday a day-type (training / rest / refeed / deload, or light / med / heavy). Pre-filled from the client's routine, fully editable. (Wires up the unused `refeed`/`deload` types.)
2. **Parametri energetici** — show the computed per-day breakdown (BMR · NEAT · Esercizio · TEF · TDEE) as a **weekly Mon–Sun table** (sessions + estimated EE + TDEE), with every value editable: override exercise kcal per day, override TDEE per day, override activity level. Plumb `TdeeOverride[]` (already a type!) and per-day `ExerciseSession` through `generateWeeklyPlan`.
3. **Obiettivo & deficit (#9)** — pick goal; if target weight + date are present, compute required Δkg, Δkg/week, implied avg daily deficit, and show **aggressiveness** (% bodyweight/week *and* % of TDEE) with a slider; the chosen deficit drives `weeklyAverageKcal`. Pro can override. New pure-TS `engine/goal-rate.ts` (fully tested); show the rationale in the plan narrative.
4. **Macro / pasti** — meal count, allergens, tags (as today), plus optional per-day macro overrides.
- On submit → `plan.generate` with the full override payload; the review page treats these as source-of-truth and explains every number.
- **Engine work:** extend `PlanOptions` / `generateWeeklyPlan` to accept `perDaySchedule`, `perDayExerciseSession`, `tdeeOverrides`, `targetDeficitKcal`; make `calculateExercise` actually use the entered modality/duration/RPE (map intake modality → MET, or → an SCP category when HR data is present). All 320 existing tests stay green; add new ones.

### Phase 2 — Meal-plan practicality  (#4, rest of #5)  (~3–4 days)

- **P2.1 — Practical rounding (#4).** New `engine/meal-plan/rounding.ts` implementing Roberto's macro-planner rules. **Need his exact rules**; proposed defaults until then: nearest 5 g (≥20 g) / nearest 1 g (<20 g); count-based foods (eggs, slices, scoops) snapped to whole units via a `unitGrams` field on the food DB; liquids to nearest 10 ml; then re-true the slot/day macros and re-check tolerance *after* rounding. Apply in `scaleMealToTarget`, `generateSubstitutions`, and `plan.adjustPortions`. Update PDF + portal rendering. Tests assert rounded output still hits macro tolerance.
- **P2.2 — Selectable alternatives with quantities (#5).** Render each substitution in the review Meals tab as a full card (name · scaled ingredients with grams · macros) with a "Usa come principale" button that swaps `primary` ↔ that substitution and persists (new `plan.swapMealSelection` mutation). Optional "raggruppa per categoria" toggle (proteine / carboidrati / frutta / …) per Roberto's note — needs a `category` field on the food DB.
- **P2.3 — Weekly macro distribution chart** (May audit + part of #3). Mon–Sun bar/table of kcal + P/C/F on the review "Macro" tab and the portal.

### Phase 3 — Training log: client-entered + screenshot OCR + EE feedback  (#8, taxonomy from #10)  (~1 week)

- **P3.1** Real screenshot upload: `<input type=file accept="image/*">` + drag/drop → upload to the Storage bucket → store `screenshot_urls` → call `trainingLog.processScreenshot`.
- **P3.2** Implement `extractExercisesFromScreenshot` for real via the Anthropic SDK (vision) — extract exercises / sets / reps / load / duration and, if present, HR-zone minutes → optionally hand off to SCP for an EE estimate.
- **P3.3** Client-side training log: a "I miei allenamenti" section in the portal where the client logs sessions (and uploads screenshots) against dates; the coach sees them in `/monitoring/training` and on `/clients/[id]`.
- **P3.4** A "rolling actual EE" for the week from logged sessions (display-only first; later optionally re-tunes the plan).
- **P3.5** Unify the activity/sport taxonomy across the intake modality list, the training-log `sessionType` enum, and the SCP `CategoryId`/`SessionType` unions — resolves the "martial arts on phone but not desktop" confusion *and* makes SCP reachable from the UI.

### Phase 4 — Responsiveness + polish  (#10, May-audit leftovers)  (~3–4 days)

- **P4.1** Responsive pass on every `(dashboard)` page: replace fixed multi-column inline grids with responsive Tailwind / `@container` layouts; verify at mobile widths; migrate the worst offenders (client detail, plan review, monitoring) onto the already-installed shadcn components.
- **P4.2** Meal timing recommendations (May audit) — a small `getMealTimingAdvice` helper surfaced on meal cards.
- **P4.3** Supplement interaction/synergy warnings (May audit) — a `checkSupplementInteractions` helper on the Supplements tab.
- **P4.4** Body-fat formula (May audit) — when only the BMI heuristic is used, prompt for plicometria more prominently and make it actionable from the UI.
- **P4.5** PDF export QA pass (layout under long plans, macro tables, headers/footers).

---

## 4. Open questions (need answers before/within Phases 1–2)

1. **Rounding rules (#4):** what exactly is the "macro-planner" rounding logic? (5 g steps? unit-snapping for eggs / slices / scoops? different rules for liquids vs solids?) — and can I get a copy of the v4.4 spec doc? It's referenced as living in a sibling repo not on this machine.
2. **Day-type structures (#3):** which preset protocol structures do you want first-class — ON/OFF; Light/Medium/Heavy; refeed days; carb-cycling patterns; anything else? And can a client hold multiple *active* plans at once, or one active + drafts?
3. **History vs current context (#1):** OK with "updating the client" creating a new dated snapshot (preserving history) that also carries the updated goal + routine, with the app always reading "latest"? Or a separate always-editable "current scheda" distinct from measurement history?
4. **Deficit aggressiveness (#9):** which expression drives/limits it — % of bodyweight/week, % of TDEE, or both with caps (e.g. clamp to 0.5–1.0 %BW/week)?
5. **Client onboarding (#6/#11):** should approving a plan auto-email the client a portal magic-link if they have no account yet, or keep account creation a separate explicit step?
6. **Sequencing:** Phase 0 ships now; Phases 1–4 as a ~3–4 week roadmap. Anything to pull forward?

---

## 5. Notes / housekeeping found along the way

- 2 failing tests in `src/engine/sport-correction/__tests__/edge-cases.test.ts` use `require("../stage2-cutoff")`, which vitest can't resolve — switch to `import` (391/393 pass otherwise). Worth folding into Phase 0.
- `client.submitIntakeForm` (a second, older intake path in `client.ts`) exists but is unused — the live form uses `client.create` + `client.createSnapshot`. Dead code; remove or reconcile.
- `daily_targets` JSONB still overloads `macro_payload` + `plan_bundle`; the shape-drift class of bug (P0.2) will recur until this is normalized. Consider promoting `plan_bundle` to its own column during the Phase 1 migration.
