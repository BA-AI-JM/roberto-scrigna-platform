# Roberto Scrigna Platform

A practice operating system for one Italian sports nutritionist and his athletes:
**intake → snapshot → plan → delivery → check-in → adjustment → invoice**, with a
clinical calculation engine (BMR/TDEE, macro targets, per-ingredient meal-plan solver)
as its crown jewel.

Two surfaces over one Postgres:

- **Coach app** — client management, intake wizard, plan generation & review, monitoring,
  invoicing, documents, tasks, guidance blocks.
- **Athlete portal** — today's plan, weight/adherence trends, weekly check-ins, food diary,
  signatures, notifications.

Canonical intent lives in [`NORTHSTAR.md`](./NORTHSTAR.md); the active work plan in
[`docs/polish/PLAN-OF-RECORD.md`](./docs/polish/PLAN-OF-RECORD.md).

> Not multi-tenant SaaS, not an engagement app, not an AI nutritionist — no model ever
> authors or alters a clinical value. See NORTHSTAR for the falsifiable anti-goals.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, RSC) · React 19 |
| API | tRPC 11 (public / protected / client procedures) · superjson |
| Data | Supabase — Postgres + Auth + Storage; RLS on every table, service-role on server paths |
| Jobs | Inngest (reminders, delivery reconciler) |
| Email | Resend |
| PDF | `@sparticuz/chromium-min` + puppeteer-core |
| UI | Tailwind CSS 4 · Radix · lucide |
| Runtime/PM | **Bun** |
| Tests | Vitest (unit) · Bun test (live tier) · Playwright (browser e2e) |

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Supabase CLI](https://supabase.com/docs/guides/cli) + Docker (for the local stack)
- Node (only for the occasional `npx` tool)

## Setup

```bash
git clone <repo> && cd roberto-scrigna-platform
bun install

# Environment — copy the template and fill in local Supabase keys (from `supabase status`)
cp .env.local.example .env.local

# Start the local Supabase stack (Postgres :54322, API :54321, Studio :54323, Mailpit :54324)
supabase start

# Apply all migrations + load seed data (supabase/seed.sql)
supabase db reset

# Run the app. Default dev port is 3000; use 3001 if 3000 is taken
# (the live test tier targets :3001).
bun run dev --port 3001
```

`supabase status` prints the local `API URL`, `anon key`, and `service_role key` — paste them
into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`). Set `NEXT_PUBLIC_APP_URL` to your dev URL (e.g.
`http://localhost:3001`). Boot-time env is validated by `src/env.ts` — missing/invalid vars
fail fast with a named list rather than a silent runtime death.

## Verify triad

```bash
bun run typecheck   # tsc --noEmit
bun run test        # vitest run  (unit tier, 1000+ tests, no external services)
bun run verify      # typecheck + test  ← run this before every commit
```

CI (`.github/workflows/ci.yml`) runs the same three gates (typecheck · unit · build) on push
and PR. The unit tier needs no services: `vitest` runs under `NODE_ENV=test`, and `src/env.ts`
supplies placeholder Supabase env in that mode.

## Migrations

SQL migrations live in `supabase/migrations/` and are governed by an applied-ledger
(`schema_migrations_applied`, bootstrapped by `018_migration_ledger.sql`). The runner is
idempotent — each migration is wrapped so it is skipped once ledgered.

```bash
bun run supabase/migrate.ts --dry-run   # list pending migrations, apply nothing
bun run supabase/migrate.ts --verify    # verify ledger vs files (checksums)
bun run supabase/migrate.ts --output apply-pending.sql   # emit a paste-ready bundle
```

For a from-zero local DB, `supabase db reset` applies every migration then loads
`supabase/seed.sql`. Production migrations are operator-executed (SQL editor), never auto-run.

## Test tiers

| Tier | Command | What it exercises | Services |
|---|---|---|---|
| **Unit** | `bun run test` | engine, routers (mocked DB), pure logic — the fast gate | none |
| **Live** | `bun run test:live` | `e2e-live/*.live.test.ts` — real Supabase + real tRPC over HTTP; seeds & cleans its own rows | Supabase local + dev server on `:3001` |
| **Browser e2e** | Playwright (`e2e/`, harness in `docs/polish/baseline-sweep/`) | full-page journeys incl. authenticated portal render | Supabase local + dev server |

The **live tier skips cleanly** when the dev server is down (it probes `:3001/login` first), so
it is safe to run anywhere but only meaningful with the stack up. It is a manual/opt-in CI job
(`workflow_dispatch` → `run_live=true`), not part of the default push/PR gate — see the comment
in `.github/workflows/ci.yml`.

## Layout

```
src/
  app/                 Next.js routes (coach app + /portal/* athlete portal)
  server/routers/      tRPC routers (plan, portal, checkin, dashboard, …)
  engine/              clinical calc engine (energy, macros, meal-plan solver)
  lib/                 supabase clients, inngest, trpc wiring, rate limiting
  data/                food DB, meal templates, supplement library
supabase/migrations/   ordered SQL migrations + applied-ledger runner
e2e-live/              live-tier specs (bun test)
docs/polish/           audit registers, plan of record, verification lanes
```
