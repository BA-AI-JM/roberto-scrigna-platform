#!/usr/bin/env bash
# Idempotent between-takes reset for the walkthrough recording.
# Restores the exact pre-take demo state, no matter what a take did:
#   1. Re-activates the seeded plan if a take clicked Approva (one-active invariant).
#   2. Deletes every plan for Niccolò except the seeded one (take-created drafts,
#      or a draft that got approved+re-archived).
#   3. Deletes every weight snapshot for Niccolò except the seeded 91.5 kg row
#      (removes on-camera "Registra peso" entries).
#   4. Re-applies the additive diary seed (no-op if present).
# Safe to run any number of times; touches ONLY Niccolò's take-generated rows.
set -euo pipefail

CLIENT='9dacdf1b-a9b2-4881-8049-f241ebea53ec'
PLAN='793a9bac-0e75-47c0-909f-3c4df552a4fc'
PARTNER='80c07279-c925-4123-9d34-4348fcea7dee'
SNAPSHOT='068909aa-aaa1-457c-b1a6-91ea7626c0fb'
DB() { docker exec -i supabase_db_roberto-scrigna psql -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

# 1. If the seeded plan lost 'active' (a take clicked Approva), restore it.
STATUS=$(DB -tAc "SELECT status FROM plan WHERE id='${PLAN}'")
if [ "$STATUS" != "active" ]; then
  echo "Seeded plan is '${STATUS}' — restoring via approve_plan_txn"
  DB -tAc "SELECT approve_plan_txn('${PLAN}'::uuid,'${PARTNER}'::uuid,'{}'::jsonb,'2026-07-06'::date)"
fi

# 2. Remove all non-seed plans for Niccolò (any status — they can only come from takes;
#    verified 2026-07-20: seed history is exactly one plan row). Child rows first.
DB -tAc "
DELETE FROM diary_entry WHERE plan_id IN (SELECT id FROM plan WHERE client_id='${CLIENT}' AND id<>'${PLAN}');
DELETE FROM plan WHERE client_id='${CLIENT}' AND id<>'${PLAN}';"

# 3. Remove on-camera weight snapshots (keep the seeded 91.5 kg row plus the two
#    backdated seed snapshots from seed-demo.sql).
DB -tAc "DELETE FROM client_snapshot WHERE client_id='${CLIENT}'
  AND id NOT IN ('${SNAPSHOT}',
    'd1a20000-0000-4000-8000-000000000001',
    'd1a20000-0000-4000-8000-000000000002');"

# 4. Re-apply the additive diary seed.
DB < "$(dirname "$0")/seed-demo.sql" >/dev/null

DB -tAc "
SELECT 'plan: '||status FROM plan WHERE id='${PLAN}';
SELECT 'plans total: '||count(*) FROM plan WHERE client_id='${CLIENT}';
SELECT 'snapshots: '||count(*) FROM client_snapshot WHERE client_id='${CLIENT}';
SELECT 'diary: '||count(*) FROM diary_entry WHERE client_id='${CLIENT}';"
echo "Reset OK"
