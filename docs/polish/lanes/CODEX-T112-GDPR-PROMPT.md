# TASK: T1.12 — GDPR mechanism (register G7, pt2 Item 22)
Build lane. Read docs/polish/PLAN-OF-RECORD.md §T1.12 + NORTHSTAR.md (clinical covenant) first. Branch polish/audit-arc-2026-07 — NEVER switch/pull/reset. Legal TEXT is counsel's — you build MECHANISM only; any user-facing copy you must add is neutral-descriptive Italian, marked with `/* COUNSEL-REVIEW */`.

## Context (verified)
Consent instrument exists (signature_requests mig 010 + firma flow). "Delete" = archive (client.ts sets status; deleted_at soft). NO subject-data export, NO erasure/anonymization anywhere (greps confirmed). Health data = GDPR Art. 9. Tables: client, client_snapshot, check_in, diary_entry, training_log, plan, invoice, document, message, notification, signature_request, legal_document(_version), snapshot_edit_audit, urgent_feedback, client_reminder_settings + storage buckets (client-media).

## Deliverable
1. NEW migration `supabase/migrations/021_gdpr_mechanism.sql`:
   - `consent_record` table: id, client_id, kind TEXT (e.g. privacy_notice|health_data), version TEXT, accepted_at, actor TEXT, signature_request_id UUID NULL, RLS partner-scoped read + service write.
   - SECURITY DEFINER `gdpr_export_client(p_partner_id, p_client_id) RETURNS JSONB` — one JSONB document aggregating the client's rows from EVERY table above (subject-data completeness is the point; iterate explicitly, no dynamic SQL). service_role grant only.
   - SECURITY DEFINER `gdpr_erase_client(p_partner_id, p_client_id, p_confirm TEXT) RETURNS (erased BOOLEAN, tables_touched INTEGER, invalid_reason TEXT)` — requires p_confirm = 'ERASE'. Hard-DELETEs child rows (diary, check_in, training_log, snapshots, notifications, messages, urgent_feedback, reminder_settings, documents rows, signature_requests, consent_record) then ANONYMIZES the client row (full_name→'Cliente eliminato', email/phone/codice_fiscale/notes→NULL, status→'archived', deleted_at→now()) and NULLs plan client-identifying fields? NO — plans/invoices carry retention duty (fiscal): keep plan+invoice rows but sever identity via the anonymized client row. Document this retention choice in comments. Auth user deletion + storage objects CANNOT be done in SQL — return counts and let the router handle those.
2. NEW router `src/server/routers/gdpr.ts`: protectedProcedure `exportClient` (calls export RPC, returns the JSONB for download) and `eraseClient` (input requires literal confirm string; calls RPC; then via createSupabaseServiceRole(): storage.from('client-media').remove client folder + auth.admin.deleteUser if auth_user_id — each step's success/failure reported in the response, never silent). Register in `_app.ts` (one-line import+router add — smallest possible diff).
3. NEW test `src/server/routers/__tests__/gdpr.test.ts` (sibling mock pattern): export returns aggregate; erase without exact confirm → rejects; erase reports per-step outcomes.

## Acceptance
- `bunx tsc --noEmit` clean for YOUR files; suite green.
- Migration is idempotent; grep shows no dynamic SQL in the functions.
- Final message: files + test summary + the retention-choice one-liner ONLY.

## Fence
Touch ONLY: supabase/migrations/021_gdpr_mechanism.sql (new), src/server/routers/gdpr.ts (new), src/server/routers/_app.ts (one-line registration), src/server/routers/__tests__/gdpr.test.ts (new). Do NOT touch client.ts, plan.ts, portal.ts, functions.ts, checkin.ts, IntakeForm. Do NOT apply the migration. No installs/restarts/git. Blocked → docs/polish/lanes/T112-BLOCKED.md and stop.
