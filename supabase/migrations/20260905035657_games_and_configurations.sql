-- GIKGOK — games, versioned configurations, lifecycle, and feature flags
-- Server-authoritative: config is stored per version and pinned to each bet so
-- config changes never alter historical rounds.

create type public.game_status as enum (
  'draft', 'qa', 'owner_approved', 'scheduled', 'live', 'disabled'
);
create type public.game_mode as enum ('random', 'controlled_demo');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  status public.game_status not null default 'draft',
  is_enabled boolean not null default false,
  renderer text not null default 'auto' check (renderer in ('2d', '3d', 'auto')),
  min_stake bigint not null default 500 check (min_stake > 0),
  max_stake bigint check (max_stake is null or max_stake >= min_stake),
  quick_stakes bigint[] not null default '{500,1000,5000,10000}',
  scheduled_launch_at timestamptz,
  maintenance_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index games_status_idx on public.games (status);
create index games_enabled_idx on public.games (is_enabled) where is_enabled;

create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

create table public.game_versions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  version integer not null check (version >= 1),
  config jsonb not null,
  notes text,
  is_published boolean not null default false,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (game_id, version)
);

create index game_versions_game_idx on public.game_versions (game_id, version desc);

-- Active version pointer (nullable FK added after both tables exist).
alter table public.games
  add column active_version_id uuid references public.game_versions (id);

-- Release workflow transition log (append-only via trigger).
create table public.game_release_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  from_status public.game_status,
  to_status public.game_status not null,
  actor_id uuid references auth.users (id),
  note text,
  created_at timestamptz not null default now()
);

create index game_release_events_game_idx on public.game_release_events (game_id, created_at desc);

create trigger game_release_events_block_update
  before update on public.game_release_events
  for each row execute function public.prevent_mutation();
create trigger game_release_events_block_delete
  before delete on public.game_release_events
  for each row execute function public.prevent_mutation();

-- Feature flags (owner-controlled).
create table public.feature_flags (
  key text primary key,
  description text,
  is_enabled boolean not null default false,
  audience jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);

create trigger feature_flags_set_updated_at
  before update on public.feature_flags
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.game_versions enable row level security;
alter table public.game_release_events enable row level security;
alter table public.feature_flags enable row level security;

revoke all on public.games, public.game_versions, public.game_release_events,
  public.feature_flags from anon, authenticated;
grant all on public.games, public.game_versions, public.game_release_events,
  public.feature_flags to service_role;
grant select on public.games, public.game_versions, public.game_release_events,
  public.feature_flags to authenticated;

-- Players see live+enabled games; admins with games.view see everything.
create policy games_select_live on public.games
  for select to authenticated
  using ((status = 'live' and is_enabled) or public.has_permission('games.view'));

-- Players can read the published active version of a live game; admins see all.
create policy game_versions_select_active on public.game_versions
  for select to authenticated
  using (
    public.has_permission('games.view')
    or exists (
      select 1 from public.games g
      where g.id = game_versions.game_id
        and g.status = 'live' and g.is_enabled
        and g.active_version_id = game_versions.id
    )
  );

create policy game_release_events_select_admin on public.game_release_events
  for select to authenticated
  using (public.has_permission('games.view') or public.has_permission('audit.view'));

-- Feature flags: enabled flags readable by any signed-in user; admins see all.
create policy feature_flags_select on public.feature_flags
  for select to authenticated
  using (is_enabled or public.has_permission('system.settings'));
