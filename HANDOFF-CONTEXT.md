# Roberto Scrigna Platform — Terminal Handoff Context

**Doc path (the "link"):** `/Users/liamcann/roberto-scrigna-platform/HANDOFF-CONTEXT.md`
**Written:** 2026-06-30 ~14:00 BST · **Author terminal:** Roberto UI/backend increment terminal
**Purpose:** Restart a fresh terminal session with zero context loss. The orchestrator should paste the *Handoff Prompt* (bottom of this doc) into a new terminal, which then runs the *Re-orientation Steps* and resumes the staged-increment workflow exactly as before.

---

## 1. Intent

We are doing **staged, single-feature increments** on the Roberto Scrigna nutrition-coaching platform. Each increment is small, verified, and shipped as its own PR. Context is being intentionally reset to keep each terminal sharp — this doc is the carry-over so the new terminal picks up **with minimal interruption**. The orchestrator retains the thread and will dispatch the next increment.

This terminal just finished a run of UI + backend increments. The immediately-relevant open item is **PR #39 (awaiting merge authorization)**. Everything else is shipped/live.

---

## 2. CRITICAL CONSTRAINTS (never violate — these are standing rules)

1. **Remote targeting.** This clone has **two** remotes:
   - `fork` = `https://github.com/agentarmy72-del/roberto-scrigna-platform.git` → **THE DEPLOYED REMOTE. Push, PR, and merge here.**
   - `origin` = `https://github.com/BA-AI-JM/roberto-scrigna-platform.git` → **STALE. NEVER fetch/branch/push/PR against it.**
   - Rule of thumb: *the deployed remote is whichever URL contains `agentarmy72-del`.* Always `git remote -v` first.
