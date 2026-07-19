# CODE AUDIT — Codex lane — 2026-07-19

## Scorecard

| Dim | Dimension | Score (0–3) | One-line justification |
|---:|---|---:|---|
| 1 | Intent & Strategy | 2 | The practice-OS intent and May complaint corpus are legible, but anti-goals and release boundaries are scattered across handoffs rather than owned by one current product definition. |
| 2 | Architecture & Topology | 1 | Core seams are recognizable, but reversal-expensive choices—service-role portal access, overloaded JSONB bundles, background-event delivery, and runtime-downloaded Chromium—lack current ADRs and failure-mode design. |
| 3 | Domain & Language | 2 | Italian practitioner-facing vocabulary and canonical sport/day types are generally coherent; the selected goal and weight-derived goal direction can nevertheless contradict each other. |
| 4 | Implementation | 1 | Strict TypeScript passes and routers validate inputs, but core mutations are non-transactional and several 1,000–2,000-line files concentrate unrelated behavior. |
| 5 | Schema & Contracts | 1 | Zod covers tRPC inputs and all tables have RLS declarations, but `plan_bundle` is unversioned/unchecked, active-plan uniqueness is unenforced, and the public check-in contract contradicts RLS. |
| 6 | Configuration & Environment | 1 | An example env file exists, but there is no centralized validation or startup fail-fast and the deploy reference omits or misstates current dependencies. |
| 7 | Operations & Runtime | 0 | The documented fresh-deploy path applies only migration 001, the runner depends on an absent `exec_sql` function, no rollback is documented, and HEAD-to-live equivalence is unproved. |
| 8 | Observability | 0 | Critical event dispatch is swallowed, view-reminder logic has no view signal, and diagnostics are uncorrelated `console` output rather than an answerable request/event trail. |
| 9 | Security & Safety | 0 | Base RLS coverage is broad, but it breaks the public check-in, token expiry is absent, rate limiting is nondurable, and Art. 9 consent/export/erasure workflows are missing. |
| 10 | Quality & Verification | 1 | `(tested)` 101 Vitest files / 1,044 tests and strict typecheck pass, but the gate does not exercise real RLS, migrations, serverless behavior, external services, or HEAD on Vercel. |
| 11 | Knowledge & Memory | 1 | OCR uses a structured schema and confidence, but prompt/model/schema provenance is neither versioned nor persisted and no real-image regression corpus exists. |
| 12 | Governance & Lineage | 1 | Historical handoffs are unusually detailed, but they conflict about remotes/live state and the stale readiness verdict remains the apparent release truth without ADRs or document ownership. |
| 13 | Developer Experience | 1 | Dependencies install and tests are fast, but the README is stock, package scripts omit test/typecheck/lint, and the migration command is not a viable bootstrap path. |
| 14 | AI / Agent Affordance | 1 | `AGENTS.md` gives Next/GitNexus mechanics but not the domain freeze, architecture map, safe verification matrix, migration truth, or deploy ownership needed to ship unaided. |
|  | **Mean** | **1.00** | **Fails AAA: 12 dimensions are below 2; mean is below 2.5.** |

## Findings (ordered by severity)

### [S1|src/server/routers/checkin.ts:170|dim 9] Anonymous check-in procedures cannot pass the database policy

Failure scenario: A client opens an emailed `/portal/checkin/<uuid>` link while unauthenticated; `validateToken` queries with the anonymous Supabase client, RLS exposes no row, and the page renders “invalid token,” so the core check-in journey cannot start.

Evidence: `validateToken` and `submitCheckin` are `publicProcedure`s and use `ctx.supabase` (`src/server/routers/checkin.ts:170-187`, `199-214`); context constructs the cookie/anon client before any identity exists (`src/server/trpc.ts:32-38`); RLS is enabled on `check_in` and its only policy requires the current user to own the partner (`supabase/migrations/001_initial_schema.sql:529`, `582-586`). The public page gates all form rendering on this query (`src/app/portal/checkin/[token]/page.tsx:169-173`, `248-249`). `(tested: static authorization trace and policy inventory; live Supabase execution prohibited by lane contract)`

