-- GIKGOK — daily check-in rewards and streaks
-- Reward values/limits are Owner-editable (see system_settings). The claim
-- RPC (server-authoritative) is defined with the settings migration.

create table public.player_streaks (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_claimed_on date,
  updated_at timestamptz not null default now()
);

create trigger player_streaks_set_updated_at
  before update on public.player_streaks
  for each row execute function public.set_updated_at();

create table public.daily_reward_claims (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  claimed_on date not null,
  base_amount bigint not null check (base_amount >= 0),
  streak_bonus bigint not null default 0 check (streak_bonus >= 0),
  total_amount bigint not null check (total_amount >= 0),
  streak_day integer not null check (streak_day >= 1),
  ledger_id uuid references public.gik_ledger (id),
  created_at timestamptz not null default now(),
  unique (player_id, claimed_on)
);

create index daily_reward_claims_player_idx on public.daily_reward_claims (player_id, claimed_on desc);

-- ---------------------------------------------------------------------------
-- RLS + grants (claims are written server-side via claim_daily_reward())
-- ---------------------------------------------------------------------------
alter table public.player_streaks enable row level security;
alter table public.daily_reward_claims enable row level security;

revoke all on public.player_streaks, public.daily_reward_claims from anon, authenticated;
grant all on public.player_streaks, public.daily_reward_claims to service_role;
grant select on public.player_streaks, public.daily_reward_claims to authenticated;

create policy streaks_select_own on public.player_streaks
  for select to authenticated using (player_id = auth.uid());
create policy streaks_select_admin on public.player_streaks
  for select to authenticated using (public.has_permission('players.view'));

create policy daily_claims_select_own on public.daily_reward_claims
  for select to authenticated using (player_id = auth.uid());
create policy daily_claims_select_admin on public.daily_reward_claims
  for select to authenticated using (public.has_permission('credits.view'));
