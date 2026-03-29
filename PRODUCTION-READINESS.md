# Roberto Scrigna Platform — Production Readiness Assessment

**Date:** 2026-03-30
**Assessed by:** Claude Code session
**Verdict:** NOT production-ready. Schema-code mismatch blocks all DB operations except basic client/plan CRUD.

---

## What Works Right Now

| Layer | Status | Evidence |
|-------|--------|---------|
| Calculation engine | **Green** | 320 Vitest tests passing. BMR, TDEE, macros, meal plans, hydration, supplements all verified against 3 client fixtures. |
| TypeScript compilation | **Green** | `tsc --noEmit` passes with zero errors. |
| UI rendering | **Green** | All pages render. 27 Playwright tests confirm auth, routing, navigation, mobile. |
| PDF generation | **Green** | Puppeteer HTML→PDF pipeline tested. |
| Auth flow | **Green** | Supabase login/register, session management, middleware redirect. |
| tRPC routing | **Green** | All 12 routers compile and export correctly. |

## What Will Crash on First Real Use

### Critical: Database Schema ↔ Code Mismatch

The migration (`001_initial_schema.sql`) was written in batch-b. The tRPC routers were written in later batches with a **different schema in mind**. They were never reconciled. Result: any Supabase query touching the mismatched tables will return errors or empty results.

#### Table Name Mismatches

| Code queries | Migration creates | Affected routers |
|-------------|-------------------|------------------|
| `checkin` | `check_in` | checkin.ts, dashboard.ts, inngest/functions.ts |
| `documents` | `document` | document.ts (2 queries) |
| `notification_settings` | *(missing)* | notification.ts |
| `check_in_token` | *(missing)* | portal.ts |

#### Column Mismatches: `check_in` / `checkin` table

The checkin router expects ~15 columns that don't exist in the migration:

| Code expects | Migration has | Notes |
|-------------|---------------|-------|
| `token` | *(missing)* | Token-based auth for client-facing form |
| `status` | *(missing)* | pending/completed/reviewed lifecycle |
| `partner_id` | *(missing)* | Owner filtering |
| `due_date` | `check_in_date` | Different name |
| `completed_at` | *(missing)* | Completion timestamp |
| `waist_cm` | *(missing)* | Body measurement |
| `hip_cm` | *(missing)* | Body measurement |
| `digestive_health` | `digestion` | Different name |
| `adherence_pct` | `nutrition_adherence` | Different name + type |
| `training_adherence` | `training_adherence` | Exists but different semantics (% vs int) |
| `notes` | `client_notes` | Different name |
| `photos` | `photo_front/side/back_url` | Array vs individual URLs |
| `weight_deviation_kg` | *(missing)* | Computed deviation |
| `weight_flagged` | *(missing)* | Deviation flag |
| `ai_summary` | *(missing)* | Generated summary |
| `review_notes` | `coach_notes` | Different name |
| `reviewed_at` | *(missing)* | Review timestamp |

#### Column Mismatches: `notification` table

| Code expects | Migration has | Notes |
|-------------|---------------|-------|
| `partner_id` | `recipient_id` | Different name |
| `client_id` | *(missing)* | Client reference |
| `trigger` | `notification_type` | Different name + values |
| `priority` | *(missing)* | Priority level |
| `read` | `is_read` | Different name |
| `metadata` | *(missing)* | JSONB metadata |

#### Missing Table: `notification_settings`

The notification router queries a `notification_settings` table for per-partner notification preferences. This table doesn't exist in the migration.

#### Missing Table/Column: `check_in_token`

The portal router references `check_in_token` which doesn't exist anywhere.

### Secondary: Incomplete Wiring

- **Inngest route** (`src/app/api/inngest/route.ts`) exists but needs Inngest dev server or cloud to actually execute background jobs
- **Resend emails** — configured but no actual email-sending code in the check-in or invoice flows
- **Claude API narrative** — `src/services/narrative.ts` exists but needs ANTHROPIC_API_KEY and may be stubbed

---

## Fix Plan

### Step 1: Write Migration 002 (Schema Reconciliation)

Create `supabase/migrations/002_schema_reconciliation.sql` that:
1. Renames `check_in` → adds missing columns (or drops and recreates)
2. Adds the columns the checkin router expects: `token`, `status`, `partner_id`, `due_date`, `completed_at`, `waist_cm`, `hip_cm`, `digestive_health`, `adherence_pct`, `notes`, `photos`, `weight_deviation_kg`, `weight_flagged`, `ai_summary`, `review_notes`, `reviewed_at`
3. Fixes the notification table: adds `partner_id`, `client_id`, `trigger`, `priority`, `metadata`, renames `is_read` → `read`
4. Creates `notification_settings` table
5. Updates all RLS policies to match new column names

**OR** (simpler): update the tRPC routers to match the existing migration schema. This is higher risk because the router logic is more complex than the schema.

**Recommended approach:** Rewrite the migration to match the code, since the code represents the actual desired behavior and the migration was a first draft.

### Step 2: Fix Table Name References in Code

Either:
- Rename all `checkin` → `check_in` in the tRPC routers, dashboard, and Inngest functions
- OR rename the table in the migration to `checkin`

Pick one convention and apply everywhere.

### Step 3: Verify End-to-End

With Supabase running locally:
1. Apply migrations
2. Seed data
3. Login → create client → generate plan → download PDF
4. Send check-in → submit → verify weight deviation flag
5. Create invoice → verify in list
6. Check dashboard KPIs populate

### Step 4: Deploy

- Vercel deployment (env vars from `.env.local.example`)
- Supabase project (apply migration, set up auth)
- Inngest cloud account (connect webhook)
- Resend domain verification (for emails)
- Optional: Anthropic API key (for AI narratives)

---

## What This Means

The engine is solid — 320 tests prove the calculation logic is correct. The UI is polished — real Italian labels, proper forms, branded design. The architecture is sound — tRPC, Supabase, Inngest, Puppeteer all properly configured.

The gap is a **schema reconciliation** that was never done after the overnight build. The tRPC routers evolved past what the initial migration defined. One focused session fixes this.