Proposed fix: Implement one atomic, server-only token-consumption path—prefer a narrowly scoped `SECURITY DEFINER` RPC or a service-role procedure that validates token hash, expiry, pending status, and update in one transaction—then add an anonymous integration test against an RLS-enabled database. Do not add a broad anonymous table policy.

### [S1|DEPLOYMENT-GUIDE.md:78|dim 7] The runbook cannot provision the schema required by HEAD

Failure scenario: An operator follows the documented fresh-production setup, applies only migration 001, deploys HEAD, and current legal, signature, reminder, urgent-feedback, practice-profile, invoice, and snapshot-audit routes fail on missing tables/columns.

Evidence: The guide instructs applying only `001_initial_schema.sql` and declares setup complete (`DEPLOYMENT-GUIDE.md:78-89`), while migrations 009–015 explicitly say they must be applied standalone rather than through `db:migrate` (for example `supabase/migrations/009_legal_documents.sql:10-12`, `supabase/migrations/015_partner_practice_profile.sql:7-9`). The advertised runner calls `rpc("exec_sql")` (`supabase/migrate.ts:50-60`), but an exact repository search found no migration defining that function. Migration 016 is also absent from the guide. `(tested: migration/runbook inventory and exact `exec_sql` search)`

Proposed fix: Establish one authoritative, idempotent migration mechanism with an applied-migrations ledger; test a zero-to-HEAD database in CI; update the runbook to enumerate 001–016, storage policies, verification queries, backup, and rollback/forward-fix procedures.

### [S2|supabase/migrations/009_legal_documents.sql:7|dim 9] GDPR health-data lifecycle is not implemented

Failure scenario: A client asks for proof of explicit health-data consent, a portable export, or erasure; the product can produce an engagement letter but cannot evidence consent or fulfill export/erasure, while medical history and measurements remain stored after “archive.”

Evidence: The legal migration expressly excludes consent/acceptance tables (`supabase/migrations/009_legal_documents.sql:7-8`), and the legal router says it implements no consent logic (`src/server/routers/legal.ts:4-7`). “Delete” only marks the client archived (`src/server/routers/client.ts:987-1009`); exact searches over app/server/migrations found no client data export, hard-delete/erasure, or health-consent workflow. The engagement template itself says privacy notice and consents are separate integral documents (`src/server/legal-templates.ts:139`). `(tested: route/schema inventory; legal adequacy remains operator/counsel review)`

Proposed fix: With Italian/EU counsel, add versioned privacy notice and explicit Art. 9 health-consent acceptance with timestamp/version/actor/audit evidence; implement authenticated export and an erasure/anonymization workflow covering DB, storage, auth, PDFs, and downstream processors with retention/legal-hold rules.

RLS coverage accounting used for this finding: `(tested: table-by-table migration inventory)`

| Table group | RLS/policy result |
|---|---|
| 18 base tables (`partner` through `example_meal`) | RLS enabled for every table at `supabase/migrations/001_initial_schema.sql:524-541`; partner-scoped policies exist at lines 547-677. |
| `legal_document`, `legal_document_version` | RLS enabled and partner/client-read policies present at `supabase/migrations/009_legal_documents.sql:76-117`. |
| `signature_request` | RLS enabled and partner/client policies present at `supabase/migrations/010_signature_requests.sql:58-85`. |
| `snapshot_edit_audit` | RLS enabled; partner insert/read only at `supabase/migrations/011_snapshot_edit_audit.sql:38-63`. |
| `client_reminder_settings` | RLS enabled; partner access/client read at `supabase/migrations/012_reminder_settings.sql:36-55`. |
| `urgent_feedback` | RLS enabled; separate client insert/read and partner read/update at `supabase/migrations/013_urgent_feedback.sql:38-73`. |
| `partner_practice_profile` | RLS enabled and partner policy present at `supabase/migrations/015_partner_practice_profile.sql:67-79`. |
| Migration 014 / 016 changes | They add a column/constraint rather than a table, so they inherit their tables' existing RLS. |

This inventory found no application table lacking an RLS enablement statement; the material RLS defect is the over-restrictive public check-in contract above, plus the intentionally service-role-backed portal's dependence on manual query scoping.

### [S2|src/lib/rate-limit.ts:7|dim 9] Public and auth rate limits reset across serverless instances

