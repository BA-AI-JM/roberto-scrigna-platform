# TERMINAL 2 — Verification Lane Report (checks & tests only)
**Date:** 2026-07-20 · **Branch:** `polish/audit-arc-2026-07` · **Lane:** T2-A/B/C/D (CREATE-only, no edits to existing src/supabase)
**Suite gate:** baseline **1044 pass / 101 files** (`19bac2f`) → after my files **1112 pass · 3 expected-fail · 3 todo · 0 fail / 106 files**. My additions are green and break nothing.

## Verdict — DONE (4/4 tasks landed, all evidence tested)
```
████████████████████ 100% (4/4 tasks)   new tests: 61 unit + 3 live = 64 · 0 suite failures introduced
```
One premise flipped under me: **G22 was fixed by Terminal 1 mid-session** (`1979df7`), so T2-C is a GREEN regression *lock*, not a RED spec. Detail below. Two register imprecisions caught at line level. One new defense-in-depth gap surfaced (append candidate).

---

## Files created (CREATE-only fence honored)
| File | Task | Tier | Result |
|---|---|---|---|
| `src/engine/meal-plan/__tests__/reconciliation-invariant.test.ts` | T2-A | vitest | 35 pass · 3 expected-fail · 3 todo |
| `src/server/routers/__tests__/dark-routers.test.ts` | T2-B | vitest | 23 pass |
| `e2e-live/portal-pending-crash.live.test.ts` | T2-C | bun:test (live) | 3 pass |
| `docs/polish/lanes/TERMINAL2-REPORT.md` | — | doc | this file |

**Fence note (flag):** T2-A's target dir `src/engine/meal-plan/__tests__/` is not in the fence's enumerated create-list, but it is a *new* file, the engine dir is *not* in Terminal 1's owned-file set, and creating ≠ editing — zero collision risk. Honored the explicit T2-A path; flagging for the record.

---

## T2-A — Reconciliation invariant (35 green · 3 expected-fail · 3 todo)
Wide deficit grid (24 scenarios, maintenance→contest-prep × 3/4/5 meals) + 5 fidelity-style prescriptions, run through the real `createMealPlan` solver. **Numbers measured fresh 2026-07-20 — reproduce the register's G33 evidence 1:1 (tested):**

| Macro | Behaviour (measured, engine HEAD) | Encoded as |
|---|---|---|
| Protein | worst **−2.9% (−5 g)** @ hard-cut-rest/3m — holds ±3% grid-wide | HARD ±5% assertion (green) |
| kcal | worst **+2.8%** — near-flat | HARD ±5% assertion (green) |
| **Fat** | worst **−19.9%** @ maint-train/4m; −14.2% @ mod-cut-rest/3m; −11.8% @ roberto-case/3m | `test.fails` + `test.todo` (EF4-pending) |
| Carbs | compensate **+8..+14%** as fat drops (kcal-first solving) | `test.fails` + `test.todo` (EF4-pending) |

**The money assertion (green today):** at maint-train/4m, kcal −0.9% / protein +1.7% (both inside ±5%) → `withinTolerance === true` **while fat sits −20% under**. That is register G33 proven as an executable test: the tolerance flag (`reconcile.ts:48-56`, kcal+protein only) blesses a fat-starved plan. The per-macro fat/carb bounds are Roberto's ruling — left as `test.fails`/`test.todo` awaiting **EF4** (HITL-MANIFEST Block C), NOT asserted green. `test.fails` is a tripwire: the day fat comes within ±5%, it flips RED and forces conversion to a hard bound. (tested — `reconciliation-invariant.test.ts`)

## T2-B — 5 dark routers, behavioral (23 green) — closes register G29
Richer chainable Supabase fake (count/head, `in/lt/lte/gte`, `range`, multi-`order`); nested `client:client_id` joins simulated by embedding `client` on fixture rows. Every router: authz (anon → `UNAUTHORIZED`, `trpc.ts:86-92`) + shape + ≥1 real aggregation number.

| Router | Real numbers asserted (tested) |
|---|---|
| **dashboard** (priority) | overview: active 2/total 3, checkins 1/2/1, **revenue 8000¢/outstanding 2000¢**, tasks 1/1, unread 2 · alerts danger-before-warning + scope · pipeline {active2,paused0,archived1} · heatmap 12-week grid + empty-state · revenueTimeline 12 buckets, current-month 8000¢ |
| auth | getSession null-for-anon / partner-by-`auth_user_id`; logout protected + signOut called |
| document | list scoped (soft-delete + cross-partner excluded); getById NOT_FOUND; create cross-tenant clientId guard |
| task | list scoped; **getUpcoming window+status filter → exactly [t1]**; create cross-tenant guard |
| guidance | **listAll → 23 blocks**; select → `count + excluded == 23` partition invariant; listDbBlocks scoped |

(tested — `dark-routers.test.ts`; guidance count cross-checked at `src/services/guidance/blocks.ts:48`)

## T2-C — G22 portal pending-crash (3 live pass) — **premise flipped: already fixed**
**G22 was fixed by Terminal 1 during this session** — `1979df7 fix(portal): pending check-ins no longer crash the dashboard (T1.3, G22)`. HEAD moved `19bac2f → 4c06eae → 1979df7 → ff970fa` while I worked. The feed now guards (tested, `portal.ts:286-287`):
```
.eq("status", "completed").not("check_in_date", "is", null)
```
So the spec stands as the **regression LOCK** the G22 route asked for, GREEN because the fix is in — not because the bug couldn't be reproduced. Evidence it was a *live* crash pre-fix: the real seed client Niccolò (`6cab145c`) already carries the exact crash shape — `check_in` `221ec6a0`: status `completed`, `check_in_date` NULL, `weight_kg` 91.2 — plus 3 pending null-date rows; pre-T1.3 his dashboard crashed on load. (tested — service-key query + live `getDashboardData`)

