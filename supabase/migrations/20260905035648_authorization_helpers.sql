-- GIKGOK — server-verified authorization helpers
-- These are SECURITY DEFINER so RLS policies can consult the admin tables
-- without exposing those tables broadly. Authorization is NEVER based on
-- user-editable auth user_metadata.

-- Is the user an active admin?
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.id = uid and a.is_active
  );
$$;

-- Is the user the active Owner?
create or replace function public.is_owner(uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.id = uid and a.is_active and a.is_owner
  );
$$;

-- Effective permission check:
--   Owner => all permissions.
--   Per-user override (admin_user_permissions.granted) wins over roles.
--   Otherwise union of assigned role permissions.
create or replace function public.has_permission(
  perm public.app_permission,
  uid uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when uid is null then false
    when public.is_owner(uid) then true
    when not public.is_admin(uid) then false
    else coalesce(
      (
        select aup.granted
        from public.admin_user_permissions aup
        where aup.admin_id = uid and aup.permission = perm
      ),
      exists (
        select 1
        from public.admin_user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        where ur.admin_id = uid and rp.permission = perm
      )
    )
  end;
$$;

comment on function public.has_permission(public.app_permission, uuid) is
  'Server-verified granular permission check used by RLS. Owner has all; per-user overrides beat roles.';

-- Least-privilege EXECUTE: revoke from PUBLIC, grant only to API roles that
-- need to evaluate policies. anon never evaluates admin permissions.
revoke all on function public.is_admin(uuid) from public;
revoke all on function public.is_owner(uuid) from public;
revoke all on function public.has_permission(public.app_permission, uuid) from public;

grant execute on function public.is_admin(uuid) to authenticated, service_role;
grant execute on function public.is_owner(uuid) to authenticated, service_role;
grant execute on function public.has_permission(public.app_permission, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permission-based admin visibility policies (now that has_permission() exists)
-- ---------------------------------------------------------------------------
create policy admin_users_select_manage on public.admin_users
  for select to authenticated using (public.has_permission('admins.manage'));

create policy admin_roles_select on public.admin_roles
  for select to authenticated
  using (public.has_permission('admins.manage') or public.has_permission('audit.view'));
create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using (public.has_permission('admins.manage') or public.has_permission('audit.view'));
create policy admin_user_roles_select_manage on public.admin_user_roles
  for select to authenticated using (public.has_permission('admins.manage'));
create policy admin_user_permissions_select_manage on public.admin_user_permissions
  for select to authenticated using (public.has_permission('admins.manage'));
