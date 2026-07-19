# TASK: Comprehensive code audit — Codex lane (independent)

You are the CODEX LANE of a two-lane independent audit. A second lane (Claude) audits the same repo separately; you must NOT look for or read any file matching `CODE-AUDIT-FABLE*` — independence is the point.

## Contract
1. Read `docs/polish/AUDIT-RUBRIC.md` FIRST — it defines the 14 dimensions, severity scale (S1–S4), evidence discipline, domain-logic freeze, and the exact output schema you must follow.
2. Read the definition-of-done corpus listed in the rubric (CLOSEOUT-PLAN-2026-05.md etc.).
3. Audit the codebase at `/Users/liamcann/roberto-scrigna-platform` (you are cd'd there).
4. **Deliverable:** write the full report to `docs/polish/lanes/CODE-AUDIT-CODEX.md` following the rubric's output schema exactly. Every finding: file:line + failure scenario + severity + dimension + evidence tier.
5. **Acceptance criterion (a third party will run these):**
   - `test -s docs/polish/lanes/CODE-AUDIT-CODEX.md`
   - `grep -c "^### \[S" docs/polish/lanes/CODE-AUDIT-CODEX.md` returns ≥1 (or the report states "zero findings" per dimension explicitly)
   - Spot-check: every cited file:line, when opened, shows what the finding claims. Fabricated citations are treated as lane failure.

## Scope & constraints (least-privilege)
- ALLOWED: read any repo file; `bunx tsc --noEmit`; `grep`/`rg`/`find`; `bunx vitest run` (fast, 1.7s); read `node_modules/next/dist/docs/` (MANDATORY before judging Next.js API usage — this Next.js 16 differs from your training data, per AGENTS.md).
- PROHIBITED: `bun run build`, `bun run dev`, any `supabase` command, any Playwright run (the other lane owns runtime); any git mutation; any package install; any network call; writing ANY file except `docs/polish/lanes/CODE-AUDIT-CODEX.md`.
- Do not touch `.next/`, `test-results/`, `playwright-report/`.

## Emphasis (where a second pair of eyes earns its keep)
- Dimension 9 (Security): RLS coverage table-by-table; checkin token entropy/expiry; in-memory rate limiting on serverless; GDPR Art. 9 export/delete/consent.
- Dimension 5 (Contracts): plan_bundle JSONB versioning; engine↔DB↔UI drift after the May wizard work (goal-rate, weekScheduleOverride, macroOverrides).
- Dimension 10: what the 1044 green tests do NOT cover.
- Deploy-gap register: HEAD → live Vercel product, given PRODUCTION-READINESS.md is dated 2026-04-27 and stale.

Work dimension by dimension. Depth over breadth-skimming: a verified S1 is worth more than ten theoretical S4s. When done, your FINAL MESSAGE should be only: the scorecard table and finding counts by severity.
