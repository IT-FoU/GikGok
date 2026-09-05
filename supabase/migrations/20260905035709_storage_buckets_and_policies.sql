-- GIKGOK — storage buckets and least-privilege storage policies
-- Buckets: avatars (public read), ticket-attachments (private), game-assets (public read).

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('ticket-attachments', 'ticket-attachments', false),
  ('game-assets', 'game-assets', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- avatars: public read; users write only within their own <uid>/ folder
-- ---------------------------------------------------------------------------
create policy "avatars public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy "avatars owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and owner = auth.uid()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars owner update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid())
  with check (bucket_id = 'avatars' and owner = auth.uid());

create policy "avatars owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and owner = auth.uid());

-- ---------------------------------------------------------------------------
-- ticket-attachments: private; uploader owns; ticket admins can read all
-- ---------------------------------------------------------------------------
create policy "ticket attachments read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (owner = auth.uid() or public.has_permission('tickets.manage'))
  );

create policy "ticket attachments insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and owner = auth.uid()
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "ticket attachments delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and (owner = auth.uid() or public.has_permission('tickets.manage'))
  );

-- ---------------------------------------------------------------------------
-- game-assets: public read; only games.configure admins may write
-- ---------------------------------------------------------------------------
create policy "game assets public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'game-assets');

create policy "game assets admin insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'game-assets' and public.has_permission('games.configure'));

create policy "game assets admin update" on storage.objects
  for update to authenticated
  using (bucket_id = 'game-assets' and public.has_permission('games.configure'))
  with check (bucket_id = 'game-assets' and public.has_permission('games.configure'));

create policy "game assets admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'game-assets' and public.has_permission('games.configure'));
