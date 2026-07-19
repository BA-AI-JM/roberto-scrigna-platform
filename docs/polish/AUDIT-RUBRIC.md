# SHARED AUDIT RUBRIC — Roberto Scrigna Platform (P1 Code Audit)
**Repo:** `~/roberto-scrigna-platform` @ HEAD `9dc43bc` · **Date:** 2026-07-19
**Used by BOTH lanes (Fable, Codex). Same rubric, same scale, independent contexts.**

## Mission
Comprehensive code audit: what is the gap between HEAD and a product Roberto can run his practice on? Score, cite, propose. The app is claimed largely finished — your job is to find where that claim breaks.

## Definition of done (client-defined — read these first)
- `CLOSEOUT-PLAN-2026-05.md` — 12 numbered Roberto complaints, ~87–92% aligned as of May-15; #4 unit-snapping deferred, #6/#11 deploy-bound.
- `FEEDBACK-RESOLUTION-PLAN-2026-05.md`, `SPEC-ANSWERS-2026-05.md`, `CORRECTIONS-TRIAGE.md`, `HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md`
- `PRODUCTION-READINESS.md` (2026-04-27 — STALE relative to HEAD; treat its "Known Limitations" table as open-question list, verify each)
- `DEPLOYMENT-GUIDE.md` — deploy path assumptions to validate.

## Baseline (verified 2026-07-19, trust these, do not re-derive)
- 101 Vitest files / 1044 tests ALL GREEN (1.68s). 38 pages. TS strict. Next.js 16 (⚠ AGENTS.md: read `node_modules/next/dist/docs/` before judging API usage — conventions differ from training data).
- Stack: Supabase (local via Docker), tRPC, Inngest, Puppeteer PDF (@sparticuz/chromium), Resend, Bun.

## The 14 dimensions (score each 0–3; AAA = no dim <2, mean ≥2.5)
| # | Dimension | Focus here |
|---|---|---|
| 1 | Intent & Strategy | Is "Roberto's practice OS" legible in the repo? Anti-goals explicit? |
| 2 | Architecture & Topology | Reversal-expensive decisions documented? Integration failure modes (Supabase/Inngest/Resend/Puppeteer) named? |
| 3 | Domain & Language | Ubiquitous nutrition vocabulary consistent (IT/EN mix?) — engine, routers, UI labels |
| 4 | Implementation | Conventions enforced? Router type casts (`as unknown as`)? Dead code? `plans/generate` wizard size? |
| 5 | Schema & Contracts | Migrations coherent? tRPC/Zod coverage? JSONB plan_bundle versioning? Engine↔DB↔UI contract drift? |
| 6 | Configuration & Environment | 8 env vars validated at startup? Fail-fast? Blast radius documented? |
| 7 | Operations & Runtime | Deploy runbook current? Rollback path? Single-partner assumptions? |
| 8 | Observability | Can "what happened to request X" be answered? Inngest failure visibility? PDF/Resend failure paths? |
| 9 | Security & Safety | RLS on ALL tables? Portal tenant isolation? Token URLs (checkin) — entropy/expiry? Rate limiting durability (in-memory on serverless?)? GDPR Art. 9 (health data): export/delete/consent |
| 10 | Quality & Verification | 1044 tests — but what do they NOT cover? E2E state? Playwright count? Fidelity fixtures current vs SCP? |
| 11 | Knowledge & Memory | n/a unless AI features present (OCR screenshot flow — prompt versioning?) |
| 12 | Governance & Lineage | ADRs? 15 root-level .md files — governed or sediment? |
| 13 | Developer Experience | One-command local dev? No `test` script in package.json (tested) — why? |
| 14 | AI / Agent Affordance | AGENTS.md is 3 lines. Could an agent ship a correct change unaided? |

## Severity scale
- **S1** ship-blocker: data loss, security hole, broken core journey, deploy-fatal
- **S2** must-fix before product: correctness risk, GDPR gap, silent failure path, misleading UX
- **S3** polish: quality/consistency debt that a paying client would notice
- **S4** nice: cosmetic, cleanup, future-proofing

## Evidence discipline (binding)
1. Every finding: `file:line` citation + one-sentence failure scenario + severity + dimension #.
2. Tier every claim (tested)/(claimed)/(theoretical). Run commands where cheap (typecheck, grep, build) — prefer (tested).
3. **Domain-logic freeze:** BMR/TDEE/macro/SCP values are Roberto's clinical spec. Flag engine-adjacent concerns as `ENGINE-FLAG` for operator review; do NOT propose value changes.
4. No secrets in the report — env-var names only.
5. Do NOT fabricate. An empty dimension section with "nothing found" is a valid result. Findings will be line-level verified; fabrication is detectable and worse than absence.

## Output schema (markdown)
```
# CODE AUDIT — <lane name> — 2026-07-19
## Scorecard (14 rows: dim | score 0-3 | one-line justification)
## Findings (ordered by severity)
### [S1|file:line|dim N] Title
Failure scenario: ...
Evidence: ... (tested|claimed|theoretical)
Proposed fix: ...
## What the tests don't cover (explicit list)
## Deploy-gap register (HEAD → live product)
## ENGINE-FLAGS (if any)
```
