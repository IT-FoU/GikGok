-- GIKGOK — player profiles, account states, contacts, and settings

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.player_status as enum (
  'active', 'suspended', 'banned', 'deletion_requested', 'deleted'
);
create type public.contact_type as enum ('email', 'phone');
create type public.app_language as enum ('lo', 'en'); -- Thai ('th') added later without refactor
create type public.graphics_mode as enum ('auto', '2d', '3d');
create type public.graphics_quality as enum ('low', 'medium', 'high');
create type public.sound_pack as enum ('classic_casino', 'arcade', 'silent');
create type public.avatar_kind as enum ('preset', 'uploaded');

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname citext not null,
  avatar_kind public.avatar_kind not null default 'preset',
  avatar_url text,
  avatar_preset text,
  status public.player_status not null default 'active',
  is_qa_account boolean not null default false,
  suspended_reason text,
  suspended_at timestamptz,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_nickname_len check (char_length(nickname) between 2 and 24)
);

create unique index profiles_nickname_key on public.profiles (nickname);
create index profiles_status_idx on public.profiles (status);
create index profiles_is_qa_idx on public.profiles (is_qa_account) where is_qa_account;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is 'Player/admin profile; id matches auth.users.id. Demo-credit platform only.';

-- ---------------------------------------------------------------------------
-- player_contacts: verified email/phone; one account per verified contact
-- ---------------------------------------------------------------------------
create table public.player_contacts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  contact_type public.contact_type not null,
  value citext not null,
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index player_contacts_player_idx on public.player_contacts (player_id);
-- Enforce "one account per verified email/phone" across the platform.
create unique index player_contacts_verified_unique
  on public.player_contacts (contact_type, value)
  where is_verified;
-- A player has at most one primary contact of each type.
create unique index player_contacts_one_primary
  on public.player_contacts (player_id, contact_type)
  where is_primary;

create trigger player_contacts_set_updated_at
  before update on public.player_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- player_settings: preferences (language, graphics, sound)
-- ---------------------------------------------------------------------------
create table public.player_settings (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  language public.app_language not null default 'lo',
  graphics_mode public.graphics_mode not null default 'auto',
  graphics_quality public.graphics_quality not null default 'medium',
  fps_cap smallint not null default 60 check (fps_cap between 24 and 240),
  shadows_enabled boolean not null default true,
  effects_enabled boolean not null default true,
  reduce_motion boolean not null default false,
  sound_pack public.sound_pack not null default 'classic_casino',
  sound_volume smallint not null default 80 check (sound_volume between 0 and 100),
  updated_at timestamptz not null default now()
);

create trigger player_settings_set_updated_at
  before update on public.player_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New-user bootstrap: create profile + settings when an auth user is created.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
begin
  v_nickname := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
    'player_' || substr(replace(new.id::text, '-', ''), 1, 10)
  );

  insert into public.profiles (id, nickname)
  values (new.id, v_nickname)
  on conflict (id) do nothing;

  insert into public.player_settings (player_id)
  values (new.id)
  on conflict (player_id) do nothing;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Bootstraps profile + settings on auth.users insert. SECURITY DEFINER; not exposed to API roles.';
revoke all on function public.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS + least-privilege grants
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.player_contacts enable row level security;
alter table public.player_settings enable row level security;

revoke all on public.profiles from anon, authenticated;
revoke all on public.player_contacts from anon, authenticated;
revoke all on public.player_settings from anon, authenticated;

grant all on public.profiles to service_role;
grant all on public.player_contacts to service_role;
grant all on public.player_settings to service_role;

-- Players read/update only their own profile (not status/qa flags — see column grants).
grant select on public.profiles to authenticated;
grant update (nickname, avatar_kind, avatar_url, avatar_preset, last_active_at)
  on public.profiles to authenticated;
grant select, insert, update, delete on public.player_contacts to authenticated;
grant select, insert, update on public.player_settings to authenticated;

-- profiles policies
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_select_admin on public.profiles
  for select to authenticated using (public.has_permission('players.view'));
create policy profiles_update_own on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Admin status changes (suspend/ban) are performed server-side via
-- public.admin_set_player_status() (SECURITY DEFINER, permission-checked),
-- so no direct admin UPDATE policy / column grant is exposed to clients.

-- player_contacts policies
create policy contacts_select_own on public.player_contacts
  for select to authenticated using (player_id = auth.uid());
create policy contacts_modify_own on public.player_contacts
  for all to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());
create policy contacts_select_admin on public.player_contacts
  for select to authenticated using (public.has_permission('players.view'));

-- player_settings policies
create policy settings_select_own on public.player_settings
  for select to authenticated using (player_id = auth.uid());
create policy settings_modify_own on public.player_settings
  for all to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());
