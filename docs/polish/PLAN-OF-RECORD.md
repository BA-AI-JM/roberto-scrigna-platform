# PLAN OF RECORD — Roberto Scrigna Platform: to product-ready + 10/10
**Date:** 2026-07-19 · **Inputs:** `01-CODE-GAP-REGISTER.md` (32 findings, verified) + `02-DELIGHT-REGISTER.md` (dual-lane, verified) + **`CORRECTIONS-TRIAGE.md` (Roberto pt2, ALL 22 items — dispositioned in §pt2 below)** + round-1 DoD corpus + design-branch discovery
**Status:** PANEL-HARDENED (3 lenses, all findings folded) — operator ratified the arc 2026-07-19; T0.0/T0.1 external actions remain individually operator-executed · Canon: see `/NORTHSTAR.md`

## Governing rules (binding on every quantum)
1. **Domain-logic freeze — extended to the seam (clinical-lens amendment)**: BMR/TDEE/macro/SCP values untouched AND every serialize/decode/render consumer must round-trip them unchanged, proven by a value-diff oracle (the seam already leaks: `waterLoading` produced at plan-generator.ts:499 is absent from `SerializedPlanResult` — verified). EF1–EF3 are Roberto's decisions; no quantum may resolve them implicitly.
2. **Sequencing**: Tranche 1 (correctness) gates the Tranche 3 seal — no UI polish ships around a dead journey.
3. **Per-quantum oracle**: each quantum names its proof (test, screenshot, runtime probe) before merge; review-panel on material diffs.
4. **Delegation**: mechanical quanta → Codex (`cxd`) / Sonnet subagents under `delegation-verify`; judgment quanta stay Fable. GitNexus impact check before editing any shared symbol (repo AGENTS.md mandate).
5. Next.js 16 docs pre-read before any framework-adjacent code.

## Direction discovery (changes WS-B scope — evidence, not opinion)
Three unmerged branches contain a stalled June-30→July-02 design workstream:
| Branch | Content | Quality read |
|---|---|---|
| `feat/design-tokens-polish` | Token-layer luxury pass: radius scale, visible focus ring (contrast-calculated), tabular numerals, reduced-motion | Surgical, correct — merge candidate as-is |
| `feat/portal-home-polish` | Patient home hero + chips + sparkline, **456-line component with 194-line test file** | Tested, shaped — adjudicate + merge candidate |
| `design/client-home-proposal` | Isolated 2-variant coach client-home proposal with committed screenshots | **Strong**: TDEE composition bar, sparkline trio, severity-tinted "Da gestire" triage rail, interpretive clinical notes — independently converges with BOTH audit lanes' prescriptions |
**Consequence:** the design FRAME starts from ratifying this direction (teal + semantic severity + tabular data voice + triage-rail pattern), not from brandkit-from-zero. Operator taste ruling required at T0 (evidence pack: proposal screenshots + current-state sweep).

## Quanta

