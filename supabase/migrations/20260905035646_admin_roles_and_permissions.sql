-- GIKGOK — admin accounts, roles, and granular permissions
-- Authorization is server-verified against these tables. Never derived from
-- user-editable auth user_metadata.

-- ---------------------------------------------------------------------------
-- Permission catalog (fixed set from requirements)
-- ---------------------------------------------------------------------------
create type public.app_permission as enum (
  'players.view',
  'players.suspend',
  'credits.view',
  'credits.adjust',
  'games.view',
  'games.control',
  'games.configure',
  'announcements.manage',
  'tickets.manage',
  'reports.view',
  'reports.export',
  'admins.manage',
  'audit.view',
  'system.settings'
);

-- ---------------------------------------------------------------------------
-- admin_users: an admin is an auth user with an admin record
-- ---------------------------------------------------------------------------
create table public.admin_users (
  id uuid primary key references auth.users (id) on delete cascade,
  is_owner boolean not null default false,
  is_active boolean not null default true,
  requires_2fa boolean not null default true,
  requires_pin boolean not null default true,
  -- Large credit adjustments above this amount require a second approver (null = platform default).
  approval_limit bigint check (approval_limit is null or approval_limit >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one Owner is expected operationally; enforce a single active owner marker.
create unique index admin_users_single_owner on public.admin_users (is_owner) where is_owner;
create index admin_users_active_idx on public.admin_users (is_active) where is_active;

create trigger admin_users_set_updated_at
  before update on public.admin_users
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- admin_security: PIN hash / TOTP secret. NEVER exposed to API roles.
-- ---------------------------------------------------------------------------
create table public.admin_security (
  admin_id uuid primary key references public.admin_users (id) on delete cascade,
  pin_hash text,
  totp_secret text,
  totp_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger admin_security_set_updated_at
  before update on public.admin_security
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Roles (presets) and role -> permission mapping
-- ---------------------------------------------------------------------------
create table public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.admin_roles (id) on delete cascade,
  permission public.app_permission not null,
  primary key (role_id, permission)
);

create table public.admin_user_roles (
  admin_id uuid not null references public.admin_users (id) on delete cascade,
  role_id uuid not null references public.admin_roles (id) on delete cascade,
  assigned_by uuid references auth.users (id),
  assigned_at timestamptz not null default now(),
  primary key (admin_id, role_id)
);

-- Per-admin permission overrides (Owner can individually grant/revoke).
create table public.admin_user_permissions (
  admin_id uuid not null references public.admin_users (id) on delete cascade,
  permission public.app_permission not null,
  granted boolean not null default true,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  primary key (admin_id, permission)
);

create index role_permissions_perm_idx on public.role_permissions (permission);
create index admin_user_roles_role_idx on public.admin_user_roles (role_id);

-- ---------------------------------------------------------------------------
-- RLS + least-privilege grants
-- Client write paths are intentionally absent; owner management happens
-- server-side (service_role / SECURITY DEFINER RPCs) with audit logging.
-- ---------------------------------------------------------------------------
alter table public.admin_users enable row level security;
alter table public.admin_security enable row level security;
alter table public.admin_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.admin_user_roles enable row level security;
alter table public.admin_user_permissions enable row level security;

revoke all on public.admin_users, public.admin_security, public.admin_roles,
  public.role_permissions, public.admin_user_roles, public.admin_user_permissions
  from anon, authenticated;

grant all on public.admin_users, public.admin_security, public.admin_roles,
  public.role_permissions, public.admin_user_roles, public.admin_user_permissions
  to service_role;

-- Read-only visibility for admins (write stays server-side).
grant select on public.admin_users, public.admin_roles, public.role_permissions,
  public.admin_user_roles, public.admin_user_permissions to authenticated;
-- admin_security intentionally has NO authenticated/anon grant.

-- Self-visibility policies (no permission-function dependency). Permission-based
-- admin visibility policies are added in the authorization_helpers migration,
-- immediately after public.has_permission() is defined.
create policy admin_users_select_self on public.admin_users
  for select to authenticated using (id = auth.uid());
create policy admin_user_roles_select_self on public.admin_user_roles
  for select to authenticated using (admin_id = auth.uid());
create policy admin_user_permissions_select_self on public.admin_user_permissions
  for select to authenticated using (admin_id = auth.uid());
