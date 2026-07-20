# TERMINAL 2 — Verification Spine Report, Lane 2 (T2.2 + live-tier expansion + T2.4)
**Date:** 2026-07-20 · **Branch:** `polish/audit-arc-2026-07` · **Tasks:** TASK 0 + T2-E/F/G/H
**Gates:** unit **1149 pass · 3 expected-fail · 3 todo · 0 fail / 112 files** · live **9 pass · 0 fail / 3 files** · tsc: my files clean.

## Verdict — DONE (5 items + the debt, all evidence tested)
```
████████████████████ 100% (TASK0 + T2-E/F/G/H)   4 commits · +7 live tests · +4 unit tests · debt cleared
```
One environmental shock mid-lane: **the local DB was reseeded by another lane**, wiping portal-auth links, every plan, and the `bafce20c` fixture that T2-F/T2-G were briefed to reuse. I made all three live specs **self-provisioning** (create their own portal user + coach-generated plan, tear it all down) so they no longer depend on churnable seed state. Reported here, not silently absorbed.

## Commits (mine only, no pushes)
| SHA | Message |
|---|---|
| `71a79e9` | test(t2): fix 6 tsc errors in dark-routers fake |
| `c2bd4e9` | fix(t2): e2e hard wall — NODE_ENV=production notFound() before flag guard (G23) |
| `7e0d615` | ci(t2): CI pipeline + verify scripts + real README (G24 + G19) |
| `b9fe32d` | test(t2): authenticated-portal live tier (G27) + approve→outbox (T1.6a) + retire stale spec |

## TASK 0 — dark-routers tsc debt → cleared (`71a79e9`)
6 errors: 4× `TS2365` in the fake's range comparator (`val as never` can't be relationally compared → cast operands to a common numeric type) + 2× `TS2345` from `as const` readonly tuples on the guidance input (→ mutable union arrays). `bunx tsc --noEmit` clean on the file; the 23 tests still green. (tested)

## T2-E — CI + verify scripts + README (`7e0d615`)
| Deliverable | Evidence (tested) |
|---|---|
| `.github/workflows/ci.yml` | jobs **typecheck · unit · build** on push+PR (no services); build fed non-secret placeholder env (`next build` runs `NODE_ENV=production` → `src/env.ts` requires the full set). **live** = opt-in `workflow_dispatch` job (documented: needs Supabase + dev server hosted CI lacks). Valid YAML (parsed). |
| `package.json` scripts | added `typecheck` · `test` · `test:watch` · `test:live` · `verify` (typecheck+test). `bun run` lists all. |
| `README.md` | replaced stock create-next-app boilerplate (G19) with real product description, prereqs, `supabase start`+`db reset`+dev, the verify triad, `migrate.ts --dry-run/--verify/--output`, and the 3 test tiers. Env vars + migrate flags + seed path verified against `src/env.ts` / `supabase/migrate.ts:15-17` / `supabase/config.toml:60-65`. |

## T2-H — e2e hard wall (`c2bd4e9`) — closes G23
Added `if (process.env.NODE_ENV === "production") notFound();` as the **first** statement in all four `*-e2e` pages, before the `NEXT_PUBLIC_E2E_*` flag check — so a stray flag in a prod build can never expose the unauthenticated bypass.

| File | Guard added |
|---|---|
| `src/app/kcal-e2e/page.tsx` | ✓ before `NEXT_PUBLIC_E2E_KCAL` |
| `src/app/reminder-e2e/[clientId]/page.tsx` | ✓ before `NEXT_PUBLIC_E2E_REMINDER` |
| `src/app/portal/feedback-e2e/page.tsx` | ✓ before `NEXT_PUBLIC_E2E_FEEDBACK` |
| `src/app/portal/firma-e2e/[requestId]/page.tsx` | ✓ before `NEXT_PUBLIC_E2E_SIGN` |

Unit test `src/__tests__/e2e-hard-wall.test.ts` (4 pass) asserts by **source position** that the production guard precedes the flag guard on each page — a positional guard is exactly what a future edit could silently reorder. No dev-path regression (dev already 404s without the flags). (tested)

## T2-F — authenticated-portal live tier (`b9fe32d`) — G27, browser (4 live pass)
The browser tier the lane-1 report said was required (the dashboard is `"use client"`; its data loads via client-side tRPC after hydration, so bun+fetch only sees the shell). Playwright + a directly-injected `sb-127-auth-token` cookie (no Mailpit/PKCE dance). **Fully self-provisions**: creates a portal auth user + links it to the seed client, coach-generates+approves a real plan, seeds the exact crash-shape check_in — then tears it all down.

