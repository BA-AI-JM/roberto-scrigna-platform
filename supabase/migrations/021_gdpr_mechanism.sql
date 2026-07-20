-- 021_gdpr_mechanism.sql
-- GDPR operational mechanism only. Legal wording and consent text remain counsel-owned.
-- Idempotent: table/index creation is conditional; policies and functions converge on re-run.

-- The requested anonymization field is part of the client identity surface.
ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;

CREATE TABLE IF NOT EXISTS public.consent_record (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.client(id),
  kind TEXT NOT NULL,
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT NOT NULL,
  signature_request_id UUID REFERENCES public.signature_request(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_consent_record_client
  ON public.consent_record(client_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_consent_record_signature_request
  ON public.consent_record(signature_request_id)
  WHERE signature_request_id IS NOT NULL;

ALTER TABLE public.consent_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consent_record_partner_read ON public.consent_record;
CREATE POLICY consent_record_partner_read ON public.consent_record
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT c.id
      FROM public.client c
      WHERE c.partner_id IN (
        SELECT p.id FROM public.partner p WHERE p.auth_user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS consent_record_service_insert ON public.consent_record;
CREATE POLICY consent_record_service_insert ON public.consent_record
  FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS consent_record_service_update ON public.consent_record;
CREATE POLICY consent_record_service_update ON public.consent_record
  FOR UPDATE TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS consent_record_service_delete ON public.consent_record;
CREATE POLICY consent_record_service_delete ON public.consent_record
  FOR DELETE TO service_role USING (true);

REVOKE ALL ON TABLE public.consent_record FROM anon, authenticated;
GRANT SELECT ON TABLE public.consent_record TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.consent_record TO service_role;

CREATE OR REPLACE FUNCTION public.gdpr_export_client(
  p_partner_id UUID,
  p_client_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.client c
    WHERE c.id = p_client_id AND c.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'client not found for partner';
  END IF;

  RETURN jsonb_build_object(
    'client', (
      SELECT to_jsonb(c)
      FROM public.client c
      WHERE c.id = p_client_id AND c.partner_id = p_partner_id
    ),
    'client_snapshot', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.client_snapshot WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'check_in', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.check_in
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'diary_entry', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.diary_entry WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'training_log', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.training_log
        WHERE client_id = p_client_id
          AND (partner_id = p_partner_id OR partner_id IS NULL)
      ) r
    ), '[]'::jsonb),
    'plan', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.plan
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'invoice', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.invoice
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'document', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.document
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'message', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.message WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'notification', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.notification
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'signature_request', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.signature_request
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'legal_document_version', COALESCE((
      SELECT jsonb_agg(to_jsonb(ldv))
      FROM public.legal_document_version ldv
      WHERE EXISTS (
        SELECT 1
        FROM public.signature_request sr
        WHERE sr.document_version_id = ldv.id
          AND sr.client_id = p_client_id
          AND sr.partner_id = p_partner_id
      )
    ), '[]'::jsonb),
    'legal_document', COALESCE((
      SELECT jsonb_agg(to_jsonb(ld))
      FROM public.legal_document ld
      WHERE ld.partner_id = p_partner_id
        AND EXISTS (
          SELECT 1
          FROM public.legal_document_version ldv
          JOIN public.signature_request sr ON sr.document_version_id = ldv.id
          WHERE ldv.legal_document_id = ld.id
            AND sr.client_id = p_client_id
            AND sr.partner_id = p_partner_id
        )
    ), '[]'::jsonb),
    'snapshot_edit_audit', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.snapshot_edit_audit WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'urgent_feedback', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (
        SELECT * FROM public.urgent_feedback
        WHERE client_id = p_client_id AND partner_id = p_partner_id
      ) r
    ), '[]'::jsonb),
    'client_reminder_settings', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.client_reminder_settings WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'consent_record', COALESCE((
      SELECT jsonb_agg(to_jsonb(r))
      FROM (SELECT * FROM public.consent_record WHERE client_id = p_client_id) r
    ), '[]'::jsonb),
    'client_media', COALESCE((
      SELECT jsonb_agg(to_jsonb(o))
      FROM storage.objects o
      WHERE o.bucket_id = 'client-media'
        AND (
          o.name LIKE 'client-photos/' || p_partner_id::text || '/' || p_client_id::text || '/%'
          OR o.name LIKE 'training-screenshots/' || p_partner_id::text || '/' || p_client_id::text || '/%'
        )
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.gdpr_erase_client(
  p_partner_id UUID,
  p_client_id UUID,
  p_confirm TEXT
) RETURNS TABLE (
  erased BOOLEAN,
  tables_touched INTEGER,
  invalid_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  erased := false;
  tables_touched := 0;
  invalid_reason := NULL;

  IF p_confirm IS DISTINCT FROM 'ERASE' THEN
    invalid_reason := 'confirmation_mismatch';
    RETURN NEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.client c
    WHERE c.id = p_client_id AND c.partner_id = p_partner_id
  ) THEN
    invalid_reason := 'client_not_found';
    RETURN NEXT;
    RETURN;
  END IF;

  DELETE FROM public.diary_entry WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.check_in
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.training_log
  WHERE client_id = p_client_id
    AND (partner_id = p_partner_id OR partner_id IS NULL);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.snapshot_edit_audit WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Plans are retained, so their snapshot FK must be cleared before deleting snapshots.
  -- This is not identity severance: the retained plan still points to the anonymized client.
  UPDATE public.plan
  SET snapshot_id = NULL, updated_at = now()
  WHERE client_id = p_client_id
    AND partner_id = p_partner_id
    AND snapshot_id IS NOT NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.client_snapshot WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.notification
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.message WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.urgent_feedback
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.client_reminder_settings WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.document
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.signature_request
  WHERE client_id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  DELETE FROM public.consent_record WHERE client_id = p_client_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Fiscal retention choice: plan and invoice rows remain linked to the client row.
  -- The client identity is anonymized in place so retained clinical/fiscal records keep
  -- referential integrity without retaining the listed direct identifiers.
  UPDATE public.client
  SET full_name = 'Cliente eliminato',
      email = NULL,
      phone = NULL,
      codice_fiscale = NULL,
      notes = NULL,
      status = 'archived',
      deleted_at = now(),
      updated_at = now()
  WHERE id = p_client_id AND partner_id = p_partner_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN tables_touched := tables_touched + 1; END IF;

  -- Auth users and Storage objects are external to this transaction. The protected
  -- server router performs those two steps and reports each result independently.
  erased := true;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.gdpr_export_client(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gdpr_erase_client(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gdpr_export_client(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.gdpr_erase_client(UUID, UUID, TEXT) TO service_role;
