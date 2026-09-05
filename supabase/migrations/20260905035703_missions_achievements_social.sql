-- GIKGOK — missions, achievements, leaderboards, friends/invites

create type public.mission_scope as enum ('single_game', 'any_game');
create type public.friendship_status as enum ('pending', 'accepted', 'blocked');
create type public.leaderboard_board as enum (
  'current_credit', 'cumulative_winnings', 'most_wins'
);

-- ---------------------------------------------------------------------------
-- Missions
-- ---------------------------------------------------------------------------
create table public.missions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  scope public.mission_scope not null default 'any_game',
  game_id uuid references public.games (id),
  goal_type text not null,
  goal_target integer not null check (goal_target > 0),
  reward_amount bigint not null default 0 check (reward_amount >= 0),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint missions_single_game_ref
    check (scope <> 'single_game' or game_id is not null)
);

create trigger missions_set_updated_at
  before update on public.missions
  for each row execute function public.set_updated_at();

create table public.mission_progress (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,
  reward_ledger_id uuid references public.gik_ledger (id),
  updated_at timestamptz not null default now(),
  unique (mission_id, player_id)
);

create index mission_progress_player_idx on public.mission_progress (player_id);

create trigger mission_progress_set_updated_at
  before update on public.mission_progress
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------
create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  icon text,
  criteria jsonb not null default '{}'::jsonb,
  reward_amount bigint not null default 0 check (reward_amount >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.achievement_unlocks (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  reward_ledger_id uuid references public.gik_ledger (id),
  unique (achievement_id, player_id)
);

create index achievement_unlocks_player_idx on public.achievement_unlocks (player_id);

-- ---------------------------------------------------------------------------
-- Leaderboards (denormalized, public-safe: nickname + avatar + metric only)
-- ---------------------------------------------------------------------------
create table public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  board public.leaderboard_board not null,
  player_id uuid not null references public.profiles (id) on delete cascade,
  nickname citext not null,
  avatar_url text,
  metric_value bigint not null default 0,
  rank integer not null,
  snapshot_at timestamptz not null default now(),
  unique (board, player_id)
);

create index leaderboard_entries_board_rank_idx on public.leaderboard_entries (board, rank);

-- ---------------------------------------------------------------------------
-- Friends / invites
-- ---------------------------------------------------------------------------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status public.friendship_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  constraint friendships_not_self check (requester_id <> addressee_id)
);

create index friendships_addressee_idx on public.friendships (addressee_id);

create trigger friendships_set_updated_at
  before update on public.friendships
  for each row execute function public.set_updated_at();

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  invitee_contact text,
  accepted_by uuid references public.profiles (id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index invites_inviter_idx on public.invites (inviter_id);

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.missions enable row level security;
alter table public.mission_progress enable row level security;
alter table public.achievements enable row level security;
alter table public.achievement_unlocks enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.friendships enable row level security;
alter table public.invites enable row level security;

revoke all on public.missions, public.mission_progress, public.achievements,
  public.achievement_unlocks, public.leaderboard_entries, public.friendships,
  public.invites from anon, authenticated;
grant all on public.missions, public.mission_progress, public.achievements,
  public.achievement_unlocks, public.leaderboard_entries, public.friendships,
  public.invites to service_role;

grant select on public.missions, public.achievements, public.leaderboard_entries,
  public.mission_progress, public.achievement_unlocks to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert on public.invites to authenticated;

-- Missions/achievements: active ones for players; admins with games.configure see all.
create policy missions_select on public.missions
  for select to authenticated
  using (
    public.has_permission('games.configure')
    or (is_active
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at > now()))
  );
create policy achievements_select on public.achievements
  for select to authenticated
  using (is_active or public.has_permission('games.configure'));

-- Player progress/unlocks: own rows; admins with reports.view can read all.
create policy mission_progress_select_own on public.mission_progress
  for select to authenticated using (player_id = auth.uid());
create policy mission_progress_select_admin on public.mission_progress
  for select to authenticated using (public.has_permission('reports.view'));
create policy achievement_unlocks_select_own on public.achievement_unlocks
  for select to authenticated using (player_id = auth.uid());
create policy achievement_unlocks_select_admin on public.achievement_unlocks
  for select to authenticated using (public.has_permission('reports.view'));

-- Leaderboards expose only nickname/avatar/metric and are visible to all signed-in users.
create policy leaderboard_select_all on public.leaderboard_entries
  for select to authenticated using (true);

-- Friendships: only the two parties can see/manage their relationship.
create policy friendships_select_party on public.friendships
  for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy friendships_insert_requester on public.friendships
  for insert to authenticated with check (requester_id = auth.uid());
create policy friendships_update_party on public.friendships
  for update to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid())
  with check (requester_id = auth.uid() or addressee_id = auth.uid());
create policy friendships_delete_party on public.friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Invites: inviter manages own; the accepting user can see their accepted invite.
create policy invites_select_involved on public.invites
  for select to authenticated
  using (inviter_id = auth.uid() or accepted_by = auth.uid());
create policy invites_insert_own on public.invites
  for insert to authenticated with check (inviter_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Leaderboard view (Data API): security_invoker so base-table RLS applies.
-- ---------------------------------------------------------------------------
create view public.leaderboard_ranked
with (security_invoker = true)
as
select board, player_id, nickname, avatar_url, metric_value, rank, snapshot_at
from public.leaderboard_entries
order by board, rank;

grant select on public.leaderboard_ranked to authenticated;