Failure scenario: An attacker distributes attempts across cold starts/concurrent Vercel instances and bypasses limits on token validation, check-in submission, portal messages, and authentication-sensitive endpoints.

Evidence: The module states its `Map` is process-local and provides no cold-start cross-request protection (`src/lib/rate-limit.ts:7-30`); the store is a module-level `Map` (`src/lib/rate-limit.ts:48-52`), and public check-in routes rely on it (`src/server/routers/checkin.ts:173-176`, `202-205`). `(tested: call-site and implementation trace)`

Proposed fix: Replace it with an atomic, shared limiter keyed by normalized IP plus endpoint/token/account, set bounded TTLs, and add abuse telemetry and distributed/concurrency tests. Treat forwarded headers according to the trusted Vercel proxy boundary.

### [S2|supabase/migrations/001_initial_schema.sql:205|dim 9] Check-in links claim seven-day validity but never expire

Failure scenario: Any old pending check-in URL remains usable indefinitely, so a leaked email or browser-history token can submit sensitive health data long after the promised window.

Evidence: The active `check_in` token is a database-generated UUID with a unique index—adequate approximately 122-bit random entropy—but the row has no expiry column (`supabase/migrations/001_initial_schema.sql:198-253`). A separate `check_in_token.expires_at` exists (`263-269`) but is not used by the router; validation checks only token and pending status (`src/server/routers/checkin.ts:179-187`). The email promises seven days (`src/lib/inngest/functions.ts:338-348`). `(tested: schema/router/email contract trace)`

Proposed fix: Store an expiry on the token actually consumed, preferably store only a token hash, enforce expiry and one-time atomic completion server-side, rotate on resend, and test boundary times and replay.

### [S2|src/lib/inngest/functions.ts:254|dim 8] “Plan not viewed” automation has no view event and emits false escalations

Failure scenario: The 48-hour check never fires because `delivered` is not a valid plan status, then every plan generates a seven-day “not viewed” notification/task even when the client opened it.

Evidence: The 48-hour branch compares `plan.status === "delivered"`, while the schema permits only `draft`, `active`, `completed`, and `archived` (`supabase/migrations/001_initial_schema.sql:109-110`) and approval sets `active` (`src/server/routers/plan.ts:1220-1224`). The seven-day branch creates the escalation unconditionally, without reading a view timestamp/event (`src/lib/inngest/functions.ts:277-297`). `(tested: state-machine trace)`

Proposed fix: Persist an idempotent `first_viewed_at`/delivery state from an authenticated portal view, query it before both reminders, use a valid lifecycle state, and test viewed-before-48h, viewed-between-reminders, never-viewed, and repeated-event cases.

### [S2|src/server/routers/plan.ts:1241|dim 8] Plan activation acknowledges success after losing the delivery event

Failure scenario: Inngest is unavailable during approval; the plan becomes active and the UI returns success, but the client email and all delivery follow-ups are permanently absent.

Evidence: Approval commits the database state first (`src/server/routers/plan.ts:1220-1224`), catches and only logs `inngest.send` failure (`1241-1254`), then returns success (`1256`). Check-in dispatch follows the same swallow pattern (`src/server/routers/checkin.ts:143-164`). There is no outbox or reconciliation job in the migration/function inventory. `(tested: mutation/event trace and outbox search)`

Proposed fix: Write a delivery-outbox row in the same transaction as the state change, dispatch asynchronously with idempotency/retries, surface pending/failed delivery to the coach, and reconcile stranded rows. Keep “active” distinct from “delivered.”

### [S2|src/app/(dashboard)/plans/new/IntakeForm.tsx:857|dim 4] Intake can leave orphan clients and duplicate retries

Failure scenario: Client creation succeeds but snapshot creation fails; the form shows a generic error, leaves a client without required measurements, and a retry can create a duplicate client.

Evidence: The live form performs separate `createClient` and `createSnapshot` mutations (`src/app/(dashboard)/plans/new/IntakeForm.tsx:857-867`, `921-956`) with no compensation. The nominal combined server procedure is also two inserts and does not roll back the client if the snapshot insert fails (`src/server/routers/client.ts:1016-1054`, `1107-1145`). The stale readiness document had already listed this as deferred (`PRODUCTION-READINESS.md:130`). `(tested: mutation trace)`

