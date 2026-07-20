# TASK: T1.7 — transactional intake (register G10)
Build lane. Read docs/polish/PLAN-OF-RECORD.md §T1.7 + NORTHSTAR.md first. Branch polish/audit-arc-2026-07 — NEVER switch/pull/reset. Model precedents in this repo: migrations 017/019 (SECURITY DEFINER RPC pattern with typed reason returns) and their router rewires in checkin.ts / plan.ts approve.

## Context (verified)
IntakeForm.tsx:857-867,921-956 fires TWO mutations (createClient then createSnapshot); server path client.ts:1016-1145 (submitIntakeForm) is also two inserts with no rollback — snapshot failure orphans the client; retry duplicates. client.ts:774 comments the 2-statement choice as deliberate; the plan overrides it.

## Deliverable
1. NEW migration `supabase/migrations/020_intake_txn.sql` (numbering: 018/019 exist): SECURITY DEFINER `intake_create_client_with_snapshot(p_partner_id UUID, p_idempotency_key TEXT, p_client JSONB, p_snapshot JSONB) RETURNS (client_id, snapshot_id, was_replay BOOLEAN, invalid_reason TEXT)`. One transaction: insert client + insert snapshot. Idempotency: a small `intake_idempotency` table (key PK, partner_id, client_id, created_at) — replay with same key returns the original ids with was_replay=true, no new rows. Grant EXECUTE to service_role ONLY (router is protectedProcedure using the service client, passing ctx.partnerId). Idempotent DDL.
2. Rewire `client.ts` submitIntakeForm (and/or the create path the form uses — READ IntakeForm to see which mutations it calls) to go through the RPC via createSupabaseServiceRole() (import exists in plan.ts — mirror it). Keep zod inputs; map invalid_reason to TRPCError. Column mapping: build p_client/p_snapshot JSONB in TS mirroring the CURRENT insert payloads exactly (read them; do not invent fields; the function inserts jsonb->>fields into the same columns the current code writes).
3. Rewire IntakeForm.tsx submit to call the ONE mutation (generate an idempotency key client-side once per form session — crypto.randomUUID() at form mount, reused across retries). Preserve all current UX behavior (error display, redirect target).
4. NEW test `src/server/routers/__tests__/intake-txn.test.ts` mirroring the sibling mock pattern: replay with same key → was_replay, no duplicate; snapshot-fails path → no orphan client (mock the rpc return shapes).

## Acceptance
- `bunx tsc --noEmit` clean for YOUR files; `bunx vitest run` suite green.
- The old two-mutation sequence is GONE from IntakeForm (grep createSnapshot.mutateAsync → only the new path).
- Final message: files + test summary + the exact RPC signature ONLY.

## Fence
Touch ONLY: supabase/migrations/020_intake_txn.sql (new), src/server/routers/client.ts, src/app/(dashboard)/plans/new/IntakeForm.tsx, src/server/routers/__tests__/intake-txn.test.ts (new). Do NOT touch functions.ts, plan.ts, portal.ts, checkin.ts, _app.ts. Do NOT apply the migration (I apply it). No installs/restarts/git. Blocked → docs/polish/lanes/T17-BLOCKED.md and stop.
