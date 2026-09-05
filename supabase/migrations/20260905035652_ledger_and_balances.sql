-- GIKGOK — immutable GIK ledger and derived balance projection
-- GIK are demo credits with no monetary value. Balances are DERIVED from the
-- append-only ledger; player balances are never edited directly.

create type public.ledger_entry_type as enum (
  'welcome_credit',
  'daily_reward',
  'mission_reward',
  'achievement_reward',
  'demo_credit_grant',
  'simulation_fee',
  'bet_debit',
  'game_payout',
  'admin_adjustment',
  'reset_demo_data'
);

-- ---------------------------------------------------------------------------
-- Balance projection (maintained by the ledger trigger)
-- ---------------------------------------------------------------------------
create table public.player_balances (
  player_id uuid primary key references public.profiles (id) on delete cascade,
  balance bigint not null default 0 check (balance >= 0),
  lifetime_credited bigint not null default 0,
  lifetime_debited bigint not null default 0,
  total_wagered bigint not null default 0,
  total_won bigint not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.player_balances is
  'Derived projection of gik_ledger. Never written by clients; maintained by trigger.';

-- ---------------------------------------------------------------------------
-- Immutable ledger
-- ---------------------------------------------------------------------------
create table public.gik_ledger (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  player_id uuid not null references public.profiles (id) on delete cascade,
  entry_type public.ledger_entry_type not null,
  amount bigint not null,
  balance_after bigint not null,
  source text,
  reference_id uuid,
  actor_id uuid references auth.users (id),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gik_ledger_amount_nonzero check (amount <> 0)
);

create index gik_ledger_player_created_idx on public.gik_ledger (player_id, created_at desc);
create index gik_ledger_player_seq_idx on public.gik_ledger (player_id, seq);
create index gik_ledger_type_idx on public.gik_ledger (entry_type);
create index gik_ledger_reference_idx on public.gik_ledger (reference_id);
-- Idempotency: a given (reference_id, entry_type) settles at most once.
create unique index gik_ledger_reference_type_unique
  on public.gik_ledger (reference_id, entry_type)
  where reference_id is not null;

-- ---------------------------------------------------------------------------
-- Balance trigger: compute balance_after, prevent negative balance, update projection
-- ---------------------------------------------------------------------------
create or replace function public.apply_ledger_entry()
returns trigger
language plpgsql
as $$
declare
  prev_balance bigint;
  next_balance bigint;
begin
  insert into public.player_balances (player_id)
  values (new.player_id)
  on conflict (player_id) do nothing;

  select balance into prev_balance
  from public.player_balances
  where player_id = new.player_id
  for update;

  next_balance := prev_balance + new.amount;

  if next_balance < 0 then
    raise exception 'Insufficient GIK credits for player % (balance %, delta %)',
      new.player_id, prev_balance, new.amount
      using errcode = 'check_violation';
  end if;

  new.balance_after := next_balance;

  update public.player_balances
  set balance = next_balance,
      lifetime_credited = lifetime_credited + greatest(new.amount, 0),
      lifetime_debited = lifetime_debited + greatest(-new.amount, 0),
      total_wagered = total_wagered
        + case when new.entry_type = 'bet_debit' then -new.amount else 0 end,
      total_won = total_won
        + case when new.entry_type = 'game_payout' then new.amount else 0 end,
      updated_at = now()
  where player_id = new.player_id;

  return new;
end;
$$;

create trigger gik_ledger_apply
  before insert on public.gik_ledger
  for each row execute function public.apply_ledger_entry();

-- Enforce append-only (blocks UPDATE/DELETE for every role, including service_role).
create trigger gik_ledger_block_update
  before update on public.gik_ledger
  for each row execute function public.prevent_mutation();
create trigger gik_ledger_block_delete
  before delete on public.gik_ledger
  for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- Server-side append helper (used by SECURITY DEFINER settlement functions)
-- ---------------------------------------------------------------------------
create or replace function public.append_ledger_entry(
  p_player_id uuid,
  p_entry_type public.ledger_entry_type,
  p_amount bigint,
  p_source text default null,
  p_reference_id uuid default null,
  p_actor_id uuid default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.gik_ledger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.gik_ledger;
begin
  insert into public.gik_ledger (
    player_id, entry_type, amount, balance_after,
    source, reference_id, actor_id, reason, metadata
  )
  values (
    p_player_id, p_entry_type, p_amount, 0, -- balance_after set by trigger
    p_source, p_reference_id, p_actor_id, p_reason, coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function public.append_ledger_entry is
  'Server-only atomic ledger append. Balance is computed by trigger. Not exposed to anon/authenticated.';
revoke all on function public.append_ledger_entry(
  uuid, public.ledger_entry_type, bigint, text, uuid, uuid, text, jsonb
) from public;
grant execute on function public.append_ledger_entry(
  uuid, public.ledger_entry_type, bigint, text, uuid, uuid, text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.gik_ledger enable row level security;
alter table public.player_balances enable row level security;

revoke all on public.gik_ledger, public.player_balances from anon, authenticated;
grant all on public.gik_ledger, public.player_balances to service_role;
grant select on public.gik_ledger, public.player_balances to authenticated;

create policy ledger_select_own on public.gik_ledger
  for select to authenticated using (player_id = auth.uid());
create policy ledger_select_admin on public.gik_ledger
  for select to authenticated using (public.has_permission('credits.view'));

create policy balances_select_own on public.player_balances
  for select to authenticated using (player_id = auth.uid());
create policy balances_select_admin on public.player_balances
  for select to authenticated using (public.has_permission('credits.view'));
