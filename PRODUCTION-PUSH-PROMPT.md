# Prompt: Roberto Scrigna — Schema Reconciliation & Production Push

## Context

You are working on `~/projects/roberto-scrigna/`, a Next.js 16 nutrition platform for Roberto Scrigna. The calculation engine (320 tests), UI, and tRPC routers are complete. But the Supabase migration (`001_initial_schema.sql`) was written early in the build and the tRPC routers evolved past it. **The schema and code are out of sync.** Every DB operation on `checkin`, `notification`, and `notification_settings` will fail.

Read `PRODUCTION-READINESS.md` in the project root for the full mismatch audit.

## What to Do

### 1. Rewrite the migration to match the code

The tRPC routers represent the desired schema. The migration is the draft. Replace `supabase/migrations/001_initial_schema.sql` with a corrected version.

**Methodology:** For each tRPC router in `src/server/routers/`, read every `.from("table")` call and every column it selects/inserts/updates. Build the CREATE TABLE from that. Cross-reference the original migration for columns that are correct and keep them.

**Key tables to fix:**

| Table | Primary source of truth for columns |
|-------|-------------------------------------|
| `check_in` → rename to `checkin` OR update all code to use `check_in` | `src/server/routers/checkin.ts` |
| `notification` | `src/server/routers/notification.ts` + `src/lib/inngest/functions.ts` |
| `notification_settings` (NEW) | `src/server/routers/notification.ts` getSettings/updateSettings |
| `document` (fix `documents` references) | `src/server/routers/document.ts` |

Also check: does the portal router (`src/server/routers/portal.ts`) reference any columns that don't exist? It uses `check_in` and `check_in_token` — reconcile these.

**Convention decision:** Use `check_in` (with underscore) as the table name since that's what the portal router already uses. Update the checkin router, dashboard router, and Inngest functions to use `check_in` instead of `checkin`.

### 2. Fix table name references in code

After deciding on `check_in` as the canonical name, find-and-replace in:
- `src/server/routers/checkin.ts` — all `.from("checkin")` → `.from("check_in")`
- `src/server/routers/dashboard.ts` — all `.from("checkin")` → `.from("check_in")`
- `src/lib/inngest/functions.ts` — all `.from("checkin")` → `.from("check_in")`
- `src/server/routers/document.ts` — fix `.from("documents")` → `.from("document")`

### 3. Verify TypeScript still compiles

```bash
npx tsc --noEmit
```

### 4. Verify all 320 tests still pass

```bash
npx vitest run
```

The engine tests don't touch the database, so they should be unaffected.

### 5. Test against local Supabase

```bash
cd ~/projects/roberto-scrigna
supabase stop  # clean slate
supabase start
supabase db reset  # applies migration
bash scripts/seed-local.sh
bun run dev
```

Then manually verify in the browser:
1. Login as `roberto@test.com` / `testpass123`
2. Dashboard loads with sidebar, KPI cards show zeros
3. Create a new client via intake form (all 7 pages)
4. Navigate to Clienti & Piani → client appears
5. Generate a plan → engine runs, plan appears in review
6. Download PDF → opens with client data
7. Create an invoice → appears in invoice list
8. Navigate to Monitoraggio → check-in list renders

### 6. Run Playwright E2E tests

```bash
npx playwright test
```

All 27 existing tests should still pass. If any new tests are needed for the wired flows, add them to `e2e/`.

### 7. Commit and push

```bash
git add -A
git commit -m "fix: reconcile database schema with tRPC routers

Rewrote migration to match actual column usage in checkin, notification,
and document routers. Added notification_settings table. Standardised
table name to check_in across all code."
git push
```

### 8. Deployment checklist

For Roberto to test on a real URL:

- [ ] Create Supabase project (supabase.com) — copy URL + anon key + service role key
- [ ] Apply migration to production Supabase
- [ ] Create Roberto's auth user in Supabase dashboard
- [ ] Deploy to Vercel — connect GitHub repo, set env vars from `.env.local.example`
- [ ] Verify login works on production URL
- [ ] Share URL + credentials with Roberto

**Optional but recommended:**
- [ ] Inngest cloud account — connect to Vercel deployment for background jobs
- [ ] Resend domain — verify a sending domain for check-in emails
- [ ] Anthropic API key — enable AI narrative generation

## Critical Rules

1. **Do not modify the engine** (`src/engine/`). It's tested and verified.
2. **Do not modify the tRPC router logic** — only fix table/column names to match the new migration.
3. **The migration is the thing that changes, not the code** (except table name references).
4. **Run tests after every change.** 320 Vitest + 27 Playwright must stay green.
5. **All code in `src/`.** Dashboard pages in `src/app/(dashboard)/`.

## Files to Read Before Starting

| File | Why |
|------|-----|
| `PRODUCTION-READINESS.md` | Full mismatch audit with column-by-column comparison |
| `supabase/migrations/001_initial_schema.sql` | Current (incorrect) migration |
| `src/server/routers/checkin.ts` | What the check-in schema should look like |
| `src/server/routers/notification.ts` | What notification + notification_settings should look like |
| `src/server/routers/portal.ts` | Uses `check_in` and `check_in_token` — needs reconciliation |
| `src/server/routers/document.ts` | Has `documents` typo |
| `src/server/routers/dashboard.ts` | Uses `checkin` — needs fix |
| `src/lib/inngest/functions.ts` | Uses `checkin` — needs fix |
