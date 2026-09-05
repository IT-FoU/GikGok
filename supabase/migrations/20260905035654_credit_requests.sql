-- GIKGOK — demo-credit requests and admin reviews
-- These are SIMULATED credit grants (demo GIK only). No payment ever occurs.

create type public.credit_request_status as enum (
  'pending', 'approved', 'rejected', 'cancelled'
);

create table public.credit_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  requested_amount bigint not null check (requested_amount > 0),
  note text,
  status public.credit_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index credit_requests_player_idx on public.credit_requests (player_id, created_at desc);
create index credit_requests_status_idx on public.credit_requests (status);
-- A player may have at most one open (pending) request at a time.
create unique index credit_requests_one_open
  on public.credit_requests (player_id)
  where status = 'pending';

create trigger credit_requests_set_updated_at
  before update on public.credit_requests
  for each row execute function public.set_updated_at();

create table public.credit_request_reviews (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.credit_requests (id) on delete cascade,
  reviewer_id uuid not null references auth.users (id),
  decision public.credit_request_status not null
    check (decision in ('approved', 'rejected')),
  gross_amount bigint check (gross_amount is null or gross_amount >= 0),
  fee_percent numeric(5, 2) check (fee_percent is null or (fee_percent >= 0 and fee_percent <= 100)),
  fee_amount bigint check (fee_amount is null or fee_amount >= 0),
  bonus_amount bigint not null default 0 check (bonus_amount >= 0),
  net_amount bigint check (net_amount is null or net_amount >= 0),
  reason text not null,
  is_second_approval boolean not null default false,
  created_at timestamptz not null default now()
);

create index credit_request_reviews_request_idx on public.credit_request_reviews (request_id);
create index credit_request_reviews_reviewer_idx on public.credit_request_reviews (reviewer_id);

-- ---------------------------------------------------------------------------
-- Player self-service cancel (only own pending request)
-- ---------------------------------------------------------------------------
create or replace function public.cancel_credit_request(p_request_id uuid)
returns public.credit_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.credit_requests;
begin
  update public.credit_requests
  set status = 'cancelled'
  where id = p_request_id
    and player_id = auth.uid()
    and status = 'pending'
  returning * into v_row;

  if not found then
    raise exception 'No cancellable pending request found for current user'
      using errcode = 'no_data_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.cancel_credit_request(uuid) from public;
grant execute on function public.cancel_credit_request(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RLS + grants (player creates/reads own; admin reviews server-side)
-- ---------------------------------------------------------------------------
alter table public.credit_requests enable row level security;
alter table public.credit_request_reviews enable row level security;

revoke all on public.credit_requests, public.credit_request_reviews
  from anon, authenticated;
grant all on public.credit_requests, public.credit_request_reviews to service_role;

-- Player may create a request (status forced to default 'pending' — no status grant).
grant select on public.credit_requests to authenticated;
grant insert (player_id, requested_amount, note) on public.credit_requests to authenticated;
grant select on public.credit_request_reviews to authenticated;

create policy credit_requests_insert_own on public.credit_requests
  for insert to authenticated with check (player_id = auth.uid());
create policy credit_requests_select_own on public.credit_requests
  for select to authenticated using (player_id = auth.uid());
create policy credit_requests_select_admin on public.credit_requests
  for select to authenticated using (public.has_permission('credits.view'));

create policy credit_reviews_select_own on public.credit_request_reviews
  for select to authenticated
  using (exists (
    select 1 from public.credit_requests r
    where r.id = credit_request_reviews.request_id and r.player_id = auth.uid()
  ));
create policy credit_reviews_select_admin on public.credit_request_reviews
  for select to authenticated using (public.has_permission('credits.view'));
