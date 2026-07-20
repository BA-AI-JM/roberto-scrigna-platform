# TASK: T1.2 — migration governance (register G3+G32)
Build lane. Read docs/polish/PLAN-OF-RECORD.md §T1.2 + register G3/G32 first. Branch polish/audit-arc-2026-07 — NEVER switch/pull/reset.

## Context (verified facts)
`supabase/migrate.ts` calls `supabase.rpc("exec_sql")` — a function that exists in NO migration (the runner has never worked). DEPLOYMENT-GUIDE.md §2.2 (:78-89) instructs applying ONLY 001. Migrations 001–017 exist; several later ones were hand-applied to environments selectively (local drift was runtime-proven: 006 columns missing while 009-015 tables existed). Local supabase runs in Docker; `supabase db reset` applies migrations/ in order — but the PROD project is hosted where only the SQL editor / CLI-link (unavailable from this machine) applies.

## Deliverable
1. NEW migration `supabase/migrations/018_migration_ledger.sql`: idempotent `schema_migrations_applied` table (filename PK, checksum TEXT, applied_at, applied_by TEXT) + RLS enabled with a service-role-only policy (deny anon/authenticated) + backfill INSERTs for 001–017 marked applied_by='backfill-2026-07-20' (checksum nullable for backfill).
2. REWRITE `supabase/migrate.ts` as an honest runner:
   - Connects with SUPABASE_SERVICE_ROLE_KEY? NO — service key cannot run DDL via PostgREST. Instead: use a direct Postgres connection string env `SUPABASE_DB_URL` (document: local = postgresql://postgres:postgres@127.0.0.1:54322/postgres; prod = the dashboard's connection string, operator-supplied at runtime, NEVER committed) via the `postgres`/`pg` client — CHECK package.json first: if no pg client dependency exists, DO NOT install; instead implement via `psql` subprocess if available, and if neither is viable, write the runner as a generator of a single idempotent `apply-pending.sql` bundle (ledger-aware: wraps each pending file in a ledger-guard DO block) that an operator pastes into the SQL editor. Choose the strongest option that needs NO new dependency; document the choice at the top of the file.
   - Behavior: list migrations dir → diff against ledger → apply/emit only pending, in order, each recorded with checksum (sha256 via node:crypto).
   - `--dry-run` prints the pending list; `--verify` compares ledger vs dir and exits nonzero on drift.
3. REWRITE DEPLOYMENT-GUIDE.md §2.2 "Run the Database Migration": full 001–018 story, fresh-DB path, existing-DB delta path (the current prod case: apply 006–017 + 018), verification queries (information_schema spot-checks for one landmark object per migration), backup-first instruction, and the checksum/ledger explanation.
4. NEW test `src/__tests__/migration-runner.test.ts`: pure logic tests for the pending-diff + guard-bundle generation (mock fs; no DB needed).

## Acceptance
- `bun run supabase/migrate.ts --dry-run` runs without throwing on this machine and lists pending correctly against the LOCAL ledger state (after 018 applied locally by dry-run instructions — do NOT apply anything yourself; --dry-run only).
- `bunx tsc --noEmit` clean for your files; `bunx vitest run` whole suite green.
- DEPLOYMENT-GUIDE.md §2.2 no longer mentions exec_sql or 001-only.
- Final message: files + the --dry-run output ONLY.

## Fence
Touch ONLY: supabase/migrate.ts, supabase/migrations/018_migration_ledger.sql (new), DEPLOYMENT-GUIDE.md §2.2 region, src/__tests__/migration-runner.test.ts (new). NO installs, NO applying migrations, NO db resets, no git, no other files. Blocked → docs/polish/lanes/T12-BLOCKED.md and stop.
