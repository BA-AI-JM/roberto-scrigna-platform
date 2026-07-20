-- 020_intake_txn.sql
-- T1.7 (register G10): client + initial snapshot are one atomic, idempotent write.

CREATE TABLE IF NOT EXISTS intake_idempotency (
  key TEXT PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partner(id),
  client_id UUID NOT NULL REFERENCES client(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE intake_idempotency ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE intake_idempotency FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB);
CREATE OR REPLACE FUNCTION intake_create_client_with_snapshot(
  p_partner_id UUID,
  p_idempotency_key TEXT,
  p_client JSONB,
  p_snapshot JSONB
)
RETURNS TABLE (client_id UUID, snapshot_id UUID, was_replay BOOLEAN, invalid_reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reserved_client_id UUID;
  reserved_partner_id UUID;
  new_client_id UUID := gen_random_uuid();
  new_snapshot_id UUID := gen_random_uuid();
  replay_snapshot_id UUID;
  failure_phase TEXT := 'idempotency';
BEGIN
  IF NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'invalid_idempotency_key'::TEXT;
    RETURN;
  END IF;

  BEGIN
    INSERT INTO intake_idempotency (key, partner_id, client_id)
    VALUES (p_idempotency_key, p_partner_id, new_client_id)
    ON CONFLICT (key) DO NOTHING
    RETURNING intake_idempotency.client_id INTO reserved_client_id;

    IF reserved_client_id IS NULL THEN
      SELECT i.partner_id, i.client_id
        INTO reserved_partner_id, reserved_client_id
        FROM intake_idempotency i
       WHERE i.key = p_idempotency_key;

      IF reserved_partner_id IS DISTINCT FROM p_partner_id THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'idempotency_conflict'::TEXT;
        RETURN;
      END IF;

      SELECT cs.id INTO replay_snapshot_id
        FROM client_snapshot cs
       WHERE cs.client_id = reserved_client_id
       ORDER BY cs.taken_at ASC, cs.id ASC
       LIMIT 1;

      IF replay_snapshot_id IS NULL THEN
        RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, 'replay_incomplete'::TEXT;
      ELSE
        RETURN QUERY SELECT reserved_client_id, replay_snapshot_id, TRUE, NULL::TEXT;
      END IF;
      RETURN;
    END IF;

    failure_phase := 'client';
    INSERT INTO client (id, partner_id, full_name, email, phone, date_of_birth, sex, notes, tags)
    VALUES (
      new_client_id,
      p_partner_id,
      p_client->>'full_name',
      p_client->>'email',
      p_client->>'phone',
      (p_client->>'date_of_birth')::DATE,
      p_client->>'sex',
      p_client->>'notes',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_client->'tags', '[]'::JSONB)))
    );

    failure_phase := 'snapshot';
    INSERT INTO client_snapshot (
      id, client_id, weight_kg, height_cm, age_years, daily_steps,
      occupational_level, week_schedule, skinfold_data, body_fat_method,
      body_fat_pct, lean_mass_kg, fat_mass_kg, bmr_kcal, notes
    )
    VALUES (
      new_snapshot_id,
      new_client_id,
      (p_snapshot->>'weight_kg')::NUMERIC,
      (p_snapshot->>'height_cm')::NUMERIC,
      (p_snapshot->>'age_years')::INTEGER,
      (p_snapshot->>'daily_steps')::INTEGER,
      p_snapshot->>'occupational_level',
      ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'week_schedule')),
      p_snapshot->'skinfold_data',
      p_snapshot->>'body_fat_method',
      (p_snapshot->>'body_fat_pct')::NUMERIC,
      (p_snapshot->>'lean_mass_kg')::NUMERIC,
      (p_snapshot->>'fat_mass_kg')::NUMERIC,
      (p_snapshot->>'bmr_kcal')::INTEGER,
      p_snapshot->>'notes'
    );

    RETURN QUERY SELECT new_client_id, new_snapshot_id, FALSE, NULL::TEXT;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::UUID, FALSE, (failure_phase || '_failed')::TEXT;
  END;
END;
$$;

REVOKE ALL ON FUNCTION intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION intake_create_client_with_snapshot(UUID, TEXT, JSONB, JSONB)
  TO service_role;
