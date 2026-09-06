-- P1: remove SELECT overlap on player_contacts.
-- contacts_modify_own was FOR ALL (includes SELECT), which stacked with
-- contacts_select_combined and triggered Performance Advisor 0006.
-- Narrow modify policy to INSERT/UPDATE/DELETE only.

drop policy if exists contacts_modify_own on public.player_contacts;

create policy contacts_insert_own
  on public.player_contacts
  for insert
  to authenticated
  with check (player_id = (select auth.uid()));

create policy contacts_update_own
  on public.player_contacts
  for update
  to authenticated
  using (player_id = (select auth.uid()))
  with check (player_id = (select auth.uid()));

create policy contacts_delete_own
  on public.player_contacts
  for delete
  to authenticated
  using (player_id = (select auth.uid()));

-- Keep single SELECT policy (own + admin viewers).
drop policy if exists contacts_select_combined on public.player_contacts;
create policy contacts_select_combined
  on public.player_contacts
  for select
  to authenticated
  using (
    player_id = (select auth.uid())
    or public.has_permission('players.view'::public.app_permission)
  );
