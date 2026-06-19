-- Roberto Scrigna Platform: allow clients to upload their own training screenshots
--
-- The 002 migration only granted clients READ access to the "client-media"
-- bucket. To let the client log workouts from the portal with attached
-- screenshots, we need an INSERT/UPDATE/DELETE policy scoped strictly to the
-- training-screenshots/<partner_id>/<client_id>/... subtree. Client photos
-- under client-photos/... remain partner-only.

DROP POLICY IF EXISTS "client_media_client_training_write" ON storage.objects;
CREATE POLICY "client_media_client_training_write" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] = 'training-screenshots'
    AND (storage.foldername(name))[3] IN (
      SELECT id::text FROM client WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'client-media'
    AND (storage.foldername(name))[1] = 'training-screenshots'
    AND (storage.foldername(name))[3] IN (
      SELECT id::text FROM client WHERE auth_user_id = auth.uid()
    )
  );
