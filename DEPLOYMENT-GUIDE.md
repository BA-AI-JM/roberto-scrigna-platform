# Deployment Guide — Roberto Scrigna Nutrition Platform

This document covers a complete production deployment to Vercel (frontend + API) and
Supabase Cloud (database + auth). Follow every section in order. Do not skip the
post-deployment checklist.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Supabase Cloud Setup](#2-supabase-cloud-setup)
3. [Inngest Setup](#3-inngest-setup)
4. [Resend Setup](#4-resend-setup)
5. [Vercel Deployment](#5-vercel-deployment)
6. [Post-Deployment Verification Checklist](#6-post-deployment-verification-checklist)
7. [Environment Variables Reference](#7-environment-variables-reference)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Prerequisites

### Accounts Required

| Service | URL | Purpose |
|---------|-----|---------|
| Supabase | https://supabase.com | PostgreSQL database, auth, and storage |
| Vercel | https://vercel.com | Next.js hosting and serverless functions |
| Inngest | https://inngest.com | Background job queue (12 notification workflows) |
| Resend | https://resend.com | Transactional email delivery |

### Plan Requirements

**Supabase:** The free tier (500 MB database, 50 MB file storage, 50,000 MAU) is
sufficient for initial deployment. Upgrade to Pro if the client base grows or if you
need daily backups and point-in-time recovery.

**Vercel:** The Hobby tier has a 10-second serverless function timeout. This platform
generates PDFs using `@sparticuz/chromium`, which routinely takes 10-25 seconds.
**You must use Vercel Pro** (or higher) to configure the 60-second max duration on the
PDF generation route. Without Pro, PDF downloads will time out.

**Inngest:** The free tier (50,000 function runs/month) covers typical single-coach
usage. No credit card required to start.

**Resend:** The free tier (3,000 emails/month, 100/day) is sufficient for a single
coach. The free tier restricts sending to verified domains only — the Resend onboarding
address (`onboarding@resend.dev`) does not work for production. You must verify a
domain.

### API Keys to Gather Before Starting

You will collect these as you work through each section:

- Supabase project URL
- Supabase anon key (public)
- Supabase service role key (secret — never expose client-side)
- Inngest event key
- Inngest signing key
- Resend API key
- Resend verified FROM email address
- The production Vercel URL (available after first deploy)

---

## 2. Supabase Cloud Setup

### 2.1 Create the Project

1. Log in at https://app.supabase.com and click **New project**.
2. Choose your organisation, set a project name (e.g. `roberto-scrigna-prod`), and
   select the region closest to your expected users.
3. Generate a strong database password and save it somewhere safe — you will not need
   it again unless you connect via direct Postgres, but losing it is inconvenient.
4. Click **Create new project** and wait ~2 minutes for provisioning.

### 2.2 Run the Database Migration

There are 18 ordered migrations, `001_initial_schema.sql` through
`018_migration_ledger.sql`. **Back up the database before every migration run.** In
Supabase, use **Database > Backups** and confirm that a restorable backup exists.
Never continue past a SQL error: preserve the output and restore before retrying if
the failed file was not transactional.

The repository runner is deliberately a SQL-bundle generator. This project has no
direct Postgres client dependency and a service-role key cannot run DDL through the
Data API. It may use the service role only to read the protected ledger, then writes
`supabase/apply-pending.sql` for an operator to inspect and paste into **SQL Editor**.
Each migration is wrapped in an atomic ledger guard and is recorded by filename with
a SHA-256 checksum after success.

`SUPABASE_DB_URL` is reserved for a future direct-client/`psql` runner. For local
Supabase it is `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; for
production it is the dashboard connection string supplied by the operator at runtime.
Never commit that URL or its password.

#### Fresh database

- Local development: `supabase db reset` applies every file in
  `supabase/migrations/` in order. This is destructive; use it only for a disposable
  local database, never for production.
- Fresh hosted project: configure `NEXT_PUBLIC_SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY` for that project, run
  `bun run supabase/migrate.ts --dry-run`, then run
  `bun run supabase/migrate.ts`. Review `supabase/apply-pending.sql`, paste the whole
  bundle into SQL Editor, and run it once. Finally rerun `--dry-run`; it must report
  no pending migrations.

The generated bundle bootstraps an empty ledger before guarding migration 001.
Migration 018 remains the source of record for the table, its RLS policy, and the
001–017 backfill.

#### Existing production database (current delta)

Production already has 001–005 but has no trustworthy migration history. After the
backup, use the verification query below to confirm the 001–005 landmarks. In SQL
Editor, apply these repository files individually and in this exact order:

```text
006_plan_versioning_and_feedback.sql
007_placeholder_skipped.sql
008_plan_update_suggested_trigger.sql
009_legal_documents.sql
010_signature_requests.sql
011_snapshot_edit_audit.sql
012_reminder_settings.sql
013_urgent_feedback.sql
014_session_kcal_override.sql
015_partner_practice_profile.sql
016_invoice_number_per_partner.sql
017_checkin_token_rpc.sql
018_migration_ledger.sql
```

Migration 007 is an intentional no-op placeholder. Apply 018 last: its backfill marks
001–017 as `applied_by = 'backfill-2026-07-20'` with a nullable checksum because the
exact historical file bytes cannot be proven. A null checksum means “accepted
historical baseline,” not checksum drift. Migrations applied by the runner thereafter
carry their SHA-256 checksum; changing or deleting one of those files makes
`bun run supabase/migrate.ts --verify` exit nonzero. Verification also exits nonzero
when a repository migration is pending.

#### Verify one landmark per migration

Run this after either path. Every row must return `true`; 007 is verified by its
ledger entry because it intentionally creates no schema object.

```sql
SELECT * FROM (VALUES
  ('001', to_regclass('public.partner') IS NOT NULL),
  ('002', EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'client-media')),
  ('003', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'client_media_client_training_write')),
  ('004', NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid WHERE r.relname = 'training_log' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%session_type%')),
  ('005', NOT EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_class r ON r.oid = c.conrelid WHERE r.relname = 'training_log' AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%exercise_method%')),
  ('006', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'plan' AND column_name = 'parent_plan_id')),
  ('007', EXISTS (SELECT 1 FROM schema_migrations_applied WHERE filename = '007_placeholder_skipped.sql')),
  ('008', EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_trigger_check' AND pg_get_constraintdef(oid) ILIKE '%plan_update_suggested%')),
  ('009', to_regclass('public.legal_document') IS NOT NULL),
  ('010', to_regclass('public.signature_request') IS NOT NULL),
  ('011', to_regclass('public.snapshot_edit_audit') IS NOT NULL),
  ('012', to_regclass('public.client_reminder_settings') IS NOT NULL),
  ('013', to_regclass('public.urgent_feedback') IS NOT NULL),
  ('014', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'training_log' AND column_name = 'kcal_override')),
  ('015', to_regclass('public.partner_practice_profile') IS NOT NULL),
  ('016', to_regclass('public.idx_invoice_number_partner') IS NOT NULL),
  ('017', to_regprocedure('public.checkin_validate_token(uuid)') IS NOT NULL),
  ('018', EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'schema_migrations_applied'))
) AS migration_landmarks(migration, present)
ORDER BY migration;
```

Then run `bun run supabase/migrate.ts --verify` using the target project's URL and
service-role key. Do not expose the key in shell history, logs, or client-side code.

### 2.3 Create Roberto's Auth User

1. Go to **Authentication > Users** in the sidebar.
2. Click **Invite user** (or **Add user** > **Create new user**).
3. Enter Roberto's email address and a temporary password.
4. Click **Create user**.
5. Copy the **User UID** from the user list — you will need it in the next step.

Alternatively, you can create the user programmatically via the SQL Editor:

```sql
-- Only use this if the UI invite flow is not available.
-- Replace the values before running.
SELECT auth.create_user(
  uid := gen_random_uuid(),
  email := 'roberto@yourdomain.com',
  password := 'TemporaryPassword123!',
  email_confirm := true
);
```

Note the `id` returned by this query — it is Roberto's `auth_user_id`.

### 2.4 Create Roberto's Partner Record

Run this in the SQL Editor. Replace `<AUTH_USER_ID>` with the UUID from the previous
step, and update the name and email fields.

```sql
INSERT INTO partner (auth_user_id, full_name, email, role, is_active)
VALUES (
  '<AUTH_USER_ID>',          -- UUID from auth.users
  'Roberto Scrigna',
  'roberto@yourdomain.com',
  'coach',
  true
);
```

Verify it worked:

```sql
SELECT id, auth_user_id, full_name, email, role FROM partner;
```

You should see one row. The `id` column is Roberto's `partner_id` — note it, as it is
useful for debugging queries.

### 2.5 Verify RLS is Enabled

Run this query to confirm every table has RLS active:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Every row should show `rowsecurity = true`. If any show `false`, run:

```sql
ALTER TABLE <tablename> ENABLE ROW LEVEL SECURITY;
```

### 2.6 Collect Supabase Credentials

Go to **Project Settings > API** in the sidebar.

| Key | Location | Use |
|-----|----------|-----|
| Project URL | "Project URL" field | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` key | "Project API keys" section | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` key | "Project API keys" section | `SUPABASE_SERVICE_ROLE_KEY` |

The service role key bypasses RLS. It is used only by Inngest background functions
running server-side. Never put it in client-side code or expose it publicly.

---

## 3. Inngest Setup

Inngest powers the 12 notification workflows (plan delivery, check-in reminders,
invoice alerts, weight deviation flags, etc.).

### 3.1 Create an Account and App

1. Sign up at https://inngest.com.
2. From the dashboard, you are placed in the default environment. Note the two keys
   displayed on the **Getting Started** page or under **Settings > Event Keys**:
   - **Event Key** — sent with every event trigger
   - **Signing Key** — validates payloads from Inngest to your server

### 3.2 Collect the Keys

Go to **Settings > Event Keys** and **Settings > Signing Keys** in the Inngest dashboard.

| Key | Env Var |
|-----|---------|
| Event Key | `INNGEST_EVENT_KEY` |
| Signing Key | `INNGEST_SIGNING_KEY` |

### 3.3 Register the Endpoint After Deploying to Vercel

Inngest must know where to send function execution requests. You cannot complete this
step until after your first successful Vercel deploy.

1. After deploying (Section 5), your app URL will be something like
   `https://roberto-scrigna.vercel.app`.
2. In the Inngest dashboard, go to **Apps > Register App**.
3. Enter the endpoint URL: `https://your-vercel-url.vercel.app/api/inngest`
4. Inngest will make a `GET` request to that URL to discover your functions. It should
   return the list of 12 registered functions.
5. Confirm registration. From this point on, Inngest will route background jobs to your
   Vercel deployment.

The endpoint is served by `src/app/api/inngest/route.ts` and exports `GET`, `POST`,
and `PUT` handlers, which is the standard Inngest Next.js integration pattern.

---

## 4. Resend Setup

Resend sends all transactional emails: plan delivery notifications, check-in links,
magic link logins for the client portal, invoice emails, etc.

### 4.1 Create an Account

Sign up at https://resend.com. The free tier requires no credit card.

### 4.2 Add and Verify Your Sending Domain

The free tier **does not** allow sending from `@resend.dev` to arbitrary recipients in
production — you must verify a real domain.

1. Go to **Domains** in the Resend dashboard and click **Add domain**.
2. Enter the domain you will send from (e.g. `robertoscrigna.com` or a subdomain like
   `mail.robertoscrigna.com`).
3. Resend will provide DNS records (typically SPF, DKIM, and DMARC). Add these to your
   domain's DNS settings through your registrar (Cloudflare, Namecheap, etc.).
4. DNS propagation can take a few minutes to a few hours. Click **Verify** in the Resend
   dashboard when ready.
5. Once verified, the domain status shows as **Active**.

### 4.3 Generate an API Key

1. Go to **API Keys** in the Resend dashboard.
2. Click **Create API Key**.
3. Name it something descriptive (e.g. `roberto-scrigna-prod`).
4. Set the permission to **Full access** (the app sends emails, not just reads).
5. Copy the key immediately — it is shown only once.

### 4.4 Decide on the FROM Address

The FROM email must use a verified domain. Common choices:

- `noreply@robertoscrigna.com`
- `coaching@robertoscrigna.com`

This value becomes `RESEND_FROM_EMAIL`. It appears in the recipient's inbox as the
sender, so make it something recognisable to clients.

---

## 5. Vercel Deployment

### 5.1 Connect the GitHub Repository

1. Log in at https://vercel.com and click **Add New > Project**.
2. Import the `roberto-scrigna` GitHub repository.
3. Vercel will auto-detect it as a Next.js project. Leave the framework preset as
   **Next.js** and the build command as `next build`.
4. Do not deploy yet — set environment variables first.

### 5.2 Configure the Vercel Function Timeout

Because PDF generation via `@sparticuz/chromium` can take 15-25 seconds on cold
starts, the default 10-second Hobby plan timeout is too short.

On Vercel Pro:

1. Go to your project settings in Vercel.
2. Under **Functions**, find the max duration setting.
3. Set max duration to **60 seconds** for the routes that generate PDFs
   (`/api/pdf/[planId]` and `/api/invoice/[id]/pdf`).

Alternatively, add a `vercel.json` at the project root:

```json
{
  "functions": {
    "src/app/api/pdf/[planId]/route.ts": {
      "maxDuration": 60
    },
    "src/app/api/invoice/[id]/pdf/route.ts": {
      "maxDuration": 60
    }
  }
}
```

### 5.3 Set Environment Variables

In Vercel, go to **Settings > Environment Variables** and add each of the following.
Set all of them for **Production**, **Preview**, and **Development** unless noted.

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `INNGEST_EVENT_KEY` | Your Inngest event key |
| `INNGEST_SIGNING_KEY` | Your Inngest signing key |
| `RESEND_API_KEY` | Your Resend API key |
| `RESEND_FROM_EMAIL` | e.g. `noreply@robertoscrigna.com` |
| `NEXT_PUBLIC_APP_URL` | Your Vercel production URL, e.g. `https://roberto-scrigna.vercel.app` |
| `CHROMIUM_PATH` | Leave **empty** — on Vercel the PDF generator auto-detects `@sparticuz/chromium` via the `VERCEL` env var |

Do not set `CHROMIUM_PATH` on Vercel. The generator in `src/pdf/generator.ts` checks
for `process.env.VERCEL` and calls `chromium.executablePath()` automatically. Setting
`CHROMIUM_PATH` on Vercel would override this and likely point to a non-existent path.

**Local development note (2026-07-20):** puppeteer-core 24.42.0 speaks CDP for Chrome ≤147;
a system Chrome 148+ fails with "Requesting main frame too early!". Install a pinned Chrome
for Testing (`bunx puppeteer browsers install chrome@147`) and point `CHROMIUM_PATH` at it.
The Lambda launch args are only applied when `VERCEL` is set (`src/pdf/chromium-launcher.ts`) —
on a local desktop Chrome they wedge the renderer.

### 5.4 Deploy

1. Click **Deploy** in Vercel (or push to the `main` branch if continuous deployment
   is configured).
2. Watch the build log. A successful build ends with:
   ```
   Route (app)                              Size     First Load JS
   ...
   ✓ Compiled successfully
   ```
3. If the build fails, check the log for TypeScript errors or missing dependencies.

### 5.5 Register the Inngest Endpoint

Once deployed, return to Section 3.3 and register your Vercel URL with Inngest.

---

## 6. Post-Deployment Verification Checklist

Work through this checklist top to bottom after every fresh deployment. Do not skip
steps or assume something works because the build passed.

### Authentication and Login

- [ ] Navigate to `https://your-app.vercel.app` — confirm you see the login page, not
  a 404 or error screen.
- [ ] Log in as Roberto using the credentials created in Section 2.3.
- [ ] Confirm the dashboard loads with the correct name in the header.
- [ ] Log out and confirm you are redirected back to the login page.

### Client Management

- [ ] Click **Add Client** (or equivalent) and create a test client. Fill in all
  available fields in the intake form including weight, height, age, and body
  composition data.
- [ ] Save the client and confirm they appear in the client list.
- [ ] Open the client detail view and confirm all intake data is visible.

### Plan Generation

- [ ] From the test client's page, create a new nutrition plan.
- [ ] Configure daily targets and meal distribution.
- [ ] Save the plan and confirm it appears in the plans list with status `draft`.
- [ ] Set the plan to active.

### PDF Generation

- [ ] Click **Download PDF** (or equivalent) on the active plan.
- [ ] Confirm the download begins within 30 seconds. If you see a timeout, check the
  Vercel function duration setting (Section 5.2) and the Troubleshooting section.
- [ ] Open the downloaded PDF and confirm: the plan name, client name, macro targets,
  meal slots, and food items with gram weights all render correctly.
- [ ] Confirm the PDF is not blank or cut off at the bottom.

### Plan Sharing and Client Email

- [ ] From the plan view, trigger the **Share plan** or **Send to client** action.
- [ ] Check the client's email inbox. The delivery email should arrive within 2 minutes.
- [ ] Confirm the email sender is your configured `RESEND_FROM_EMAIL` address.
- [ ] Confirm the email contains a link to the client portal.

### Client Portal

- [ ] Click the portal link from the plan delivery email.
- [ ] Confirm you land on the client portal login page, not a 404.
- [ ] Trigger a magic link login using the client's email.
- [ ] Check the client's inbox for the magic link email. Confirm it arrives.
- [ ] Click the magic link and confirm you are logged into the portal as the client
  (not as Roberto).
- [ ] Confirm the active plan is visible in the portal.
- [ ] Confirm meal slots display with food names and gram weights (not just kcal totals).

### Check-In Flow

- [ ] As Roberto (log back in as coach), navigate to the test client and send a
  check-in link.
- [ ] Check the client's email for the check-in link. Confirm it arrives.
- [ ] Open the check-in link. Confirm the form loads without a login requirement
  (check-ins use token-based auth, not session auth).
- [ ] Fill in the check-in form (weight, subjective markers, adherence) and submit.
- [ ] Confirm the submission succeeds (no error, redirected to a confirmation page or
  the form resets).
- [ ] Log back in as Roberto and navigate to the dashboard or check-ins view. Confirm
  the completed check-in appears with the submitted data.

### Dashboard Live Data

- [ ] Confirm the Roberto dashboard shows real counts: active clients, pending check-ins,
  unread notifications.
- [ ] If the test client's check-in was flagged (e.g. large weight deviation), confirm
  the flag appears in the notifications or dashboard alerts.

### Mobile Responsive Check

- [ ] Open the app in a mobile browser (or use DevTools device emulation at 390px width).
- [ ] Confirm the hamburger menu button appears in the header.
- [ ] Click it and confirm the sidebar opens correctly, covering the main content.
- [ ] Navigate to a client via the sidebar. Confirm the layout is usable on mobile.
- [ ] Close the sidebar and confirm it dismisses properly.

### Inngest Background Jobs

- [ ] Log in to the Inngest dashboard at https://inngest.com.
- [ ] Go to **Runs** and confirm there is at least one run recorded (triggered by the
  plan share or check-in actions above).
- [ ] Confirm the run shows status **Completed**, not **Failed**.
- [ ] If you see failures, check the run detail for the error message and refer to
  the Troubleshooting section.

---

## 7. Environment Variables Reference

| Variable | Required | Where to Get It | Example (redacted) |
|----------|----------|-----------------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Supabase > Project Settings > API > Project URL | `https://abcdefgh.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required | Supabase > Project Settings > API > anon key | `eyJhbGciOiJIUzI1NiIs...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | Supabase > Project Settings > API > service_role key | `eyJhbGciOiJIUzI1NiIs...` |
| `INNGEST_EVENT_KEY` | Required | Inngest > Settings > Event Keys | `event_XXXXXXXXXXXXXXXX` |
| `INNGEST_SIGNING_KEY` | Required | Inngest > Settings > Signing Keys | `signkey-prod-XXXXXXXX` |
| `RESEND_API_KEY` | Required | Resend > API Keys | `re_XXXXXXXXXXXXXXXX` |
| `RESEND_FROM_EMAIL` | Required | Your verified Resend domain | `noreply@robertoscrigna.com` |
| `NEXT_PUBLIC_APP_URL` | Required | Your Vercel deployment URL | `https://roberto-scrigna.vercel.app` |
| `CHROMIUM_PACK_URL` | Recommended | Immutable URL for the mirrored Chromium 147.0.2 pack | `https://artifacts.example.com/chromium/chromium-v147.0.2-pack.x64.tar` |
| `CHROMIUM_PATH` | Optional | Leave empty on Vercel; for local development point it at a CDP-compatible Chrome (**≤147** — see note below) | `~/.cache/puppeteer/chrome/mac_arm-147.0.7727.57/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` |

Notes:

- Variables prefixed `NEXT_PUBLIC_` are embedded into the client-side JavaScript
  bundle at build time. Never put secrets in `NEXT_PUBLIC_` variables.
- `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security policies. It is used only
  in `src/lib/inngest/functions.ts` for background jobs that need to read/write across
  clients. Keep it server-side only.
- `NEXT_PUBLIC_APP_URL` is used to construct absolute URLs in emails (e.g. portal links,
  magic links, check-in links). If this is wrong, links in emails will point to the
  wrong host. Set it to the canonical production URL without a trailing slash.

---

## 8. Troubleshooting

### PDF Generation Fails or Times Out

**Runtime package and version.** The application uses
`@sparticuz/chromium-min` 147.0.2, not the bundled `@sparticuz/chromium` package.
The `-min` package contains no browser binary: on Vercel the launcher downloads an
x64 Chromium pack at runtime, extracts it under `/tmp`, and then starts Puppeteer.
The pack URL must contain `147.0.2`; a different pack version is rejected before
download to prevent Puppeteer/Chromium protocol mismatches. Update the hardcoded
launcher version, dependency, lockfile, and mirrored artifact together.

**Mirror the production artifact.** Do not make PDF availability depend solely on a
GitHub release. Download `chromium-v147.0.2-pack.x64.tar` from the matching Sparticuz
release, upload the unchanged file to storage owned by the practice or deployment
operator, and expose it through an immutable HTTPS URL. Keep `147.0.2` in the object
name or path, then set `CHROMIUM_PACK_URL` to that URL in every Vercel environment. If
the variable is absent, the pinned GitHub release URL remains the fallback. The URL is
operational configuration, so do not include signed query strings or credentials in it.

**Timeouts and service response.** Keep the PDF route duration at 60 seconds (see
Section 5.2). The launcher gives each download/launch attempt 25 seconds, retries once
after a short backoff, and reports exhausted Chromium supply failures as HTTP 503 with
`Servizio PDF temporaneamente non disponibile`. Check the deployment logs for the
structured `pdf_chromium_source` line to confirm whether the mirror or fallback was
selected; the URL itself is deliberately not logged.

**Local development.** Set `CHROMIUM_PATH` to the real Chrome or Chromium executable,
for example `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS.
Never set that local path on Vercel. A cold first local render can exceed 30 seconds
while Chrome starts and the document settles; allow at least 60 seconds before treating
it as failed. Later renders are normally faster.

---

### Emails Are Not Sending

**Symptom:** Plan delivery emails, magic links, or check-in links never arrive. No
error is thrown in the app.

**Cause 1 — `RESEND_API_KEY` is wrong or missing.** The Resend client in
`src/lib/resend/client.ts` initialises with `process.env.RESEND_API_KEY`. If the key
is missing, the SDK silently fails on some versions.

**Fix:** Verify the key is set in Vercel environment variables. Check the Resend
dashboard under **Logs** to confirm whether requests are reaching Resend at all.

**Cause 2 — Sending domain is not verified.** Resend rejects emails from unverified
domains.

**Fix:** Go to Resend > Domains. The domain used in `RESEND_FROM_EMAIL` must show
status **Active**. If it shows **Pending**, the DNS records have not propagated yet.

**Cause 3 — `RESEND_FROM_EMAIL` uses a domain not listed in Resend.** The FROM address
must exactly match a verified domain (including subdomain, if applicable).

**Fix:** If `RESEND_FROM_EMAIL` is `noreply@mail.robertoscrigna.com`, you must verify
`mail.robertoscrigna.com` (the full sending domain), not just `robertoscrigna.com`.

---

### Inngest Functions Are Not Firing

**Symptom:** Background jobs (email notifications, weight alerts, etc.) never execute.
No runs appear in the Inngest dashboard.

**Cause 1 — Endpoint not registered.** If you skipped Section 3.3, Inngest does not
know where to send work.

**Fix:** Go to Inngest > Apps and register `https://your-app.vercel.app/api/inngest`.
Inngest will perform a `GET` to that URL to discover functions. Confirm the response
includes all 12 functions.

**Cause 2 — `INNGEST_SIGNING_KEY` mismatch.** If the signing key in Vercel does not
match the one in Inngest, payloads will fail signature verification and be rejected.

**Fix:** Regenerate the signing key in Inngest, update `INNGEST_SIGNING_KEY` in Vercel,
and redeploy.

**Cause 3 — `INNGEST_EVENT_KEY` missing.** Events are sent from the app using the event
key. Without it, events are sent unauthenticated and may be rejected.

**Fix:** Confirm `INNGEST_EVENT_KEY` is set in Vercel and matches the key shown in the
Inngest dashboard.

---

### Client Portal Shows 404 or Access Denied

**Symptom:** A client clicks the portal link from their email and sees a 404, a blank
page, or an "access denied" error after logging in.

**Cause 1 — Client has no `auth_user_id`.** The `client` table has a nullable
`auth_user_id` column. If a client was created without triggering the auth user
creation flow, the column is NULL and their session cannot be linked to their record.

**Fix:** In the Supabase SQL Editor, find the client:

```sql
SELECT id, full_name, email, auth_user_id FROM client WHERE email = 'client@email.com';
```

If `auth_user_id` is NULL, create an auth user for them via the Supabase Authentication
dashboard, copy the resulting UID, and update the client record:

```sql
UPDATE client SET auth_user_id = '<auth_user_uid>' WHERE id = '<client_id>';
```

**Cause 2 — Portal URL is wrong.** Check that `NEXT_PUBLIC_APP_URL` is set to the
correct production URL. If it points to `localhost:3000`, portal links in emails will
redirect clients to a local address that does not exist from their machine.

**Cause 3 — Client is logging in with the partner login, not the portal login.** The
app has two separate auth entry points. If a client uses the main `/auth` route
(partner login), they will not find a partner record and will see an error.

**Fix:** Ensure email links point to `/portal/login`, not the root login page.

---

### RLS Migration Error: "relation does not exist"

**Symptom:** Running the migration SQL returns an error like
`ERROR: relation "partner" does not exist`.

**Cause:** The SQL editor may have run a partial statement due to a timeout or a
syntax-highlighting issue.

**Fix:** Run the migration in smaller chunks. The schema is structured with clear
comment separators (`-- ── ... ──`). Run the Extensions block first, then each table
block, then the RLS block, then the trigger block. Each section is independent except
that RLS policies must be run after the tables exist, and triggers must be last.

---

### Build Fails: Type Errors or Missing Modules

**Symptom:** Vercel build log shows TypeScript errors or `Cannot find module` messages.

**Fix — TypeScript errors:** These indicate a code issue, not a deployment configuration
problem. Fix the errors locally by running `bun run build`, resolving all type errors,
and pushing again.

**Fix — Missing module:** Confirm the module is in `dependencies` (not
`devDependencies`) in `package.json`. Vercel only installs production dependencies
during build. Running `bun install` locally and pushing the lockfile sometimes resolves
resolution differences between local and Vercel environments.

---

*End of deployment guide.*