Proposed fix: Move intake into one database transaction/RPC with an idempotency key and uniqueness policy, route the UI through it, and test second-insert failure plus safe retry.

### [S2|src/server/routers/plan.ts:616|dim 5] Persisted plan bundles have no schema version or runtime decoder

Failure scenario: A historical or partially edited JSONB bundle is read after a shape change; PDF/portal/version replay either returns 422, silently drops new fields, or regenerates from mis-cast overrides.

Evidence: The overloaded `daily_targets` column stores both `macro_payload` and `plan_bundle` (`supabase/migrations/001_initial_schema.sql:114-116`); writes contain no schema version (`src/server/routers/plan.ts:616-631`). Consumers use unchecked casts, including PDF (`src/app/api/pdf/[planId]/route.ts:65-76`), portal (`src/server/routers/portal.ts:143-150`), mutation (`src/server/routers/plan.ts:1301-1307`), and version replay (`748-785`). The serializable contract has no version discriminator (`src/services/plan-generator.ts:505-525`), and serialization currently drops the generated `waterLoading` field (`538-548`) even though it is placed separately in `macro_payload` (`src/server/routers/plan.ts:495-512`). `(tested: producer/consumer contract trace)`

Proposed fix: Introduce a discriminated `schemaVersion`, runtime-decode every read with Zod, preserve all fields explicitly, provide pure migrations/adapters for old versions, and add golden compatibility tests for each persisted version before changing any engine values.

### [S2|src/app/(dashboard)/plans/generate/page.tsx:295|dim 5] ENGINE-FLAG: Selected goal does not constrain calorie direction

Failure scenario: A coach selects `maintenance` or `performance`, enters a materially lower target weight, and the UI derives/sends a fat-loss deficit while persisting the contradictory selected goal label.

Evidence: `goalType` is a separate selectable field (`src/app/(dashboard)/plans/generate/page.tsx:645-664`), but the live calculation dependencies and input exclude it (`295-308`). `computeGoalRate` derives direction solely from current-versus-target weight (`src/engine/goal-rate.ts:141-151`); submission persists `goalType` while independently sending the derived deficit (`src/app/(dashboard)/plans/generate/page.tsx:470-496`). `(tested: UI→engine→router contract trace; engine-adjacent)`

Proposed fix: Operator/Roberto should define allowed goal/target combinations; then add validation and an explicit confirmation/normalization rule across UI and server. Preserve all existing clinical constants until that decision is approved.

### [S2|src/server/routers/plan.ts:1220|dim 5] Approval does not enforce one active plan per client

Failure scenario: A coach approves a second draft directly; both rows remain active and different consumers can select an arbitrary/latest plan while automations scan both.

Evidence: Approval updates only the chosen plan (`src/server/routers/plan.ts:1220-1224`); the schema has neither a partial unique index nor another invariant limiting active plans (`supabase/migrations/001_initial_schema.sql:103-116`). The portal hides ambiguity by ordering all active rows newest-first and taking one (`src/server/routers/portal.ts:120-134`). Although `createVersion` archives its source, ordinary approval does not archive other active rows (`src/server/routers/plan.ts:840-845`). `(tested: state-transition/schema trace)`

Proposed fix: Confirm the documented “one active + archived” product rule, enforce it atomically with a partial unique index and transaction that archives/completes the prior active plan, and test concurrent approvals.

### [S2|src/lib/supabase/server.ts:17|dim 6] Required configuration is not validated before serving traffic

Failure scenario: A deploy boots with a missing or malformed Supabase, Anthropic, Resend, Inngest, app-URL, signature-provider, or Chromium setting and fails only when the affected client journey is invoked—sometimes by silently skipping OCR.

Evidence: Supabase factories use non-null assertions rather than validation (`src/lib/supabase/server.ts:17-20`, `src/lib/supabase/service.ts:16-20`), while OCR explicitly degrades to an empty result when its key is absent (`src/server/routers/training-log.ts:236-240`). The example lists variables but provides no validation (`.env.local.example:1-23`); the deployment table omits `ANTHROPIC_API_KEY` and `CHROMIUM_PACK_URL`, and incorrectly says service role is used only by Inngest (`DEPLOYMENT-GUIDE.md:425-445`). Exact search found no central env schema. `(tested: env reads/reference inventory)`

