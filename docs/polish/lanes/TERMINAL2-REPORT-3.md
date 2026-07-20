# TERMINAL 2 — Lane 3 Report (live-tier growth + theme-sweep + governance residue)
**Date:** 2026-07-20 · **Branch:** `polish/audit-arc-2026-07` · **Order (per ruling):** T3-C/D → T3-A → T3-B → T3-E
**Gates:** unit **1149 pass · 3 expected-fail · 3 todo · 0 fail / 112 files** · live **18 pass · 0 fail / 6 files (91 assertions)** · tsc: my files clean · DB net-zero verified.

## Verdict — DONE (all amended tasks, evidence tested)
```
████████████████████ 100%   theme-sweep + baseline · GDPR live · check-in loop · intake-txn · G17 banner
```
Ruling honored: ran official set + T3-E re-added, path (a), one banner edit. **Niccolò/Raphael READ-ONLY** enforced tier-wide — I refactored my two lane-2 specs onto the throwaway spine so nothing in `bun test e2e-live/` mutates a seed client.

## Deliverables
| Task | File(s) | Result (tested) |
|---|---|---|
| **T3-C** | `scripts/theme-sweep.ts` + `e2e-live/_provision.ts` (shared spine) | 36-shot sweep, 0 skipped; dark theme visually confirmed on Wave-A login |
| **T3-D** | `docs/polish/theme-sweep/2f016ab-dirty/` (36 PNGs + README) | pre-wave baseline anchor committed |
| **T3-A** | `e2e-live/gdpr-lifecycle.live.test.ts` | 3 pass — export completeness, confirm-guard, erase→children-gone+anonymized |
| **T3-B** | `e2e-live/checkin-submit.live.test.ts` | 4 pass — validate/submit/replay-guard/expired |
| **T3-E** | `e2e-live/intake-txn.live.test.ts` | 2 pass — replay contract (was_replay + no duplicate) |
| governance | `PRODUCTION-READINESS.md` (G17 banner, ≤6 lines) | superseded banner prepended; history kept |
| rail refactor | `portal-authenticated`, `approve-outbox` live specs | moved onto `_provision` throwaways (Niccolò no longer written) |

## Evidence detail
**T3-C/D theme-sweep** — `<html data-theme>` (globals.css) is the single switch; set in-page, screenshot full-page. 9 pages (login/dashboard/clients/plans/generate/review + portal dashboard/plan/progress) × {light,dark} × {1440,390} = 36. Coach auth as Roberto; portal + `/plans/[id]/review` via a self-provisioned throwaway (torn down). Dark login byte- and pixel-differs from light (verified the render is genuinely dark). Capture-only — no judging.

**T3-A GDPR** (migration 021 RPCs) — export is `jsonb_build_object` over 18 child-table keys; asserted client+snapshot+check_in+diary present for the seeded throwaway + every governed key exists. `eraseClient` without `confirm:"ERASE"` → 400 (zod literal), nothing erased. With confirm → `{database:{erased:true,tablesTouched≥2},storage,auth}`; children (snapshot/check_in/diary) hard-deleted; client row **anonymized in place** (`full_name='Cliente eliminato'`, email/phone/CF null) — fiscal/clinical retention (`021:298-306`). **Safety rail asserted in-code**: erase target === the id this run created; the anonymized residue row is hard-deleted in teardown for net-zero.

**T3-B check-in loop** (migration 017 consume path) — anon validate(valid)→valid; submit full payload → row `completed`, weight 82, deviation **−9.5** (prev 91.5 from snapshot via the SECURITY-DEFINER RPC — un-nulled), flagged. Expired token → validate invalid + submit 'scaduto', row stays pending.
- **Finding (verified):** a *sequential* replay returns **404 "già completato"** (caught at the validate leg, `checkin.ts:262-268`), NOT 409 — the CONFLICT/409 is the consume-leg *race* backstop. Both prevent a double-submit; the test asserts either code + that the row completed exactly once.

**T3-E intake-txn** (migration 020 RPC) — first `submitIntakeForm` → `wasReplay:false` + ids; same `idempotencyKey` → `wasReplay:true`, **same** client/snapshot ids, client count unchanged, one `intake_idempotency` reservation. Orphan-on-failure is not injectable at the live tier (the RPC is transactional by construction) — spec proves the observable replay contract and says so.

## Bug I found + fixed in my own code
`intake-txn` teardown deleted the client BEFORE its `intake_idempotency` row (which FK-references it) → the client delete was FK-blocked → 2 orphan "T2 Intake Test" clients leaked. Reordered (idempotency → snapshot → client); re-ran → self-cleans, clients back to 2. Root-caused via a mis-formed net-zero probe that *also* had a URL bug (missing `?`), which masked the real counts — corrected the probe too.

## Net-zero (mine) — verified
| Table | Baseline | After full tier + cleanup |
|---|---|---|
| client (non-deleted) | 2 | **2** (Raphael, Niccolò) |
| check_in | 0 | **0** |
| plan | — | 1 `draft` owned by **Niccolò** (`9dacdf1b`, created 11:51:39 by Terminal 1's UI wave) — **NOT my residue**, left untouched per the read-only rail |

Every throwaway (client + snapshot [+ portal user + plan + check-ins + diary]) is torn down; no `t2-*`/`t2f-*` auth users remain.

## Environmental notes (report, don't fix)
- Terminal 1's UI waves hot-reload the dev server; `/login` returned a transient **500** mid-lane. The live specs probe `/login` and **skip cleanly** when it's unhealthy (never false-green) — re-ran once it recovered. All final numbers are from a healthy stack.
- A `draft` plan for Niccolò appeared during the lane (Terminal 1 fixture). Flagged, not touched.

## Strongest counter-argument (self-check)
The theme-sweep captures a *throwaway's* portal (empty-ish history) rather than Niccolò's richer data — a deliberate cost of the read-only rail; the throwaway carries a real generated plan so `/portal/plan` and `/plans/[id]/review` are populated, and the throwaway's snapshot is copied from Niccolò so body-comp surfaces render. The sweep's baseline dir is tagged `-dirty` (uncommitted tree) — honest, and Terminal 1 re-runs at clean wave commits. Everything above was executed on the live stack this session; nothing relayed.

◆ SHIPPED — 5 commits; unit 1149/0, live 18/0, net-zero; theme-sweep net live for Terminal 1's waves
◇ NEXT — Terminal 1: run `bun run scripts/theme-sweep.ts` after each wave commit and diff against `docs/polish/theme-sweep/2f016ab-dirty/`
◈ ROLLBACK — revert the lane-3 SHAs; only new files under e2e-live/scripts/docs + the ≤6-line PRODUCTION-READINESS banner touched, no src/app
⬢ DISCONFIRM — any FAIL in `bun test e2e-live/` or `bunx vitest run`, or a leaked `T2 *` row after a run → this report is wrong; re-run and report plainly
⬡ COMPOUND — `e2e-live/_provision.ts` (throwaway client+snapshot+portal-user+coach-plan, teardown, net-zero counts) is now the one spine for every future live spec; the theme-sweep is the reusable visual-regression net