| # | Assertion | Result |
|---|---|---|
| 1 | **G22 render lock** — `/portal/dashboard` renders WITHOUT the error boundary ("Si è verificato un errore") despite a `completed/null-date/weight` check_in present; no null-slice `pageerror` | pass |
| 2 | `/portal/plan` renders the active plan's meals ("Il mio piano" + meal/kcal tokens) | pass |
| 3 | **first_viewed_at (T1.6b)** — reset to null, view `/portal/plan` → marker set (`portal.ts:147-164`) | pass |
| 4 | **G22 feed contract** — `getDashboardData.weightTrend` excludes every null-date row (`portal.ts:286-287`) — folds in the retired lane-1 spec | pass |

## T2-G — approve → outbox live spec (`b9fe32d`) — T1.6a/G8+G12 (3 live pass)
Drives the real coach flow over tRPC (`plan.generate` → `plan.approve`); asserts via service key:

| # | Assertion | Result (tested) |
|---|---|---|
| 1 | approve writes **exactly one** `delivery_outbox` row (`event_name='plan/delivered'`) + activates | pass — 1 row, plan `active` |
| 2 | approving a 2nd plan **archives the prior** (one-active invariant) — `priorArchived≥1`, exactly one active remains | pass |
| 3 | re-approving an active plan is a **409 CONFLICT** ("il piano è già attivo"), no 2nd outbox row | pass |

## Environmental finding (report, don't fix — per fence)
| ID | What | Evidence |
|---|---|---|
| **env-reseed** | The local Supabase DB was reset/reseeded mid-lane (another lane). Post-reset: `client.auth_user_id` all NULL (no portal-capable client), **0 plans** (the `bafce20c` fixture T2-G was told to copy is gone), new client UUIDs. My lane-1 `portal-pending-crash.live.test.ts` hardcoded the pre-reset IDs → would have gone red. | `client?auth_user_id=not.is.null` → `[]`; `plan?select=status` → ZERO; old client `6cab145c` 404 |
| **mitigation** | Retired the stale lane-1 spec; folded its feed-contract assertion into T2-F test #4. Made **all** live specs resolve/provision their own prerequisites + clean up → robust to future reseeds. Niccolò is the only seed client with a snapshot, so both plan-generating specs use it (sequential file execution + per-file cleanup = no interference). | live tier 9/9 green |

## Lane-1 follow-through (verified landed by Terminal 1)
- `22d83f0` added the `page.tsx:238` belt guard at G22's true crash site + register anchor corrections (my **G22-followup** and **register-fix** findings) — credited "terminal-2 review".
- pt2 §Item-18 relabeled to "supplement-timing rename + rest-day exclusion revert, prior description wrong" (my **label-drift** finding). Both folded. (verified in `PLAN-OF-RECORD.md:40,109`)

## Strongest counter-argument (self-check)
The live specs prove behavior against **local** state, and I mutate a seed client (Niccolò) to provision — a purist would want a throwaway client. I chose Niccolò because it is the only client with a snapshot the engine can generate from, and every spec restores net-zero (deletes its plans/outbox/check_ins, unlinks + deletes its auth user, restores `first_viewed_at`); I verified the DB returns to 4 base rows / 0 plans after runs. The CI `build` job's placeholder env is real risk-surface: if the env schema gains a required var, the job breaks until updated — flagged inline in the workflow. Nothing was relayed unverified: every pass above was executed on the live stack this session.

◆ SHIPPED — 4 commits; unit 1149/0, live 9/0; G23 walled, G24/G19 (CI+README) shipped, G27 browser tier live, T1.6a approve/outbox proven
◇ NEXT — operator: merge `.github/workflows/ci.yml` intent (first CI on the repo) and decide whether the live job points at a self-hosted runner with the stack
◈ ROLLBACK — revert the 4 SHAs; only new files + the 4 e2e-page guards + package.json/README touched, no core source
⬢ DISCONFIRM — if `bun test e2e-live/` shows any FAIL, or `bunx vitest run` fails on my files, this report is wrong — re-run and report plainly
⬡ COMPOUND — the self-provisioning helpers (portal auth user, coach-generate+approve, cookie inject) are the reusable spine for the rest of the T2.1 authenticated e2e tier (portal journeys, check-in submit, GDPR export/erasure)
