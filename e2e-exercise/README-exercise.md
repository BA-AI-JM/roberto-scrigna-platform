# Authenticated coach exercise pass (local Supabase)

Supplement to `e2e/exercise-pass.spec.ts` (which exercises the unauth/guarded surface
against a live instance). This harness establishes a **real coach session** headlessly
against a **local Supabase** and meta-prompts the DOM to drive every interactive element
on the authenticated coach surface — catching interaction crashes, error boundaries, 5xx,
and unhandled JS errors that only appear once you're logged in.

## Requirements

- Local Supabase running + migrated + seeded with the project's e2e account
  (`roberto@test.com` / `testpass123`, a partner, and ≥1 client). `supabase status` should
  show it up; `supabase db reset` (+ the seed) recreates it.
- Node/bun + `@playwright/test`.

## Run

```bash
# 1. capture the local Supabase env (URL + keys) into e2e-exercise/.localenv:
{
  echo 'export NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"'
  echo 'export SUPABASE_URL="http://127.0.0.1:54321"'
  echo "export NEXT_PUBLIC_SUPABASE_ANON_KEY=\"$(supabase status -o env | grep '^ANON_KEY' | cut -d'\"' -f2)\""
  echo "export SUPABASE_SERVICE_ROLE_KEY=\"$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'\"' -f2)\""
} > e2e-exercise/.localenv

# 2. run — the shell env overrides .env.local so `bun run dev` points at local Supabase:
source e2e-exercise/.localenv
bunx playwright test --config playwright.exercise-local.config.ts
```

Findings are written to `e2e-exercise/findings.json` (grouped high/med/low). The run never
fails on findings — it is discovery. `.localenv`, `.auth.json`, and `findings.json` are
gitignored (env / session / output).

## Notes

- Native Italian UI — no page translation (Chrome auto-translate triggers a `NotFoundError`
  React reconciliation crash that is not an app bug).
- Errors on `/**/lettera` and `/monitoring/notifications` are tagged `[local-schema]` when
  the local DB is behind on migrations (009 legal / 012 reminders) — environment noise,
  re-verify on a current-schema DB or the deployed app.