Live-tier technique proven and reusable: mint a portal-client session via GoTrue admin magic-link (no browser/PKCE) → `sb-127-auth-token` cookie authenticates the tRPC route. Seeds + cleans its own rows (verified: back to 4 pre-existing rows post-run).

## T2-D — 3 BUILT-CLAIMED pt2 items → all VERIFIED (report only, no fixes)
| # | Item | Verdict | Evidence (file:line, tested) |
|---|---|---|---|
| 8 | Custom per-patient reminders (mig 012) | **VERIFIED** | migration `012_reminder_settings.sql:21-33` (table+defaults 21/0) + RLS `:36-55`; router `notification.ts:224/258` upsert onConflict `:289`; pure logic `reminder-due.ts:61/88/105`; cron `functions.ts:27-29,849,985,1019`; UI `reminder-settings-card.tsx`; **16 tests** `notification-reminders.test.ts` |
| 10 | Veg/fiber floors | **VERIFIED** | floor `planner.ts:45` + compensated top-up `:172-200`; reconcile bias `reconcile.ts:59,145-147`; asserted `macro-reconciliation.test.ts:80` + `combat-protocols.test.ts:140-145`; re-exercised by my T2-A grid |
| 18 | Rest-day protein shake | **VERIFIED (label corrected)** | SNACK_03 renamed `"Frullato Proteico"` `templates.ts:198-213`; exclusion REVERTED, eligible all day-types `post-workout-rest-day.test.ts:51-58` |

---

## NEW findings (append candidates — register NOT edited, per fence)
| ID | Sev | Finding | Anchor (verified) |
|---|---|---|---|
| **G22-followup** | S3 | **Defense-in-depth gap.** T1.3 fixed G22 at the FEED only. The page-side crash site is STILL unguarded: `dashboard/page.tsx:239` `p.date.slice(0,10)` runs after a `:238` `Number.isNaN` guard that a null date PASSES (`new Date(null).getTime()===0`). If any other path feeds a null date to that map (e.g. `snapshotWeightPts` at `:232`, or a future feed change), the client render crashes again. A one-line `if (!p.date) continue;` at `:238` would close it. | `page.tsx:202,231-239` |
| **register-fix G22** | doc | Register G22 cites `page.tsx:142` (`formatDate(latest.check_in_date)`) as an unguarded crash site. It is **guarded** — `formatDate`/`formatDateShort` at `page.tsx:29-36` do `if (!iso) return "—"` (since commit `f62c180a`, 2026-04-27). The real crash was always `:239` (`p.date.slice`), which the register also cited. Recommend striking `:142` from G22. | `page.tsx:29-36` |
| **register-fix Item 18** | doc | pt2 §Item-18 label "whey de-hardcoded (phase0)" mislabels what shipped. The whey ingredient is still a fixed template component (`templates.ts:28,48,107,147,208`). The actual fix = SNACK_03 rename + rest-day exclusion revert + slot-label neutralisation (Roberto: "problem was NAMING, not inclusion"). Feature is done; the description drifted. | `templates.ts:198-213` · `post-workout-rest-day.test.ts:1-9` |
| **note** | info | Suite grew 1044→1112 from BOTH lanes. Terminal 1's in-flight uncommitted work is live in the shared tree (env schema `src/env.ts`, migration ledger `018`, PDF/chromium, supabase client/middleware). My green-suite number reflects that moving tree; my 2 files contribute 58 pass + 3 expfail + 3 todo, 0 failures. | `git status` |

## Counts
- **Unit (vitest):** 58 new passing · 3 expected-fail (EF4-pending, by design) · 3 todo (EF4 gates). Full suite **1112 pass / 0 fail / 106 files** (tested 11:01).
- **Live (bun:test):** 3 pass (T2-C). Requires :3001 + supabase local (skips cleanly if down).
- **RED specs authored:** 0 standing red (G22 fixed pre-emptively by T1.3). The 3 `test.fails` are *documented* EF4-pending markers, not failures.

## Strongest counter-argument (self-check)
The literal T2-C ask was "fetch portal dashboard … assert it does NOT error-boundary" (a page render). I did NOT reproduce the browser render crash — the dashboard is a `"use client"` component whose data loads via client-side tRPC after hydration, so a bun+fetch never executes `:239` (proven: crash-shape row present, shell returns 200 unchanged). I asserted the **feed contract** T1.3 actually changed (`weightTrend` excludes null-date rows) + route health instead. That is faithful to the fix's mechanism and deterministic in this tier; a true render assertion needs a browser (Playwright, as `sweep.ts` uses) — noted for whoever wants belt-and-suspenders. Everything else is line-verified against source, not relayed.

◆ SHIPPED — 3 test files + report; 1112/0 suite; G22 lock, G29 closed, T1.13 fat-hole pinned, 3 pt2 items VERIFIED
◇ NEXT — operator/T1 decision: fold **G22-followup** (`page.tsx:238` one-line null guard) into T1.3's closeout, and strike register `:142`/relabel Item-18?
◈ ROLLBACK — delete the 3 new test files; zero prod/runtime surface touched, no existing file edited
⬢ DISCONFIRM — if `bunx vitest run` shows any FAIL attributable to `reconciliation-invariant.test.ts` or `dark-routers.test.ts`, this report is wrong — re-run and report plainly
⬡ COMPOUND — the T2-C magic-link→`sb-127-auth-token` cookie helper is the missing primitive for the whole authenticated-portal live tier (G27); it unlocks real portal render/e2e specs
