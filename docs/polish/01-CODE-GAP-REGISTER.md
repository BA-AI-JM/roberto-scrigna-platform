# 01 · CODE GAP REGISTER — merged, verified — 2026-07-19
Sources: `lanes/CODE-AUDIT-FABLE.md` + `lanes/CODE-AUDIT-CODEX.md` (independent lanes, same rubric).
**Verification protocol applied (delegation-verify):** every relayed finding line-checked by the merge lane; S1s escalated to runtime proof where possible. **Codex lane integrity: 17/17 spot-checked claims REAL — zero fabrications detected.**
Verification column: RUNTIME (executed live) > LINE (citation opened & confirmed) > CONV (both lanes independently converged).

## Scoreboard convergence
Fable mean **1.07** · Codex mean **1.00** — independent convergence: **fails AAA; operator's 4/10 ≈ doctrine 1/3.**
Preserved scoring dissents (not averaged): dim 9 Security (Fable 1 — credits broad RLS+tri-tier auth; Codex 0 — weights the dead journey) · dim 10 Quality (Fable 1.5 — engine depth is real capital; Codex 1 — gate blindness).

## S1 — ship-blockers
| ID | Finding | Evidence anchor | Verify | Route |
|---|---|---|---|---|
| G1 | **Public check-in journey dead at HEAD** — valid token → `{"valid":false}` for anon caller; RLS blocks publicProcedure's anon client | checkin.ts:170-214 · trpc.ts ctx · 001:582-586 · live curl on :3001 | **RUNTIME** | P4 quantum #1 (SECURITY DEFINER RPC / service-role token path + anon RLS test) |
| G2 | **Production 163 commits behind** — Vercel origin (BA-AI-JM) last deployed ~June-12; all pt2 fixes unshipped | rev-list 163/0 | RUNTIME (git) | **OPERATOR GATE** (push + env + migration verify + smoke) |
| G3 | **Fresh deploy cannot provision schema** — runbook applies 001 only; `db:migrate` calls `exec_sql` RPC that exists nowhere | DEPLOYMENT-GUIDE.md:78-89 · migrate.ts:55 · grep ∅ | LINE | P4 (governed migration ledger 001–016) + deploy gate |

