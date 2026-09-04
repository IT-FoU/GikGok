-- Storage buckets and policies for avatars, ticket attachments, and game assets.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    false,
    2097152,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'ticket-attachments',
    'ticket-attachments',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'game-assets',
    'game-assets',
    true,
    52428800,
    ARRAY[
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/svg+xml',
      'audio/mpeg',
      'audio/wav',
      'model/gltf-binary',
      'application/octet-stream'
    ]
  )
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = now();

-- Avatars: players manage only their own folder `{user_id}/...`
CREATE POLICY avatars_select_own_or_admin
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.admin_has_permission('players.view')
    )
  );

CREATE POLICY avatars_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_update_own
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY avatars_delete_own
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Ticket attachments: player owns ticket folder or ticket admin
CREATE POLICY ticket_attachments_select
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.admin_has_permission('tickets.manage')
    )
  );

CREATE POLICY ticket_attachments_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.admin_has_permission('tickets.manage')
    )
  );

CREATE POLICY ticket_attachments_delete_own_or_admin
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.admin_has_permission('tickets.manage')
    )
  );

-- Game assets: public read; admin write via system.settings
CREATE POLICY game_assets_public_read
  ON storage.objects FOR SELECT TO authenticated, anon
  USING (bucket_id = 'game-assets');

CREATE POLICY game_assets_admin_write
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'game-assets'
    AND public.admin_has_permission('system.settings')
  )
  WITH CHECK (
    bucket_id = 'game-assets'
    AND public.admin_has_permission('system.settings')
  );
