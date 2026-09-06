-- Tighten ticket-attachments Storage INSERT ownership and revoke an
-- internal-only DEFINER helper from authenticated callers.
-- Forward-only. Staging project jlpcfatcpymjnjbxmclo.

-- ---------------------------------------------------------------------------
-- Storage INSERT: path must be {ticketId}/{userId}/{filename} where the
-- ticket is owned by the caller (or the caller has tickets.manage).
-- Previously only folder[2] == auth.uid() was checked, allowing cross-ticket
-- object planting under another ticket id.
-- ---------------------------------------------------------------------------
drop policy if exists "ticket attachments insert" on storage.objects;

create policy "ticket attachments insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ticket-attachments'
    and owner = auth.uid()
    and (storage.foldername(name))[2] = auth.uid()::text
    and (
      public.has_permission('tickets.manage')
      or exists (
        select 1
        from public.support_tickets t
        where t.id::text = (storage.foldername(name))[1]
          and t.player_id = auth.uid()
      )
    )
  );

comment on policy "ticket attachments insert" on storage.objects is
  'Authenticated insert into ticket-attachments only when path user folder matches auth.uid() and ticket id is owned by caller (or tickets.manage).';

-- ---------------------------------------------------------------------------
-- get_active_game_version: only needed inside DEFINER game RPCs / service_role.
-- Body remains available to SECURITY DEFINER callers after revoke.
-- ---------------------------------------------------------------------------
revoke all on function public.get_active_game_version(text) from public;
revoke all on function public.get_active_game_version(text) from anon, authenticated;
grant execute on function public.get_active_game_version(text) to service_role;

comment on function public.get_active_game_version(text) is
  'INTERNAL. Returns the active game_versions row for a game key. Callable by service_role and SECURITY DEFINER callers; EXECUTE revoked from authenticated/anon.';