## S2 — must-fix before product
| ID | Finding | Anchor | Verify | Route |
|---|---|---|---|---|
| G4 | No env validation; missing env = silent runtime death (login dies with zero feedback) | server.ts:17-20 · service.ts:16-20 · lived during sweep | RUNTIME | P4 (zod env boot module) |
| G5 | Rate limiter nondurable across serverless instances (self-documented) | rate-limit.ts:7-30 | LINE+CONV | P4 (Upstash/shared store) |
| G6 | Consumed check-in token never expires (email promises 7 days; expiry column sits on unused `check_in_token` table) | 001:198-253 vs :263-269 · checkin.ts:179-187 · functions.ts:338-348 | LINE | P4 (merge into G1 quantum) |
| G7 | GDPR Art. 9 lifecycle partial: consent exists (firma/010), export+erasure absent, "delete"=archive | 009:7-8 · legal.ts:4-7 · client.ts:987-1009 · greps ∅ | LINE+CONV | P4 + operator/counsel |
| G8 | Plan delivery events swallowed — DB commits, inngest.send fails silently, success returned; no outbox | plan.ts:1241-1256 · checkin.ts:143-164 | LINE | P4 (transactional outbox) |
| G9 | "Not viewed" automation broken both directions: 48h branch compares impossible status `delivered`; 7-day branch fires without any view signal | functions.ts:265 vs 001:110 CHECK · functions.ts:277-297 | LINE | P4 (first_viewed_at event + valid states) |
| G10 | Intake non-transactional client+snapshot (UI fires two mutations; server path two inserts, no rollback) — orphans + duplicate retries | IntakeForm.tsx:857-867,921-956 · client.ts:1016-1145 | LINE | P4 (single RPC/transaction + idempotency key) |
| G11 | `plan_bundle` JSONB unversioned; consumers cast unchecked (PDF/portal/replay); serialization drops `waterLoading` | plan.ts:616-631 · pdf route:65-76 · portal.ts:143-150 · plan-generator.ts:538-548 | LINE | P4 (schemaVersion + zod decode + golden compat tests) |
| G12 | No one-active-plan invariant; portal masks multiplicity with `limit 1` | plan.ts:1220-1224 · portal.ts:120-134 · 001:103-116 | LINE | P4 (partial unique index + archive-prior transaction) |
| G13 | PDF depends on runtime Chromium download from GitHub; runbook documents the WRONG package | chromium-launcher.ts:12-39 · package.json:17 (`chromium-min` 147.0.2) · guide:454-477 | LINE | P4 (pin/mirror artifact) + deploy smoke |
| G14 | Verification gate blind to its own S1s: no RLS harness, no migration-from-zero, no e2e mutation, Playwright not in scripts | vitest.config.ts:5-9 · package.json:5-9 · spec survey | LINE+CONV | P4 (RLS-enabled disposable-DB contract tier) |
| G15 | 7 unmerged branches incl. prior design workstream (tokens/portal-home/client-home) — collision risk with P4 rebuild | merge-base loop | RUNTIME (git) | **P3 adjudication** |
| G22 | ✅ **FIXED (T1.3, 1979df7 + belt commit)** — portal dashboard crashed to full error boundary on pending check_in rows (null `check_in_date` from sendCheckin; router fed check_ins unfiltered; the merged weight loop's NaN guard passed null through — `new Date(null)`=epoch — into `.slice` at the TRUE crash site page.tsx:241. **Anchor correction per terminal-2 review: :142/formatDate was never a crash site — internally null-guarded since April (:29-31)**). Fix: server status+non-null filter, null-honest types, loop belt guard. Live regression lock: portal-pending-crash.live.test.ts (terminal 2, 3 green) | runtime crash + corrected citations | **RUNTIME** | done |

## S3 — polish/debt
| ID | Finding | Anchor | Verify | Route |
|---|---|---|---|---|
| G16 | Workflow monoliths: 6,712 lines across 4 files (2194/1920/1568/1030) | wc -l exact match | LINE | P4 (extract services pre-UI-rebuild — the UI rebuild touches all 4) |
| G17 | Stale April "READY FOR DEPLOYMENT" verdict contradicted at runtime; governs nothing but misleads everyone | PRODUCTION-READINESS.md:3 vs G1/G2 | LINE | P4 (dated release-manifest pattern; supersede banner) |
| G18 | OCR prompt/model/schema unversioned, no provenance persisted, never run on a real screenshot | training-log.ts:172-259 · HANDOFF:100 | LINE | P4-lite (version constants + persist) · full corpus = post-v1 |
| G19 | DX surface broken: no test/typecheck scripts, stock README, broken db:migrate bootstrap | package.json:5-9 · README | LINE+CONV | P4-lite (scripts + real README) |
| G20 | AGENTS.md lacks domain freeze / verification matrix / deploy truth (GitNexus blocks injected today help navigation only) | AGENTS.md full read | LINE | P4-lite (project doctrine section) |
| G21 | Service-role tenancy on main path = RLS backstop only; needs ADR + multi-partner re-audit gate | 12-file import list | LINE | P4-lite (ADR) |

## Addendum 3 — journey-drive runtime finds (2026-07-19 late session)
| ID | Sev | Finding | Anchor | Route |
|---|---|---|---|---|
| G31 | S2 | **Error-class conflation: `if (error || !plan) → NOT_FOUND`** masks real DB failures as data absence. Runtime-proven: freshly generated plan showed coach "Piano non trovato" because local schema lacked 006's `parent_plan_id` (Postgres 42703 → PostgREST 400 → swallowed → NOT_FOUND). Same pattern greppable across routers | plan.ts:1109-1123 · repro chain: probe 404 + REST 42703 | P4 (discriminate PGRST116 from other errors; surface 500-class as errors; audit pattern repo-wide) |
| G32 | S3 | Local dev DB was a hand-tended partial schema (had 009-015 tables, lacked 006 plan columns) — G3's runbook hole reproduced on the dev box itself; 006's header even says it was written for "the dev runner" (the nonexistent `exec_sql`). 006 applied properly this session (5/5 columns now present) | information_schema dump pre/post | folds into G3 quantum (migration ledger + from-zero CI) |
| — | — | Journey-drive assets now exist: a REAL plan (engine-generated via UI, `bafce20c…`, activated), populated wizard/review/portal captures in `baseline-sweep/journey/`, plus reusable drive scripts (journey.ts, capture2.ts, review-capture.ts) — the seed of the G14/G27 authenticated e2e tier | ls journey/ | P4 fixtures |

## T1.13 step-1a evidence (2026-07-19, real generated plan `bafce20c`, engine's own deviation object — tested)
| Day type | proteinG | carbsG | fatG | kcal | withinTolerance |
|---|---|---|---|---|---|
| training | +1.3g (+0.6%) | +18g (+4.5%) | **-15.4g (-18.8%)** | -67 (-2.1%) | **True (!)** |
| rest | -0.1g (-0.1%) | +30.3g (+10.2%) | **-22.5g (-24.5%)** | -88 (-3.2%) | **True (!)** |
Findings: (a) Item-21's +60% protein does NOT reproduce on a maintenance plan — protein reconciles near-exactly; the hunt moves to deficit/override/template-pressure conditions (triage hyp. 1) and day-type display mismatch (hyp. 2), ideally with Roberto's actual 262g client parameters. (b) **NEW thread G33 (S2-candidate): fat systematically under-delivered ~20% relative while `withinTolerance=True`** — the ±5% tolerance flag (PR #78 single-sourcing) evidently doesn't gate per-macro deviation, so the review page's tolerance badge can bless a plan 20% under on fat. Routed into T1.13 scope (the tolerance gate must define per-macro bounds — bounds themselves = EF4 Roberto ruling). Method note: an earlier script pass showed -100% rows on carbs/kcal — that was a field-name artifact in MY probe (`carbG` vs bundle's `carbsG`), caught before relay; the engine's deviation object is the source of record.

## T1.13 step-1b evidence (24-scenario solver sweep, maintenance→contest-prep × 3/4/5 meals — tested)
- **Protein: worst divergence -2.9% (-5g)** across the whole grid. The CURRENT per-ingredient solver cannot produce Item-21's +60% → hypothesis narrowed to (a) day-type/display labeling mismatch or (b) an older build (Roberto's observation predates the Stage-2 solver + PR #78 tolerance work). His actual client/plan example settles it — queued in the Roberto pack.
- **G33 CONFIRMED systematic**: fat under-delivers up to -19.9% (maint-train/4m; -14.2% mod-cut-rest/3m; -11.8% roberto-case/3m) with carbs compensating +8–13% and kcal ≈ flat — kcal-first solving sacrifices fat accuracy and `withinTolerance=True` blesses it. Per-macro bounds are an EF4 ruling with these numbers attached. 5-meal configurations reconcile best across the board (fat within ±4% in 7/8 scenarios).
- Sweep artifact: `baseline-sweep/t113-deficit-sweep.ts` (reusable as the T1.13 regression seed).

## ENGINE-FLAGS (operator/Roberto decision queue — no AI changes permitted)
| EF | Question | Anchor |
|---|---|---|
| EF1 | Goal label vs derived calorie direction can contradict (maintenance + lower target → deficit sent, label persisted) | generate/page.tsx:295-308,470-496 · goal-rate.ts:141-151 |
| EF2 | goal-rate caps/floors/bands are practitioner DEFAULTS awaiting Roberto sign-off | goal-rate.ts:5-13,69-95 |
| EF3 | Periodization macro ratios marked provisional awaiting calibration | macros.ts:38-45 |

## Addendum — hygiene inventory (Explore lane, spot-verified 6/6 REAL)
| ID | Sev | Finding | Anchor | Route |
|---|---|---|---|---|
| G23 | S3 | E2E bypass routes (`kcal-e2e`, `reminder-e2e`, `portal/feedback-e2e`, `portal/firma-e2e`) render real components WITHOUT auth gates, guarded ONLY by build-time `NEXT_PUBLIC_E2E_*` flags — one flag set in a prod build = live unauthenticated bypass | kcal-e2e/page.tsx:11 (verbatim verified) | P4 (add NODE_ENV/VERCEL_ENV hard assertion) |
| G24 | S3 | Zero CI — `.github/` absent entirely; no gate executes anywhere (compounds G14/G19) | ls ABSENT (verified) | P4 (CI quantum: typecheck+vitest+build+e2e) |
| G25 | S4 | AI-affordance doesn't travel: `.gitnexus` (.gitignore:67) + `.claude/` (:70) ignored while AGENTS.md references `.claude/skills/*` → dangling on fresh clone; CLAUDE.md duplicates the ~100-line GitNexus block byte-identically | .gitignore:61-70 (verified) | P4-lite |
| G26 | S4 | Governance sediment quantified: 11 dated session docs at root; the REAL architecture canon (JSONB-carrier map, verify triad, lane discipline) trapped in `HANDOFF-CONTEXT.md:9-76`, unlinked from any agent entry point | HANDOFF-CONTEXT.md:9-13 (verbatim verified) | P4 (doc consolidation quantum, feeds G17/G20) |
| — | — | Precision upgrades to existing findings: G8 → exactly 103 console.error / 0 console.log / no structured logging; G19 → no lint config exists, the 8 `eslint-disable` comments in src are INERT, README points at nonexistent `app/page.tsx`; G16 → TODO/FIXME count in src is 0 (debt is structural, not annotated) | greps (verified) | — |
| — | — | P2/P6-relevant: UI language is hardcoded inline Italian (NO i18n lib) — copy polish = code edits; bilingual website would be a real lift | package.json deps (verified) | P3 scope note |

## Addendum 2 — coverage cartography (Explore lane, spot-verified 5/5 REAL; it also corrected 3 of OUR briefed baselines)
| ID | Sev | Finding | Anchor | Route |
|---|---|---|---|---|
| G27 | S2 | **The authenticated patient portal is never rendered by any test** — all 7 protected portal pages are visited only logged-out to assert redirect (exercise-pass.spec.ts:130); the authed pass covers coach routes only (:158-162, env-gated). A portal regression ships green. **G22 (runtime portal crash) is this gap's concrete instance — one authenticated render test with a pending check-in row would have caught it** | verified verbatim | P4 (authenticated portal render tier — pairs with G22 fix) |
| G28 | S2 | All 12 Inngest handlers (not 8 as memory claimed) have zero handler-level coverage; the 2 grep hits are comments (portal-auth.test.ts:5 verified). G9's dead branch is an instance | functions.ts:211-943 | P4 (handler harness with step mocks) |
| G29 | S3 | 5 of 16 routers dark: auth, dashboard (456 lines of KPI/heatmap/revenue/pipeline math), document, task, guidance — zero test references (dashboard grep verified empty) | _app.ts:24-41 | P4 |
| G30 | S3 | May features goal-rate + macro-override: unit-tested in isolation, absent from all 3 fidelity fixtures and all router tests — UI→plan.ts→engine wiring unverified; only weekSchedule is fidelity-pinned | fidelity/*.test.ts | P4 (extend fidelity fixtures) |
| — | — | Precision corrections accepted from this lane: Playwright = **10 specs / 6 dirs / 7 configs** (my earlier "86 tests in 5 files" was default-config-scoped); **no e2e persists ANY row** — the only real backend write in the whole suite is login; the 4 form-submitting harnesses mock tRPC and their docstrings disclaim a real-DB pass; real shipped symbols are `weekSchedule` / `absoluteOverrides` (docs' "weekScheduleOverride"/"macroOverrides" names drifted) | verified | — |

## Resolved since April (do not re-open)
Review-page persistence (saveEdits/createVersion) · charts built (TrendChart+ChartControls custom SVG) · PDF prod root-cause fixed at HEAD via chromium-min (supply-chain concern remains as G13).

## Sequencing rule (binding, from brief §7)
G1–G3 + G8/G9 (delivery correctness) gate the WS-B seal: **no UI polish ships around a dead core journey.** P4 order: G1+G6 → G3 → G4 → G8+G9 → G10–G13 → G14 → S3 batch, with G2 at operator's hand any time.

## Closure batch — 2026-07-20 (tranches 1–3 + terminal-2 lanes; each verified by main-lane execution)
CLOSED: G1 (T1.1a, live spec green) · G3+G32 (T1.2+watermark+from-zero build proven) · G4 (T1.4) · G7 (T1.12) · G8+G9+G12 (T1.6a/b, live-proven by T2-G: outbox row + prior-archived + 409) · G10 (T1.7) · G11 (T1.8 + waterLoading restored) · G13 (T1.10) · G19+G24 (T2-E: first CI + real README + scripts) · G22 (T1.3 + belt + browser render lock) · G23 (T2-H guard-order proven) · G26-partial (docs consolidated into governed set) · G27 (T2-F: authenticated browser tier exists, 4 live specs) · G28-partial (reconciler + handler paths under live proof) · G29 (dark-routers 23 tests) · G30 (fidelity matrix) · G31 (T1.5, 0 conflations) · G33→EF4 (quantified, awaiting Roberto).
OPEN: G5/T1.11 (panel-deferred post-deploy) · G14-remainder (live tier grows via self-provisioning helpers) · G15 (T3.1) · G16 (T3.4a) · G17/G20/G21/G25 (T2.4-hygiene residue → T3/T4 docs pass) · G34=T1.13-fix (EF4-gated).
Suite arc: 1044→1149 unit + 9 live · tsc 0 · CI born · branch 22 commits.