### T0 — OPERATOR GATES (no build until ruled)
| Q | Decision | Default recommendation |
|---|---|---|
| T0.0 | **CONFIG-ONLY HOTFIX for Roberto's live CRITICAL (eng-risk amendment)**: dead plan-email is resurrectable TODAY on prod's existing code (shareWithClient + sendPortalInvite verified present at ff4b339) — set Vercel `NEXT_PUBLIC_APP_URL`, add portal callback to Supabase redirect allowlist, send portal INVITE before/with plan share (invite provisions the auth user). No deploy, no migration | Execute on operator go — prod config = operator-gated external action |
| T0.1 | **G2: push 163 commits to `origin/main`** (Vercel prod) + env verification + **the bounded 006–016 migration checklist (eng-risk: prod DB is provisioned; from-zero rebuild is T1.2's durable fix, NOT this gate)** — apply 11 files by checklist vs `information_schema`, backup first | Push after checklist rehearsal on a prod-schema clone; do not wait for full T1.2 |
| T0.2 | ✅ **RATIFIED 2026-07-20 (operator)**: athlete-first variant, with two binding amendments — (1) **density dial: CALM** ("not too busy" — restraint over richness at every call), (2) **scope: the ENTIRE site**, and a **concept round precedes build**: multi-surface idea boards (dashboard, wizard, review, portal Oggi, login) presented for a second ruling before T3 production code | executed |
| T0.3 | GDPR counsel loop (G7): consent versioning + export/erasure scope | Engineering builds the mechanism in T1; legal text is counsel's |
| T0.4 | EF1–EF5 to Roberto: goal-direction contract, goal-rate defaults, periodization ratios, **EF4 macro-reconciliation tolerance (Item 21 — which side moves when prescription≠delivered), EF5 EE calibration (Item 17 — gross-vs-net METs, RPE band width, strength MET-3 no-op: his spec, his numbers)** | Present as 5 one-line questions with current behavior |
| T0.5 | **pt2 disposition sign-off (product-lens amendment)**: the 22-item table in §pt2 goes to Roberto — every item visibly build/built/defer, nothing silently dropped. SCP-HR-zone shelving surfaced here too (his protocol, his call) | table attached below |

### T1 — CORE CORRECTNESS (S1s + delivery integrity) — engines: Fable leads, Codex on mechanical
**Serialization cluster (eng-risk): T1.6 and T1.8 both edit `plan.ts`; T1.3 and T1.8 both touch `portal.ts` — these run in SEQUENCE, not parallel. "T1 lanes are mostly independent" is retracted; the independence claim holds only for T1.1/T1.4/T1.10/T1.11/T1.12/T1.13.**
| Q | Scope (register IDs) | Effort | Oracle |
|---|---|---|---|
| T1.0 | **Harness skeleton (eng-risk amendment — fixes the T1→T2 oracle inversion)**: minimal RLS-enabled disposable DB + one authed-render fixture, just enough to run T1.1/T1.3 oracles; T2.1 industrializes it later | S | the two T1 oracles actually executable |
| T1.1 | ✅ **SHIPPED 2026-07-20** (commit 4c06eae): migration 017 SECURITY DEFINER validate+consume RPCs, 7-day expiry wired at send, previous-weight context un-nulled; live spec RED→GREEN. Provisioning sub-piece: **ALREADY SHIPPED at HEAD** (solved-already pass #2: `shareWithClient` step 2b calls `ensurePortalAuthUser`, plan.ts:1993-2005) — Item-1 is now config(A1✅)+code(✅)+deploy(A2 pending) | M | ✅ e2e-live spec green · suite 1102 green |
| T1.2 | Migration governance: applied-ledger table, single runner replacing phantom `exec_sql`, runbook 001–016 rewrite, from-zero DB in CI (G3+G32) | M | CI job: zero→HEAD schema + smoke |
| T1.3 | ✅ **SHIPPED 2026-07-20** (commit 1979df7): status=completed + non-null-date server filter, null-honest types, belt guards; DB-level exclusion verified live. Residual: authenticated render regression test (G27 tier) lands with T1.0/T2.1 harness | S | DB filter verified · render test queued |
| T1.4 | Env schema: zod boot module, fail-fast, mode-aware optional groups, visible degradation (G4) | S | boot-without-env test fails loudly |
| T1.5 | Error-class discrimination sweep: `error||!data→NOT_FOUND` pattern audited repo-wide (16 routers); PGRST116 vs real errors split (G31). Eng-risk note: the observed trigger was local schema drift and evaporates post-T0.1 — the masking PATTERN is the durable defect; slides to T2 if schedule presses | **M** (relabeled) | grep count → 0 unhandled conflations + probe test |
| T1.6 | **approve() transaction quantum (eng-risk: absorbs former T1.9 — outbox row AND archive-prior-active update are ONE transaction in the same 40 lines of plan.ts:1220-1256)**: delivery outbox + reconciler + one-active-plan partial unique index + fix dead `delivered` branch with real `first_viewed_at` (G8+G9+G12) | M+ | Inngest handler tests + concurrent-approve test in one suite |
| T1.7 | Intake transaction: single RPC + idempotency key; UI wired through it (G10) | M | kill-between-inserts test; duplicate-retry test |
| T1.8 | plan_bundle `schemaVersion` + zod decode at every consumer + golden compat fixtures; fix dropped `waterLoading` (G11) | M | **full-payload VALUE snapshot** (every kcal/macro/gram/deficit/hydration figure) round-tripped through each consumer (PDF, portal, replay, chart) for v-current + legacy row — zod guards shape, the snapshot guards numbers |
| T1.12 | **GDPR mechanism (clinical-lens amendment, G7 + pt2 Item 22)**: versioned consent records on firma, authenticated subject-data export, erasure/anonymization workflow (DB+storage+auth) replacing delete=archive; legal TEXT per version remains counsel's (T0.3) | M | export test = complete subject dataset; erasure test = rows/files actually gone; consent record carries version+timestamp+actor |
| T1.13 | **Item 21 CRITICAL (product-lens amendment): macro-reconciliation invariant.** Step 1 (S): reconciliation test `sum(meal portions) ≈ prescription` across all fidelity fixtures + the real generated plan — reproduce the 262g-vs-170g divergence. Step 2: fix at the divergence point (template-scale drift per triage hypothesis #1). Step 3: permanent tolerance gate at generation time. Divergences requiring a VALUE ruling route to EF4, not engineering | M | reconciliation test red on pre-fix engine → green; generation-time gate blocks out-of-tolerance plans with a coach-visible reason |
| T1.9 | *folded into T1.6 (eng-risk: same function, same transaction — separate lanes would collide at plan.ts:1220-1256)* | — | — |
| T1.10 | PDF supply: pin/mirror Chromium artifact, deploy smoke for 3 renderers, local long-render fix (G13 + PDF>30s find) | S | rendered PDFs in CI artifact |
| T1.11 | Durable rate limiting (Upstash or DB-backed) on public/auth endpoints (G5). **Eng-risk: DEFERRABLE post-deploy** (single-practitioner traffic; self-documented debt) — stays in T1 only if capacity allows | S | distributed-limiter test |

### T2 — VERIFICATION SPINE — engine: Codex-heavy under gates
| Q | Scope | Effort | Oracle |
|---|---|---|---|
| T2.1 | RLS-enabled disposable-DB contract tier + authenticated e2e tier seeded from journey.ts/capture2.ts + T1.0 skeleton; first specs: check-in, portal render, generate→review (G14). Baseline truth: today the only real write in the whole test estate is login — this is greenfield infra | **L** (relabeled per eng-risk) | CI green with real DB |
| T2.2 | CI pipeline (typecheck+vitest+build+contract-tier+e2e-smoke) + package scripts + real README (G24+G19) | S | fresh-clone bootstrap timed |
| T2.3 | Router coverage: dashboard/auth/document/task/guidance behavioral tests; fidelity fixtures extended to goal-rate + absoluteOverrides (G29+G30) | M | coverage delta cited |
| T2.4 | E2E-route hard wall: NODE_ENV assertion on *-e2e pages (G23) + hygiene batch (G25/G26 doc consolidation, G17 release-manifest pattern, G20/G21 AGENTS doctrine+ADRs) | S | prod-build probe 404s |

### T3 — EXPERIENCE (design-build-loop FULL; gated by T0.2) — engine: Fable direction, mixed build
| Q | Scope | Effort | Oracle |
|---|---|---|---|
| T3.1 | Adjudicate+merge design branches: tokens-polish → **then portal work strictly AFTER T1.3 lands (eng-risk: portal-home-polish rewrites the exact file T1.3 fixes and predates the G22 fix — cherry-pick its polish ONTO the fixed base, never merge over it)** → extract client-home direction (G15). Also inventory `feat/portal-home-mobile` (ancestor-of-HEAD per merge-check; confirm no orphaned polish) | S→M | merged clean, suite green, G22 regression test still green |
| T3.2 | DIRECTION.md + token compile (`design-direction`+`design-tokens`): one identity across app/PDF/email; kill 1,862 raw hex by primitive migration on core journeys; lint rule vs new literals | M | token-adoption count + critique screenshot pass |
| T3.3 | Async-state contract: AsyncSection/EmptyState/ErrorState/mutation-receipt primitives; portal error-as-empty eliminated; dead CTA + route constants | M | state-story tests; error!=empty probe |
| T3.4a | **Services extraction (eng-risk split — was smuggled inside T3.4)**: extract contract-versioned application services + pure mappers from the 4 monoliths (plan.ts 2194 / review 1920 / generate 1568 / IntakeForm 1030) BEFORE any visual rebuild; behavior characterized first (G16) | M–L | **value-equivalence gate**: same seeded plan pre/post extraction → every clinical number identical in state AND as-rendered |
| T3.4b | Core workspace rebuild on the extracted services: generate → 4 progressive stages + debounced preview; review → exception-led rail + approval error path; **generation reveal moment** (signature #1, `motion-craft`, reduced-motion path). **EF1 carve-out (clinical-lens):** renders whatever EF1 resolves to; must not resolve goal-label-vs-direction itself (generate/page.tsx:295-308 is EF1's anchor) | L | design-critique on populated fixtures + the same value-equivalence gate re-run |
| T3.5 | Portal "Oggi": today-first plan view, meal focus, 44px ergonomics, check-in receipt (signatures #2+#3); honest streak copy | M | 390px capture set + tap-target audit |
| T3.6 | Coach dashboard triage queue (productionize proposal's "Da gestire" rail) + empty-state CTAs + emoji→icon sweep (`content-realism` for IT lexicon) | M | critique pass |
| T3.7 | Charts: fixed/domain scales, target bands, coach annotations (signature #4). ~~Selectable series & date-range~~ SOLVED at HEAD (ChartControls owns series+range — solved-already pass). **Band provenance rule (clinical-lens): every band/threshold traces to an engine target or a Roberto input — never engineering-picked** | S | chart fixture screenshots + band-provenance table |
| T3.8 | Artifact kit: PDF/email one family from tokens; email contrast; template consolidation (M8) | M | rendered artifact fixtures |
| T3.9 | A11y: label htmlFor migration, real tab roles, contrast fixes, axe+keyboard scripts in CI (M9) | S | axe clean on core pages |
| T3.10 | Firma ceremony + progress interpretation polish (signatures #4+#5) | S | critique pass |
| T3.11 | **Body-comp visibility (pt2 Items 5+6+7 — NARROWED by solved-already pass 2026-07-19)**: compute+show BF%/lean/BMR on measurement save and live in SkinfoldsEditor (pure engine reuse — verified absent at HEAD: no engine import in skinfolds-editor.tsx, createSnapshot returns `{snapshotId}` only at client.ts:656); dedicated body-comp section. ~~Item 2 Overview render~~ SOLVED at HEAD (page.tsx:174). Residual sliver: check-in-row retro-edit (snapshot edit EXISTS; checkin router has no edit) — S add-on if Roberto wants it | M→S-M | snapshot-save shows derived metrics; skinfold entry live-previews |
| T3.12 | ~~Retro-edit measurements~~ **SOLVED AT HEAD — quantum deleted** (SnapshotEditPage + client.editSnapshot:669 + audit trail shipped; solved-already pass) | — | — |

### T4 — SEAL
`design-critique` full re-score (gate PASS, zero >minor unfixed; **critique carries an honest-adherence line for T3.5/T3.7/T3.10 — no streak/badge mechanics rewarding logging over outcome; manipulation fails the gate regardless of craft**) · full suite + contract tier · `verify` end-to-end both personas · `review-panel` final · before/after evidence pack · release manifest → **T0.1 deploy** (operator) → post-deploy runtime checklist (PDF, magic link, Inngest, check-in, real iPhone).

### T5 — WEBSITE (P6, separate FRAME after seal)
Concept A editorial premium vs Concept B scroll-world cinematic; deep plan → `03-WEBSITE-PLAN.md`; bridge-lite functionality; deploy operator-gated. Direction inherits ratified identity from T3.2.

## Effort & engine summary (post-panel)
T1 ≈ 1 S(T1.0) + 8 M + 3 S (T1.11 deferrable) · T2 ≈ 1 L + 1 M + 2 S · T3 ≈ 2 L + 7 M + 4 S · T4 seal.
Codex/subagent-eligible: T1.5/7/8/10/11/12, T2.*, T3.7/8/9 (oracle-gated, delegation-verified).
**Parallelism (eng-risk corrected):** truly parallel = T1.1, T1.4, T1.10, T1.12, T1.13 (disjoint files). SERIALIZED cluster = T1.6 → T1.8 (both edit plan.ts) and T1.3 → T1.8 (both touch portal.ts); T3.1's portal work waits on T1.3; T3.4a gates T3.4b; T2.1 grows from T1.0. T3 build can start on branches once T0.2 rules; T3 SHIPPING still gates on T1 seal (Rule 2).

## §pt2 — Roberto round-2 disposition (ALL 22 items; goes to Roberto as T0.5 — nothing silent)
Evidence tiers: BUILT-VERIFIED = seen working this session (capture/test) · BUILT-CLAIMED = docs/migrations say so, T4 verifies · BUILD = quantum assigned · RULING = Roberto decision first.
| # | Item | Disposition |
|---|---|---|
| 1 | Plan email link dead (CRITICAL) | BUILD → T1.1 (auth-provisioning code fix) + T0.1 deploy + T4 live verify |
| 2 | Overview: medical/lifestyle/training render | **BUILT-VERIFIED** (solved-already pass: page.tsx:174 extended-intake rendering) |
| 3 | Customizable monitoring charts | **BUILT-VERIFIED** (ChartControls series+range; T3.7 keeps only honest-scale/bands) |
| 4 | Retro-edit measurements | **BUILT-VERIFIED for snapshots** (SnapshotEditPage + editSnapshot:669 + audit); check-in rows lack edit — S sliver in T3.11 if wanted |
| 5 | Body-comp/EE on measurement save | BUILD → T3.11 |
| 6 | Skinfold live BF%/lean/BMR | BUILD → T3.11 |
| 7 | Body-comp section, long-term | BUILD → T3.11 |
| 8 | Custom per-patient reminders | BUILT-CLAIMED (mig 012 + reminder tests) → T4 verify |
| 9 | Interactive macro editing + versioning | BUILT-VERIFIED (saveEdits/createVersion/Versioni tab, this session) |
| 10 | Veg/fiber floors | BUILT-CLAIMED (carb-floor tranche + tolerance PR #78) → T1.13 suite verifies |
| 11 | Combat protocols (water/fiber/sodium) | **BUILT-BUT-SEVERED**: engine computes waterLoading (plan-generator.ts:387), serialization DROPS it (G11) → restored by T1.8 |
| 12 | Meal alternatives / auto-swap | BUILT-VERIFIED-ADJACENT (swapMealSelection) + `feat/portion-dropdown` branch → T3.1 adjudicates |
| 13 | Full patient dashboard | PARTIAL (7 portal pages live) → elevated by T3.5 + portal-home-polish branch |
| 14 | Supplement DB + custom authoring | PARTIAL (9 supplements + interactions shipped; custom authoring open) → RULING at T0.5: build now or defer |
| 15 | Eggs as whole units / mL | BUILT-VERIFIED (portal shows "≈ 1 uovo (60 g)", this session's capture) |
| 16 | Clearer daily macros screen | BUILD → T3.4/T3.5 redesign |
| 17 | EE overestimated / RPE inert | RULING → EF5 (his calibration numbers) then S engine adjustment under his sign-off |
| 18 | Rest-day protein shake | **BUILT-VERIFIED, label corrected (terminal-2)**: the fix was a supplement-timing rename + rest-day exclusion revert, not a "whey de-hardcode" — feature behavior correct, prior description wrong |
| 19 | Periodization modes | BUILT-VERIFIED (4-mode card in wizard, this session's capture) |
| 20 | Intraday timing / pre-intra-post | BUILT-VERIFIED (timing card in portal plan, this session's capture) |
| 21 | **Macro inconsistency 262g vs 170g (CRITICAL)** | BUILD → **T1.13** + EF4 tolerance ruling |
| 22 | GDPR / consent / engagement doc | BUILD → T1.12 mechanism + T0.3 counsel text (engagement letter itself BUILT-VERIFIED) |

## Scope cuts (explicit non-goals for this arc)
Multi-partner productization (G21 ADR marks the gate) · SCP HR-zone engine (shelved per docs/SCP-HR-ZONE-ENGINE-SHELVED.md — **surfaced to Roberto at T0.5, his protocol, not a silent cut**) · round-1 unit-snapping food-DB tags beyond current rounding (needs his unit list — also T0.5) · dark mode (token discipline first) · OCR golden corpus (post-v1; provenance versioning only, G18).

## Review-panel record
Clinical-safety lens: CONCERN → contained (6 amendments: freeze-to-seam, T3.4 value-equivalence, T1.8 value snapshot, T1.12, EF1 carve-out, band provenance + honesty gate). Product lens: CONCERN-near-FAIL → contained (Item-21 T1.13, Item-1 code fix in T1.1, T3.11/T3.12, T3.7 completion, EF4/EF5, full 22-item disposition — silent drops eliminated). Eng-risk lens: CONCERN → contained (T0.0 config hotfix, T0.1 bounded-migration gate, T1.0 harness skeleton fixing the T1→T2 oracle inversion, T1.6+T1.9 merged into one approve()-transaction quantum, serialization cluster named, T3.4 split a/b, T2.1→L, T1.5→M, T1.11 deferrable, T3.1 resequenced after T1.3 + 4th portal branch inventoried). All lens verdicts line-verified before folding; dissents preserved verbatim in session record; no finding averaged away. **Panel outcome: 3× CONCERN, 0× FAIL, all load-bearing findings folded → plan ratifiable.**

## Dissent & risk (preserved)
- Fable vs Codex scoring dissents stand (dim 9: 1 vs 0; dim 10: 1.5 vs 1) — no impact on quanta.
- Risk: T3.4b remains the largest single quantum even after the a/b split; its value-equivalence gate is the guard-rail, and T3.4a's extraction must fully land first (superseded wording removed per coherence pass).
- Risk: design-branch merge conflicts with 163-commit main drift — T3.1 rebases before judging.
- Anti-concern (named): **shipping T3 polish onto an undeployed HEAD** — T0.1 sequencing keeps prod truth ahead of new work.
