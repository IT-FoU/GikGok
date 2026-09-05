-- GIKGOK — game rounds, bets, outcomes, and receipts
-- Bets/outcomes/receipts are written by server-authoritative settlement
-- (service_role / Edge Functions). Clients never insert bets or decide outcomes.

create type public.round_status as enum ('open', 'locked', 'settled', 'voided');
create type public.bet_status as enum ('placed', 'locked', 'settled', 'voided');

create table public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id),
  game_version_id uuid not null references public.game_versions (id),
  mode public.game_mode not null default 'random',
  status public.round_status not null default 'open',
  result jsonb,
  controlled_by uuid references auth.users (id),
  opened_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  -- Controlled-demo rounds must record who set them (auditability).
  constraint game_rounds_controlled_actor
    check (mode <> 'controlled_demo' or controlled_by is not null)
);

create index game_rounds_game_idx on public.game_rounds (game_id, created_at desc);
create index game_rounds_status_idx on public.game_rounds (status);

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds (id),
  player_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id),
  game_version_id uuid not null references public.game_versions (id),
  idempotency_key text not null,
  selection jsonb not null,
  stake bigint not null check (stake > 0),
  mode public.game_mode not null default 'random',
  status public.bet_status not null default 'placed',
  is_win boolean,
  total_return bigint not null default 0 check (total_return >= 0),
  debit_ledger_id uuid references public.gik_ledger (id),
  payout_ledger_id uuid references public.gik_ledger (id),
  placed_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  -- A bet is accepted exactly once per player idempotency key.
  unique (player_id, idempotency_key)
);

create index bets_player_idx on public.bets (player_id, created_at desc);
create index bets_round_idx on public.bets (round_id);
create index bets_game_idx on public.bets (game_id, created_at desc);
create index bets_status_idx on public.bets (status);

create table public.bet_outcomes (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets (id) on delete cascade,
  round_id uuid not null references public.game_rounds (id),
  is_win boolean not null,
  multiplier numeric(10, 2) not null default 0,
  total_return bigint not null default 0 check (total_return >= 0),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (bet_id)
);

create index bet_outcomes_round_idx on public.bet_outcomes (round_id);

create trigger bet_outcomes_block_update
  before update on public.bet_outcomes
  for each row execute function public.prevent_mutation();
create trigger bet_outcomes_block_delete
  before delete on public.bet_outcomes
  for each row execute function public.prevent_mutation();

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  bet_id uuid not null references public.bets (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  game_id uuid not null references public.games (id),
  game_version_id uuid not null references public.game_versions (id),
  mode public.game_mode not null,
  stake bigint not null,
  total_return bigint not null,
  is_win boolean not null,
  balance_after bigint not null,
  selection jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (bet_id)
);

create index receipts_player_idx on public.receipts (player_id, created_at desc);

create trigger receipts_block_update
  before update on public.receipts
  for each row execute function public.prevent_mutation();
create trigger receipts_block_delete
  before delete on public.receipts
  for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- RLS + grants (all writes are server-side / service_role)
-- ---------------------------------------------------------------------------
alter table public.game_rounds enable row level security;
alter table public.bets enable row level security;
alter table public.bet_outcomes enable row level security;
alter table public.receipts enable row level security;

revoke all on public.game_rounds, public.bets, public.bet_outcomes, public.receipts
  from anon, authenticated;
grant all on public.game_rounds, public.bets, public.bet_outcomes, public.receipts
  to service_role;
grant select on public.game_rounds, public.bets, public.bet_outcomes, public.receipts
  to authenticated;

-- Rounds: visible to a participant or to game admins.
create policy rounds_select_participant on public.game_rounds
  for select to authenticated
  using (
    public.has_permission('games.view')
    or exists (
      select 1 from public.bets b
      where b.round_id = game_rounds.id and b.player_id = auth.uid()
    )
  );

create policy bets_select_own on public.bets
  for select to authenticated using (player_id = auth.uid());
create policy bets_select_admin on public.bets
  for select to authenticated
  using (public.has_permission('games.view') or public.has_permission('credits.view'));

create policy bet_outcomes_select_own on public.bet_outcomes
  for select to authenticated
  using (exists (
    select 1 from public.bets b
    where b.id = bet_outcomes.bet_id and b.player_id = auth.uid()
  ));
create policy bet_outcomes_select_admin on public.bet_outcomes
  for select to authenticated using (public.has_permission('games.view'));

create policy receipts_select_own on public.receipts
  for select to authenticated using (player_id = auth.uid());
create policy receipts_select_admin on public.receipts
  for select to authenticated
  using (public.has_permission('games.view') or public.has_permission('credits.view'));
