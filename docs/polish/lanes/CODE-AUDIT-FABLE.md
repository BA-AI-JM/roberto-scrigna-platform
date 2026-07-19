# CODE AUDIT — Fable lane — 2026-07-19

**Independence note (honest):** my findings below were each established by direct read/run BEFORE I opened the Codex report (message trail in session), except where marked `[post-Codex verify]` — those are Codex claims I independently confirmed at line level. The two lanes converged from different evidence styles: mine runtime-heavy (live DB, live endpoints, git), Codex's static-trace-heavy.

## Scorecard (0–3; AAA = no dim <2, mean ≥2.5)
| Dim | Score | Justification (evidence) |
|---|---|---|
| 1 Intent | 2 | Product intent legible but scattered across 15 root handoff docs; no owned product definition |
| 2 Architecture | 1 | Reversal-expensive choices (service-role tenancy, JSONB `daily_targets` overload, runtime Chromium) have no ADRs |
| 3 Domain | 2 | Coherent Italian domain language; clean tri-tier procedures (public/protected/client, trpc.ts:81-120) |
| 4 Implementation | 1 | 4 workflow monoliths = 6,712 lines (wc: plan.ts 2194, review 1920, generate 1568, IntakeForm 1030); 12 `as unknown as` in routers; non-transactional intake (client.ts:774 comment) |
| 5 Schema & Contracts | 1 | plan_bundle unversioned at write (plan.ts:616-631); no one-active-plan invariant (portal.ts:120-134 masks with limit 1); db:migrate calls absent `exec_sql` RPC (migrate.ts:55) |
| 6 Config | 1 | Zero startup validation; **experienced live**: missing .env.local boots the app and kills login silently (dev.log unhandledRejection, button perma-disabled) |
| 7 Operations | 0 | **Deploy pipeline de-facto broken: origin/main (BA-AI-JM = Vercel prod) 163 commits behind HEAD, 0 ahead (rev-list, tested).** Runbook provisions migration 001 only (DEPLOYMENT-GUIDE.md:78-89); no rollback doc |
| 8 Observability | 0 | inngest.send swallowed with console.error, success returned (plan.ts:1241-1256); dead reminder branch `status==="delivered"` impossible per schema CHECK (functions.ts:265 vs 001:110); no tracker, no request IDs |
| 9 Security | 1 | RLS on ALL 18+ tables (live pg_policies dump) and headers/tri-tier auth real — but **public check-in journey RUNTIME-DEAD** (see F1), consumed token lacks expiry (001:198-253; expires_at sits on unused check_in_token table), limiter nondurable (rate-limit.ts:7-11), GDPR: consent instrument exists (firma/010) but no export/erasure (grep: absent) |
| 10 Quality | 1.5 | 1044 vitest green in 1.68s + tsc clean (tested) — real engine depth; but gate exercises no RLS/migrations/serverless/e2e-mutation; Playwright (86 tests) not even in package scripts |
| 11 Knowledge | 1 | OCR prompt/model hardcoded, unversioned (training-log.ts:172-178) |
| 12 Governance | 1 | Stale April "READY" verdict stands as apparent truth while contradicted at runtime; root sediment; no ADR/CODEOWNERS |
| 13 DX | 1 | No test/typecheck script in package.json (tested); stock create-next-app README; db:migrate broken vs fresh DB |
| 14 AI-affordance | 1.5 | AGENTS.md 3 lines + GitNexus context blocks injected TODAY by re-index (2011 symbols); domain freeze/verification matrix still absent |
| **Mean** | **1.07** | **Fails AAA. Operator's 4/10 instinct ≈ doctrine 1/3 — independently converges with Codex lane's 1.00.** |

## Findings (mine; severity-ordered)
### [S1|runtime|dim 9] F1 — Public check-in journey dead at HEAD (RUNTIME-PROVEN)
Created real pending check_in via service key (token `ef8d…`), called public `checkin.validateToken` as anon on :3001 → HTTP 200 `{"valid":false,"checkin":null}`. Valid token reported invalid: publicProcedure uses anon ctx client (trpc.ts context), partner-scoped RLS returns zero rows. The emailed check-in link cannot work. `[post-Codex verify — Codex found it statically; I proved it live]`
Fix: SECURITY DEFINER RPC or service-role token-consumption path (validate hash+expiry+pending atomically); anon integration test against RLS-enabled DB.

### [S1|git|dim 7] F2 — Production is 5 weeks behind the code
`git rev-list origin/main..HEAD = 163, HEAD..origin/main = 0` (tested). Vercel-connected origin (BA-AI-JM) last saw ~June-12 code: pt2 CRITICAL fixes (PDF chromium-min, auth role-gating, charts, invoice numbering, tolerance single-source) never shipped. Fix: operator-gated `git push origin main` + env/migration verification + post-deploy checklist. **Blocked on operator (external action).**

### [S2|git|dim 12] F3 — 7 unmerged branches hold product-relevant work
`design/client-home-proposal`(3c), `feat/design-tokens-polish`, `feat/portal-home-polish`(2c), `feat/portion-dropdown`, `fix/training-calorie-rpe`, `chore/seed-test-patients`(2c), `test/full-playwright-deployed` (merge-base loop, tested). A prior design workstream exists and P4 must supersede-or-merge it deliberately, not accidentally. → P3 adjudication item.

### [S2|runtime|dim 6] F4 — Missing env = silent runtime death
Experienced live during sweep: no .env.local → app serves 200s, browser Supabase client throws, login button permanently disabled, zero user-facing error. No env schema anywhere (grep). Fix: zod env module, fail at boot, degrade visibly.

### [S2|read|dim 9] F5 — GDPR Art. 9 lifecycle partial
Consent instrument exists (signature_requests 010 + firma flow). Soft-delete only (`deleted_at`, status archived); no export endpoint, no erasure/anonymization (greps over routers/migrations). Italian market + special-category data → must-fix pre-scale. `[converges with Codex S2]`

### [S3|read|dim 2] F6 — Tenancy is app-level on the main path
Service-role client imported by 12 files incl. layouts (grep list). RLS becomes a backstop only for anon/user-context paths. Acceptable single-partner; re-audit gate before any multi-partner ambition. ADR required.

### [S4|resolved] R1 — April known-limitations partially stale at HEAD
Review-page persistence RESOLVED (plan.saveEdits review/page.tsx:224, createVersion :261). Charts BUILT (components/charts/TrendChart.tsx + tests). Register must not re-open closed items.

## What the tests don't cover (mine)
RLS-enabled paths (the runtime-dead check-in ships through a green 1044); form-submission e2e (specs render+navigate only); migrations beyond 001 on fresh DB; serverless statefulness (limiter, chromium download); the deploy delta itself.

## Deploy-gap register (mine)
1. Push 163 commits (operator-gated) · 2. Migration ledger 001–016 vs prod schema (state unknown) · 3. Env parity (guide omits ANTHROPIC/CHROMIUM_PACK; misstates service-role scope) · 4. Post-deploy smoke: PDF cold-start, magic-link, Inngest registration, check-in (after F1 fix) · 5. Rollback procedure (absent).

## ENGINE-FLAGS
None initiated by this lane beyond confirming Codex's three (goal-direction contract, goal-rate defaults, periodization ratios) are real operator-decision items — all carry explicit "practitioner default, awaiting Roberto" comments in code.