2. **gh auth must be `agentarmy72-del`.** It can reset to `alfredsingularity`. Verify with `gh auth status` (look for `Active account: true` on `agentarmy72-del`). All `gh` commands pass `--repo agentarmy72-del/roberto-scrigna-platform`.
3. **PR base pinned** to `agentarmy72-del/roberto-scrigna-platform` `main` (use `--base main --head agentarmy72-del:<branch>`).
4. **NO `Co-Authored-By`** trailer in commits. (Plain commits — verify with `git log -1 --format='%b' | grep -i co-authored` → must be empty.)
5. **Do NOT merge** any PR unless the user/orchestrator **explicitly authorizes** that specific merge. Default is **PR-open, stop**.
6. **"unstable"** mergeStateStatus = the **non-blocking Vercel preview check**. It is NOT a blocker; CLEAN is ideal but UNSTABLE is mergeable.
7. **Stay in lane.** "UI lane" = `src/app` + `src/components` only. "Backend lane" = `src/server` + `src/engine` + `src/services`. Don't cross unless told.
8. **No migrations** unless explicitly told. Features ride existing JSONB columns (see §5).
9. **Commit only the exact files** the increment touched (`git add <specific paths>`), never `git add -A`. (This is why an untracked `HANDOFF-CONTEXT.md` at the repo root is safe — it won't be swept into a feature commit.)

---

## 3. Repo & stack facts

- **Path:** `/Users/liamcann/roberto-scrigna-platform` (monorepo: backend + UI lanes in one tree).
- **Stack:** Next.js 16 (App Router) · React 19 · tRPC 11 · Supabase · **Bun** · deployed on **Vercel**.
- **Git identity (already set):** `agentarmy72-del <261633342+agentarmy72-del@users.noreply.github.com>`.
- **AGENTS.md warning:** "This is NOT the Next.js you know" — read `node_modules/next/dist/docs/` before relying on training-data Next.js conventions.
- **Shell noise:** every Bash call prints a harmless `zoxide: detected a possible configuration issue…` banner — ignore it (filter with `grep -v "zoxide\|_ZO_DOCTOR\|ajeetdsouza\|consider filing\|persists\|^$"`).

---

## 4. The increment workflow (recipe)

1. **Re-orient / GUARD:** `git remote -v`; `gh auth status`; `git fetch fork`; `git log --oneline -6 fork/main`; confirm any backend prerequisites are present (`git grep` on fork/main).
2. **Branch fresh** from the **current** `fork/main`: `git checkout -b feat/<name> fork/main`.
3. **Implement** in-lane. Prefer pure, node-testable helpers + a thin presentational component (see §5 testing).
4. **Verify (all three must be green):**
   - `bunx tsc --noEmit`
   - `bunx vitest run`
   - `bun run build`
5. **Commit** exact files, no Co-Authored-By. **Push** to `fork`. **Open PR** (`--base main --head agentarmy72-del:<branch>`). **Report** new HEAD/mergeable/tests. **STOP** (do not merge).
6. **On explicit merge authorization:** re-confirm MERGEABLE vs current `fork/main` (rebase if GitHub flags a conflict, re-green tsc+vitest, force-push `--force-with-lease`); `gh pr merge <n> --repo agentarmy72-del/roberto-scrigna-platform --merge`; `git fetch fork main:main` to sync local main; **confirm a Vercel deployment exists for the new HEAD and reaches SUCCESS**.
   - **Deploy check:** `gh api repos/agentarmy72-del/roberto-scrigna-platform/commits/<sha>/status --jq '.state, (.statuses[]|"\(.context): \(.state) \(.target_url)")'`
   - **Dropped-event quirk:** merge commits occasionally don't trigger a deploy. If no deployment appears within ~2 min, re-trigger with an empty commit: `git commit --allow-empty -m "chore: re-trigger deployment" && git push fork main`, then watch to SUCCESS.

---

## 5. Architecture cheat-sheet (load-bearing facts)

- **No-migration data carriers (features ride these JSONB columns):**
  - Plan generation inputs (`macroOverrides`, `sourcePins`, `injuryStress`, `periodizationMode`) ride `plan.daily_targets.macro_payload`; the serialized plan bundle (`SerializedPlanResult`: `reportData.dayTypePlans[]`, `weeklyPlan`, `supplements`, `guidance`…) rides `plan.daily_targets.plan_bundle`.
  - Intake extras (training_sessions w/ startTime/endTime, lifestyle, goal) ride `client_snapshot.skinfold_data._intake`.
- **Storage (progress photos / training screenshots):** bucket `client-media`.
  - Coach photos: `client-photos/<partner_id>/<client_id>/<uuid>-<file>`
  - Training screenshots: `training-screenshots/<partner_id>/<client_id>/<uuid>-<file>`
  - `(storage.foldername(name))[1]`=subtree, `[2]`=partner_id, `[3]`=client_id.
  - **Migration 003** grants clients write to `training-screenshots`; **migration 007** (NOW APPLIED on prod) grants clients write to `client-photos`. Patients upload via their own JWT (`createSupabaseBrowser()`), RLS-scoped to their folder.
- **Testing (vitest env = "node", no jsdom/RTL):**
  - Render components with `renderToStaticMarkup` (react-dom/server) + `createElement`; assert on the HTML string. Effects DON'T run in SSR — so keep `createSupabaseBrowser()`/tRPC hooks OUT of render paths (use dynamic `import()` inside handlers/effects).
  - Test logic as **pure exported helpers** with injectable deps (mock with `vi.fn`). `noUncheckedIndexedAccess` is ON → guard `arr[0]?.x` and use named consts, not `arr[0].x`.
  - Mocked-caller router tests: `vi.mock("server-only")` + `vi.mock("next/headers")` + chainable fake supabase + `router.createCaller({…} as never)`; UUID inputs need valid UUID constants.
- **`<img>` convention:** prefer next/image, but `<img>` is allowed with `// eslint-disable-next-line @next/next/no-img-element` (it's a warning, not a build error).
- **tRPC `useUtils()` gotcha:** the utils proxy collides with the `client` router name → `utils.portal.x` fails to typecheck. Use `someQuery.refetch()` instead of `utils.*.invalidate()`.
- **Plan review page** (`src/app/(dashboard)/plans/[id]/review/page.tsx`, ~1900 lines) already owns `createVersionMutation` (#24 regenerate flow) + `buildCreateVersionInput(planId, reason)` — reuse these for any "regenerate" affordance.

---

## 6. Current state (as of this handoff)

- **`fork/main` HEAD:** `17f6f59` — "Merge pull request #38 from agentarmy72-del/feat/training-time-portal-pdf".
- **Local branch:** `feat/plan-update-banner` (PR #39's branch; local `main` may be behind — `git fetch fork main:main` to sync).
- **Recently MERGED & live (this terminal's lineage):**
  - PR #36 — patient progress-photo **gallery (display)** → `08aac2d` (Vercel success).
  - PR #35 — #25 plan-update **heuristic backend** (`scanPlanUpdateHeuristics`, emits `plan_update_suggested`) → `4e7e7ef`.
  - PR #37 — patient progress-photo **upload** (migration 007 live) → `191acf0` (Vercel success, end-to-end live).
  - PR #38 — #18 training-time **portal + PDF** timed peri-workout box → `17f6f59` (merged by a sibling terminal).
- **OPEN — mine, awaiting merge authorization:**
  - **PR #39** — "feat(#25): surface plan-update-suggested to the coach (UI)". Branch `feat/plan-update-banner`, commit `b8e7155`. **MERGEABLE / CLEAN.** 5 UI files. tsc 0 · vitest 775/775 · build OK. **Do NOT merge without explicit authorization.**
- **OPEN — NOT mine (leave alone unless told):** PR #31 "chore(scripts): reusable seeder for TEST patient portal access" (`chore/seed-test-patients`).

---

## 7. Open follow-ups (noted in PRs; build only when dispatched)

- **#25 pre-seed:** PR #39's regenerate button triggers a *plain* `createVersion`. Pre-seeding the suggested **−8.5% kcal** into the new version's `macroOverrides` is a backend-lane follow-up. Optionally mark the `plan_update_suggested` notification read after acting.
- **#18 intraday distribution (Stage B):** a latent `MealPlanConfig.distribution` override hook exists but is unused (dead) — a future intraday-distribution override can wire it.
- **Patient-portal tables pending Roberto spec:** appointments, symptom_log, fight-week (migrations drafted, NOT applied).
- **Migration 007 hand-off file** (standalone, not in repo): `~/Downloads/007_client_photos_client_write_FOR_JAMES.sql` — already applied on prod, kept for reference.

---

## 8. This session's work printout (verbatim reports)

### PR #36 — Patient progress-photo gallery (display) — MERGED ✅
- Mergeable/CLEAN, base == HEAD, no rebase. Merged via merge commit → main HEAD `08aac2d`.
- Vercel: **success** (`AFjvVqa8S8vMQW6iDkwDTRVjv2wV`), ~40s, no re-trigger.
- UI-only, 3 files (+287). tsc 0 · vitest 742/742 · build OK. Upload stayed gated (`PHOTO_UPLOAD_ENABLED=false`).

### PR #37 — Patient photo upload (migration 007) — MERGED & LIVE ✅
- Branched from new fork/main `4e7e7ef` (PR #35 had merged on top of #36; GUARD passed — gallery+flag in ancestry).
- Flipped `PHOTO_UPLOAD_ENABLED=true`; added pure `uploadProgressPhotos` orchestrator + `ProgressPhotoUploader` (front/side/back, `accept="image/*"` phone camera, uploads to `client-media` `client-photos/<pid>/<cid>/` via patient JWT mirroring `ScreenshotUploader`, persists paths via `portal.addSnapshot`); removed gated pill; graceful non-throwing errors + 10 MB guard. Page wires `partnerId`/`clientId` from `getMyProfile` + `addSnapshot` + `getSnapshots` refetch.
- 3 UI files (+480/−37). tsc 0 · vitest 762/762 · build OK. Commit `5bed8f9`.
- Merged via merge commit → main HEAD `191acf0`. Vercel: **success** (`FiLnqracuGfHcVb1zrViT2HmErJZ`), ~45s. **Patient photo path live end-to-end.**

### PR #39 — Surface plan-update-suggested to the coach (UI) — OPEN (not merged) ⏳
- GUARD: `plan_update_suggested` trigger + `scanPlanUpdateHeuristics` confirmed live (PR #35). Branched `feat/plan-update-banner` from fork/main `191acf0`.
- (1) `notifications-panel.tsx` `TRIGGER_META` += `plan_update_suggested` (📋 "Aggiornamento piano suggerito").
- (2) New `src/components/plan/plan-update-banner.tsx`: pure `findPlanUpdateSuggestion` (unread + `metadata.planId` match) / `formatKcalReductionPct` / `suggestedNextVersionLabel` + `PlanUpdateBanner` (returns null when no suggestion).
- (3) Review page queries `notification.list({trigger, unreadOnly})`, matches planId, renders the banner at top wired to the existing `createVersionMutation` via `buildCreateVersionInput(planId, reason)`. No match → no banner. Pre-seed of −8.5% noted as follow-up.
- 5 UI files (+45, 2 new). tsc 0 · vitest 775/775 · build OK. Commit `b8e7155`.
- **PR #39 MERGEABLE/CLEAN**, base pinned `agentarmy72-del` main, no Co-Authored-By. **STOPPED — awaiting merge authorization.**

---

## 9. Handoff prompt (paste into the new terminal)

> **Roberto Scrigna platform — resume from handoff.** Read the handoff context first: `/Users/liamcann/roberto-scrigna-platform/HANDOFF-CONTEXT.md` (it has the standing constraints, workflow recipe, architecture cheat-sheet, current PR state, and follow-ups). Then run these **READ-ONLY re-orientation steps** and report before doing any work:
> 1. `cd /Users/liamcann/roberto-scrigna-platform && git remote -v` — confirm `fork` = agentarmy72-del (deployed target), `origin` = BA-AI-JM (stale, never a target).
> 2. `gh auth status` — confirm Active account = **agentarmy72-del** (switch if not).
> 3. `git fetch fork && git log --oneline -6 fork/main` — report current `fork/main` HEAD.
> 4. `gh pr list --repo agentarmy72-del/roberto-scrigna-platform --state open` — report open PRs; confirm **PR #39 (feat/plan-update-banner)** state/mergeable.
> 5. State that you will follow the standing constraints (push/PR to `fork` only · base pinned `agentarmy72-del` main · NO Co-Authored-By · do NOT merge without explicit authorization · stay in the named lane · no migrations unless told).
>
> Then **await the specific increment instruction** (or the explicit authorization to merge PR #39). Do not start feature work or merge anything until dispatched.

---
*End of handoff. This file is a local untracked artifact — do not commit it as part of a feature PR.*
