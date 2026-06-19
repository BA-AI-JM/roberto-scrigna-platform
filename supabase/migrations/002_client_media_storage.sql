-- Roberto Scrigna Platform: Client media storage
--
-- Adds a private "client-media" Storage bucket that hosts:
--   client-photos/<partner_id>/<client_id>/<file>       — client photos
--   training-screenshots/<partner_id>/<client_id>/<file> — workout screenshots
--
-- RLS policies on storage.objects:
--   • Partners can SELECT/INSERT/UPDATE/DELETE objects whose path is rooted
--     under their own partner_id.
--   • Clients can SELECT objects rooted under their own client_id.
--
-- After applying this migration the buckets are usable from the browser
-- directly via the Supabase JS client (the user's JWT is checked against the
-- RLS policy at upload/list/read time — no signed URLs required for partners).

-- ── Bucket ────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-media',
  'client-media',
  false,
  10485760, -- 10 MiB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Policies ──────────────────────────────────────────────────────────────────

-- Partner full access for their own partner_id subtree.
DROP POLICY IF EXISTS "client_media_partner_all" ON storage.objects;
CREATE POLICY "client_media_partner_all" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM partner WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM partner WHERE auth_user_id = auth.uid()
    )
  );

-- Client can read their own subtree (for portal photo viewing).
DROP POLICY IF EXISTS "client_media_client_read" ON storage.objects;
CREATE POLICY "client_media_client_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[3] IN (
      SELECT id::text FROM client WHERE auth_user_id = auth.uid()
    )
  );
