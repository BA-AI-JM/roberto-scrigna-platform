# TASK: T1.4 — env schema, fail-fast boot (register G4)
You are a build lane. Read docs/polish/PLAN-OF-RECORD.md §T1.4 + NORTHSTAR.md first. Branch is polish/audit-arc-2026-07 — NEVER switch/pull/reset.

## Deliverable
1. NEW file `src/env.ts`: a zod-validated, server-only env module. Groups:
   - REQUIRED always: NEXT_PUBLIC_SUPABASE_URL (url), NEXT_PUBLIC_SUPABASE_ANON_KEY (min length), SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_APP_URL (url).
   - REQUIRED in production only (warn-and-degrade elsewhere): RESEND_API_KEY, RESEND_FROM_EMAIL, INNGEST_EVENT_KEY, INNGEST_SIGNING_KEY.
   - OPTIONAL with VISIBLE degradation (export a `capabilities` object, e.g. {ocr:false, pdfLocal:false}): ANTHROPIC_API_KEY, CHROMIUM_PATH, CHROMIUM_PACK_URL.
   Behavior: parse once at import; in production a missing REQUIRED var throws at BOOT with a message listing ALL missing names (never values); in dev it throws for the always-required group too (the login-dies-silently bug G4 was runtime-proven). Export typed `env` + `capabilities`.
2. Wire it: `src/lib/supabase/server.ts`, `client.ts`, `service.ts`, `middleware.ts` — replace `process.env.X!` non-null assertions with imports from `src/env`. Client-side file (client.ts) may only import the NEXT_PUBLIC values — keep server-only secrets out of any file bundled client-side (use a separate `src/env.client.ts` if needed for the browser factory; zod-validate there too).
3. NEW test `src/__tests__/env-schema.test.ts`: missing required var → throws listing the name; optional missing → capabilities flag false, no throw. Use vi.stubEnv / import-fresh pattern.

## Acceptance (a third party runs)
- `bunx tsc --noEmit` clean for YOUR files.
- `bunx vitest run src/__tests__/env-schema.test.ts` green.
- `bunx vitest run` whole suite still green.
- `grep -rn "process.env" src/lib/supabase/` returns ZERO non-env-module reads.
- Final message: files changed + test output summary ONLY.

## Fence (two other lanes + a second terminal work in this tree)
Touch ONLY: src/env.ts (new), src/env.client.ts (optional new), src/lib/supabase/*.ts, src/__tests__/env-schema.test.ts (new). NOTHING else — not package.json, not next.config, not other routers. No installs, no dev-server/supabase restarts, no git commands, no pushes. If a needed change falls outside the fence, WRITE the proposal to docs/polish/lanes/T14-BLOCKED.md and stop.