Proposed fix: Add a server-only Zod env module with mode-aware required/optional groups, validate on startup/deploy smoke test, publish owner/rotation/blast-radius metadata for each variable, and make deliberately optional capabilities visibly disabled rather than silently empty.

### [S2|src/pdf/chromium-launcher.ts:12|dim 2] Every PDF cold start depends on downloading an executable from GitHub

Failure scenario: GitHub egress is blocked, slow, rate-limited, or the pack disappears; all plan, invoice, and engagement-letter PDF generation fails at runtime despite a successful application deploy.

Evidence: The shared launcher states `chromium-min` ships no binary and downloads/extracts one at runtime (`src/pdf/chromium-launcher.ts:12-17`), defaulting to a GitHub release URL and invoking it on Vercel (`25-39`). The runbook instead describes bundled `@sparticuz/chromium` and tells operators to verify a dependency that is no longer installed (`DEPLOYMENT-GUIDE.md:454-477`; actual dependency is `@sparticuz/chromium-min` at `package.json:17`). `(tested: launcher/package/runbook trace; availability scenario theoretical until Vercel exercise)`

Proposed fix: Make the binary a controlled, checksum-pinned deployment artifact or mirror it in owned storage, document architecture/timeout/cache assumptions, add a deploy-time PDF smoke test for all three renderers, and expose dependency failures distinctly.

### [S2|vitest.config.ts:5|dim 10] The green verification gate cannot detect database-policy or deploy failures

Failure scenario: A release passes all 1,044 tests while an RLS contradiction, absent migration, serverless cold-start behavior, or external-service configuration breaks production.

Evidence: Fresh commands passed: `bunx tsc --noEmit` (0 errors) and `bunx vitest run` (101 files, 1,044 tests, 0 failures, 1.86s). Vitest is restricted to `src/**/*.test.ts` in a Node environment (`vitest.config.ts:5-9`); exact test searches found no `validateToken`/`submitCheckin` test and no real migration/RLS harness. Playwright has five root specs and a dev-server config (`playwright.config.ts:3-25`) but is absent from package scripts (`package.json:5-9`) and was intentionally not run in this lane. `(tested)`

Proposed fix: Add an RLS-enabled disposable-DB contract tier that applies 001–016 from zero; public check-in and portal tenant tests; Inngest/outbox, token expiry, and concurrent active-plan tests; plus a protected-preview smoke gate. Keep the 1.8-second unit tier intact.

### [S3|src/server/routers/training-log.ts:172|dim 11] OCR output lacks prompt/model/schema provenance

Failure scenario: The hard-coded prompt or model changes and two identical screenshots produce materially different kcal/session records, but the coach and operator cannot identify which AI contract produced either row or replay a regression.

Evidence: The prompt and model are literals (`src/server/routers/training-log.ts:172-178`, `243-259`), while persistence records only an extracted flag, raw notes, and confidence (`417-433`; schema columns at `supabase/migrations/001_initial_schema.sql:178-182`). Exact test search found no OCR image/model contract tests; the May handoff says OCR had never run on a real screenshot (`HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md:100`). `(tested: code/test inventory; model behavior unverified)`

Proposed fix: Give prompt, output schema, and model configuration immutable versions; persist them with raw response/asset hash and reviewer corrections; validate the parsed payload at runtime; maintain a consented, redacted real-image golden corpus with accuracy and drift thresholds.

### [S3|PRODUCTION-READINESS.md:3|dim 12] The apparent readiness verdict is stale and contradicts current code

Failure scenario: An operator trusts “READY FOR DEPLOYMENT,” applies the old runbook, and ships without noticing the broken check-in, nondurable limiter, changed PDF packaging, or 001–016 migration gap.

Evidence: The assessment is dated 2026-04-27 and claims readiness (`PRODUCTION-READINESS.md:3-4`), 320 tests (`12-15`), a green public check-in (`64-69`), production-adequate rate limiting (`81-92`), and a verified token-to-DB trace (`108-118`). Current `(tested)` baseline is 1,044 tests and the cited implementation contradicts those operational/security claims. A later handoff said production still ran old main and live click-through/migrations were unverified (`HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md:12-16`), while a June handoff claims other increments live (`HANDOFF-CONTEXT.md:80-88`). `(tested: document-to-code comparison; current live state unverified)`

