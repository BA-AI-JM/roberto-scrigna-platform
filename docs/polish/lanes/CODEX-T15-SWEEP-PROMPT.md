# TASK: T1.5 — error-class discrimination sweep (register G31)
Build lane. Branch polish/audit-arc-2026-07 — never switch/pull/reset. Read PLAN-OF-RECORD §T1.5 + register G31 first.

## Context (runtime-proven)
The pattern `if (error || !data) throw NOT_FOUND` conflates real DB errors (42703 column-missing produced "Piano non trovato" to a coach) with absence. PGRST116 = zero rows (true not-found); anything else = real error → must surface as INTERNAL_SERVER_ERROR (message generic Italian, code logged).

## Deliverable
1. NEW helper `src/server/db-errors.ts`: `isNoRows(error): boolean` (PGRST116 check) + `throwDiscriminated(error, notFoundMsg, ctxLabel)` — logs code+message via console.error("[ctxLabel]", error.code, error.message) then throws NOT_FOUND only for no-rows, else INTERNAL_SERVER_ERROR "Errore imprevisto. Riprova tra poco.".
2. Sweep these routers ONLY: auth, checkin, client, dashboard, document, feedback, guidance, invoice, legal, notification, practice-profile (find exact filename), signature, task, training-log — every `.single()`/`.maybeSingle()` consumer using the conflation pattern converts to the helper. Preserve each site's existing not-found message text EXACTLY.
3. EXCLUDED (another lane owns them): plan.ts, portal.ts, gdpr.ts, _app.ts. Do not touch.
4. NEW test `src/server/__tests__/db-errors.test.ts`: PGRST116 → NOT_FOUND with the site message; other code → INTERNAL_SERVER_ERROR; log line contains the code.

## Acceptance
- `grep -rn "error || !" src/server/routers/ --include="*.ts" | grep -v __tests__ | grep -vE "plan.ts|portal.ts|gdpr.ts"` → 0 remaining conflations in your scope (or each remainder justified in the final message).
- tsc clean for your files; FULL suite green (existing router tests assert NOT_FOUND paths — those must still pass: mocks usually return {data:null,error:null} → !data → your helper must ALSO treat data-null-error-null as no-rows/NOT_FOUND).
- Final message: files + remaining-conflation count + test summary ONLY.

## Fence
Touch ONLY: src/server/db-errors.ts (new), the 14 routers listed, src/server/__tests__/db-errors.test.ts (new). No migrations, no pages, no package.json, no installs/restarts/git-branch-ops. Blocked → docs/polish/lanes/T15-BLOCKED.md.
