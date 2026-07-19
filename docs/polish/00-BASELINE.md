# P0 BASELINE — verified 2026-07-19
All claims (tested) this session unless marked.

## Repo & deploy state
| Fact | Evidence |
|---|---|
| Canonical: `~/roberto-scrigna-platform` @ `9dc43bc` (2026-07-07), branch main tracks `fork/main` (agentarmy72-del), in sync | git status -sb |
| **DEPLOY GAP: `origin/main` (BA-AI-JM — Vercel-connected production) is 163 commits BEHIND local HEAD, 0 ahead** | `git rev-list origin/main..HEAD --count` = 163 |
| Production therefore runs ~2026-06-12 code: missing ALL pt2 fixes (PDF chromium-min prod fix, auth role-gating, charts, invoice numbering, tolerance single-source, practice profile) | git log ff4b339..HEAD |
| Stale twin quarantined: `~/projects/_quarantine-roberto-scrigna-stale-e366248` | mv + ls |
| Unmerged branches (7): `design/client-home-proposal`(3c), `feat/design-tokens-polish`(1c), `feat/portal-home-polish`(2c), `feat/portion-dropdown`(1c), `fix/training-calorie-rpe`(1c), `chore/seed-test-patients`(2c — portal-auth seeder, NOT plan seeder), `test/full-playwright-deployed`(1c) | merge-base loop |
| Feedback branches `fix/roberto-feedback-phase0` + `fix/roberto-corrections-pt2` ARE merged into HEAD | merge-base --is-ancestor |

## Suite & build baseline
| Check | Result |
|---|---|
| Vitest | **101 files / 1044 tests, ALL GREEN, 1.68s** (up from 320 in March, 451 in June) |
| tsc --noEmit | clean, exit 0 |
| Playwright inventory | 10 spec files across 6 dirs, 7 configs (default config sees 86 tests in e2e/ only). **No spec persists any row — the only real backend write in the entire test estate is login**; form-submitting harnesses (feedback/kcal/reminder/sign) mock tRPC by their own admission |
| `bun run build` | not yet run this session (contends with dev server; run at P4 gate) (claimed green per docs) |
| package.json scripts | dev/build/start/db:migrate only — **no test script** (DX finding) |

## Runtime baseline
- Supabase local UP (Docker), Next dev on **:3001** (:3000 held by Langfuse container — left untouched).
- `.env.local` was ABSENT → app boots but browser Supabase client throws, login button silently dead. Created this session from example + local dev keys. → findings: no fail-fast env validation (dim 6) + silent-death login UX (P2).
- Seed data: 1 partner, 2 clients (Niccolò, Raphael), 1 invoice, 1 notification, **0 plans** — plan surfaces render as empty states.
- DB: 18 public tables, RLS enabled on ALL, 1 partner-scoped ALL-command policy each (pg_policies dump). Server paths use service-role client (12 importers incl. layouts) → RLS bypassed there; tenancy is app-level WHERE + three-tier tRPC procedures (public/protected/client).

## Screenshot sweep — FINAL: 56/56 captures, both auth lanes green
- Harness: `docs/polish/baseline-sweep/sweep.ts` (Playwright lib, coach password login + portal magic-link via Mailpit harvest + PKCE code exchange on :3001). Two auth bugs found & fixed in harness: React-hydration race (fills before hydration never reach state — mirrors the app's own silent-death login).
- Coverage: coach + portal + publics × {1440×900, 390×844}, fullPage. `manifest.json` = source of truth.
- **Bonus finding: mobile portal-dashboard.png captured a LIVE crash** (error boundary) — a pending check_in row inserted mid-sweep for G1 verification crashed the portal (→ register G22).
- Known gaps (named): plan-populated states (0 plans → P2 journey-drive generates via UI); the May wizard cards (Obiettivo/Struttura/Macro) hidden until a client is selected — NOT captured in empty-state sweep, P2 must select client first; checkin token page; intake steps 2-7 (validation-gated); PDF/email artifacts (P2).

## Client-defined DoD corpus (ingested)
- `CLOSEOUT-PLAN-2026-05.md`: 12-item feedback round 1 — Phases A–D shipped, ~87–92% aligned as of May-15.
- `CORRECTIONS-TRIAGE.md` (2026-06-12): feedback round 2 (pt2), 6+ items incl. CRITICAL dead plan-email (deploy config), missing charts (NOW BUILT: `src/components/charts/TrendChart.tsx` + ChartControls, custom SVG), medical-history rendering gap, no retro-edit of measurements, body-comp not recomputed on save.
- `HANDOFF-ROBERTO-FEEDBACK-2026-05-18.md`: two remotes explained (origin=BA-AI-JM Vercel prod, fork=agentarmy72-del); deploy-bound items #6 (send flow) #11 (portal invite) never live-verified; Vercel preview gated by SSO 401.
- April `PRODUCTION-READINESS.md` known-limitations RE-VERIFIED at HEAD: review-page persistence **RESOLVED** (plan.saveEdits review/page.tsx:224); `as unknown as` casts still present (12 in routers); intake still non-transactional (client.ts:774 comment documents the deliberate 2-statement choice).

## GitNexus
- Re-analyzed to HEAD this session: **2011 symbols / 4106 relationships / 145 flows**; agent-context blocks now injected in repo CLAUDE.md/AGENTS.md.

## Working notes
- Dev server PID on :3001 + supabase containers left RUNNING for P2.
- Codex audit lane running since 14:44 (report lands at `lanes/CODE-AUDIT-CODEX.md`).