Proposed fix: Replace mutable readiness prose with a dated release manifest tied to commit, migration set, deployment ID, test evidence, known gaps, owner, and expiry; mark superseded handoffs prominently and keep one canonical deploy truth.

### [S3|src/server/routers/plan.ts:2194|dim 4] Core workflows are concentrated in unreviewable monoliths

Failure scenario: A change to plan generation/review or intake collides with unrelated mutation/UI state, increasing regression and merge-conflict risk and making ownership or focused verification impractical.

Evidence: Fresh `wc -l` measured `plan.ts` 2,194 lines, plan review 1,920, plan generation page 1,568, and `IntakeForm.tsx` 1,030 (6,712 total). The router combines generation, versioning, approval/delivery, meal mutations, email sharing, and listing in one file; the UI files similarly mix orchestration, validation, domain mapping, and rendering. `(tested)`

Proposed fix: Extract contract-versioned application services and pure mappers first, then route modules and bounded UI sections by workflow; characterize current behavior before moving code and preserve domain values unchanged.

### [S3|package.json:5|dim 13] There is no reliable one-command developer verification/bootstrap surface

Failure scenario: A new developer follows the README or `package.json`, runs no tests/typecheck, or invokes the broken migration runner and assumes a locally working app represents production.

Evidence: Scripts expose only dev/build/start/db:migrate—no test, typecheck, lint, E2E, setup, or verify (`package.json:5-9`). The README is unchanged create-next-app text, suggests four package managers and editing nonexistent `app/page.tsx` (`README.md:1-21`), and contains no Supabase/Inngest/Resend/OCR/PDF setup. `(tested: script/docs inventory)`

Proposed fix: Add `verify`, `test`, `typecheck`, and explicit integration/E2E scripts; replace the README with prerequisites, deterministic setup, service modes, seed/login guidance, migration verification, common failure modes, and a production-parity smoke command.

### [S3|AGENTS.md:1|dim 14] Agent guidance omits the product's load-bearing constraints

Failure scenario: An unaided agent follows the Next/GitNexus mechanics yet changes clinical constants, writes an incompatible JSONB shape, uses the wrong migration/deploy path, or declares success from unit tests alone.

Evidence: The project-specific opening only warns about Next.js (`AGENTS.md:1-5`); the remaining generated GitNexus section prescribes graph mechanics (for example `14-20`) but does not describe the clinical domain freeze, architecture/data map, RLS/service-role rules, plan-bundle compatibility, permitted verification tiers, canonical remote/live truth, or migration ownership. `(tested: complete AGENTS.md review)`

Proposed fix: Add a concise maintained project doctrine covering intent/anti-goals, bounded contexts and data carriers, clinical-value freeze/escalation, auth/RLS invariants, migration/deploy workflow, required tests by change class, secrets rules, and current canonical documents; keep generated tool guidance separate.

## What the tests don't cover

- Real Supabase authorization: anonymous public check-in, authenticated partner RLS, service-role portal scoping, storage policies, and adversarial cross-tenant queries.
- Zero-to-HEAD schema provisioning and migration 001–016 compatibility/idempotency; `db:migrate` only validates file readability when credentials are absent and requires an undefined `exec_sql` RPC when present.
- Check-in token expiry, atomic one-time consumption/replay, concurrent submissions, resend/rotation, or the email's seven-day promise.
- Distributed/serverless cold-start rate limiting and trusted-proxy/IP behavior.
- Durable Inngest/Resend delivery, event-loss reconciliation, email arrival, idempotent retries, or real plan-view tracking.
- Transactional intake failure/retry, concurrent plan approvals, and the one-active-plan invariant.
- Backward/forward compatibility of historical `daily_targets.plan_bundle` and `macro_payload`, including May fields `goalOverride`, `weekScheduleOverride`, `perDayTrainingSessionRaw`, `macroOverrides`, and `waterLoading`.
- The full May wizard journey: prefill → goal-rate → schedule override → macro override → preview → generate → persist → review → PDF → portal, including contradictory goal/target inputs.
- GDPR health-consent proof, data-subject export, erasure/anonymization, storage/auth/downstream deletion, retention, and legal holds.
- Real OCR screenshots, prompt/model drift, unit conversion accuracy, malformed model payloads, consent to send health imagery to a processor, and human correction feedback.
- Runtime Chromium download, checksum/version mismatch, cold-start timeout, and all three PDF renderers on the production platform.
- Real magic-link portal invite/auth callback, protected-preview access, responsive interaction, accessibility/keyboard/screen-reader behavior, and current HEAD on live Vercel.
- Fidelity fixtures cover three named engine cases, but not production database serialization/replay or an externally approved, versioned SCP/clinical golden corpus.

