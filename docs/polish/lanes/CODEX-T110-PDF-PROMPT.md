# TASK: T1.10 — PDF Chromium supply pinning (register G13)
Build lane. Read docs/polish/PLAN-OF-RECORD.md §T1.10 + register G13 first. Branch polish/audit-arc-2026-07 — NEVER switch/pull/reset.

## Context (verified facts)
`src/pdf/chromium-launcher.ts` downloads the Chromium pack at runtime from a default GitHub release URL (`@sparticuz/chromium-min` 147.0.2). Failure modes: GitHub egress blocked/slow/removed → all 3 PDF renderers die at runtime. Local dev: CHROMIUM_PATH points at real Chrome; first render can exceed 30s. DEPLOYMENT-GUIDE.md:454-477 documents the WRONG package (@sparticuz/chromium, bundled).

## Deliverable
1. Edit `src/pdf/chromium-launcher.ts`:
   - Honor `CHROMIUM_PACK_URL` env override (already semi-supported? verify) with the default as fallback; log WHICH source is used (one structured console line, no secrets).
   - Version-pin guard: assert the pack URL contains the installed chromium-min version string (read from a constant, NOT package.json import if that breaks bundling — hardcode "147.0.2" with a comment to update in lockstep) — mismatched pack → clear thrown error naming both versions (today: silent protocol mismatch).
   - Launch timeout + one retry with backoff for the download/launch step; failure throws a distinct `PdfDependencyError`-style message so route handlers can 503 with a clear body instead of generic 500.
2. Edit the 3 route handlers ONLY at their catch sites if needed to surface the distinct dependency error as 503 "Servizio PDF temporaneamente non disponibile" (grep: src/app/api/pdf/[planId]/route.ts, src/app/api/invoice/[id]/, letter route — find exact paths).
3. Rewrite DEPLOYMENT-GUIDE.md §Chromium (the :454-477 region): correct package name, CHROMIUM_PACK_URL mirroring instructions (upload pack to owned storage, set env), local CHROMIUM_PATH note incl. >30s first-render warning.
4. NEW test `src/pdf/__tests__/chromium-supply.test.ts`: env override respected; version-mismatch URL → throws naming versions. Pure unit (mock fetch/launch).

## Acceptance
- `bunx tsc --noEmit` clean for your files; `bunx vitest run` whole suite green incl. your new test.
- `grep -n "CHROMIUM_PACK_URL" src/pdf/chromium-launcher.ts DEPLOYMENT-GUIDE.md` shows both wired.
- Final message: files + test summary ONLY.

## Fence
Touch ONLY: src/pdf/chromium-launcher.ts, src/pdf/__tests__/chromium-supply.test.ts (new), the ≤3 PDF route handler catch blocks, DEPLOYMENT-GUIDE.md Chromium section. NOTHING else. No installs, no restarts, no git, no network beyond reading repo. Blocked → docs/polish/lanes/T110-BLOCKED.md and stop.