## Deploy-gap register (HEAD → live product)

| Gap | HEAD evidence | Live evidence | Status / release action |
|---|---|---|---|
| Commit equivalence | Rubric pins audited HEAD `9dc43bc`. | No current deployment ID/commit manifest in repo; network/runtime checks were prohibited. May says live was old main (`HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md:12-16`); June names older successful commits (`HANDOFF-CONTEXT.md:80-88`). | **Unverified / blocker:** prove the production deployment resolves to `9dc43bc` (or enumerate its diff) before release claims. |
| Database migrations | HEAD contains 001–016 and routes depend on later objects. | May says 002–005 unverified (`HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md:121-122`); June claims 007 applied (`HANDOFF-CONTEXT.md:62-69`); no applied ledger covers 001–016. | **Unverified / blocker:** inventory production schema read-only, back up, apply missing migrations through one governed mechanism, then verify policies/constraints. |
| Public check-in | Static trace proves anon client conflicts with check-in RLS. | April readiness claims green, but no anonymous RLS runtime evidence exists. | **Known HEAD blocker:** fix and test before deployment; do not weaken RLS broadly. |
| Environment | HEAD additionally consumes Anthropic and remote Chromium configuration; service role is used beyond Inngest. | Current values/presence intentionally not inspected; deploy guide is stale. | **Unverified:** validate names/presence without printing secrets; smoke each optional/required capability. |
| Background delivery | HEAD swallows Inngest dispatch failures and lacks a durable outbox/view event. | May marks plan send and portal invite deploy-bound/untested (`HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md:97-103`). | **Unverified / must-fix:** add durability, then demonstrate event, email, portal view, reminder suppression, and reconciliation. |
| PDF runtime | HEAD downloads Chromium from GitHub at Vercel runtime. | Guide describes a different bundled dependency; no current cold-start evidence. | **Unverified / must-fix:** pin/mirror artifact and run plan/invoice/legal PDF smoke tests in the target deployment. |
| OCR | HEAD uses `claude-opus-4-7` with unversioned prompt/provenance. | May explicitly says never run on a real screenshot. | **Unverified:** confirm processor/env/consent, then run a governed real-image regression set and record prompt/model version. |
| Full UI | Source includes May wizard and later portal increments. | May preview was SSO 401 and no live click-through; no newer complete journey evidence is tied to HEAD. | **Unverified:** protected-preview desktop/mobile/a11y click-through and targeted Playwright suite owned by the runtime lane. |
| Rollback | No rollback/forward-fix procedure found in `DEPLOYMENT-GUIDE.md`. | No current backup/restore drill evidence. | **Missing:** document application rollback, migration forward-fix, backup/PITR, owner, decision thresholds, and rehearse them. |

## ENGINE-FLAGS (if any)

- **Goal semantics contract:** `src/app/(dashboard)/plans/generate/page.tsx:295-308` derives calorie direction without `goalType`, allowing the stored goal label and applied deficit/surplus to disagree. Operator/Roberto decision required; no clinical constants changed or proposed here.
- **Goal-rate defaults:** `src/engine/goal-rate.ts:5-13`, `69-95` explicitly labels the May 2026 caps/floors/bands as practitioner defaults because the spec was silent. Preserve them until Roberto approves or replaces them with a versioned clinical rule set.
- **Periodization ratios:** `src/engine/macros.ts:38-45` marks light/medium/intense/double macro ratios provisional and awaiting Roberto calibration. This audit does not judge or propose replacements; record explicit practitioner acceptance before calling these modes clinically final.
