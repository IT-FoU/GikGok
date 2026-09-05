-- GIKGOK — support tickets, threaded messages, and attachments

create type public.ticket_status as enum (
  'open', 'in_progress', 'waiting_for_player', 'resolved', 'closed'
);
create type public.ticket_category as enum (
  'general', 'account', 'credits', 'games', 'technical', 'other'
);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  category public.ticket_category not null default 'general',
  subject text not null,
  status public.ticket_status not null default 'open',
  assigned_admin uuid references auth.users (id),
  satisfaction_rating smallint check (satisfaction_rating between 1 and 5),
  satisfaction_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);

create index support_tickets_player_idx on public.support_tickets (player_id, created_at desc);
create index support_tickets_status_idx on public.support_tickets (status);
create index support_tickets_assigned_idx on public.support_tickets (assigned_admin);

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();

create table public.ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid not null references auth.users (id),
  author_role text not null default 'player' check (author_role in ('player', 'admin')),
  body text not null,
  created_at timestamptz not null default now()
);

create index ticket_messages_ticket_idx on public.ticket_messages (ticket_id, created_at);

create table public.ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  message_id uuid references public.ticket_messages (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  uploaded_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index ticket_attachments_ticket_idx on public.ticket_attachments (ticket_id);

-- Enforce max 3 attachments per message (requirement).
create or replace function public.enforce_attachment_limit()
returns trigger
language plpgsql
as $$
begin
  if new.message_id is not null
     and (select count(*) from public.ticket_attachments
          where message_id = new.message_id) >= 3 then
    raise exception 'A message may have at most 3 attachments'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger ticket_attachments_limit
  before insert on public.ticket_attachments
  for each row execute function public.enforce_attachment_limit();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.support_tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.ticket_attachments enable row level security;

revoke all on public.support_tickets, public.ticket_messages, public.ticket_attachments
  from anon, authenticated;
grant all on public.support_tickets, public.ticket_messages, public.ticket_attachments
  to service_role;

grant select on public.support_tickets to authenticated;
grant insert (player_id, category, subject) on public.support_tickets to authenticated;
grant update (satisfaction_rating, satisfaction_comment) on public.support_tickets to authenticated;
grant select, insert on public.ticket_messages to authenticated;
grant select, insert on public.ticket_attachments to authenticated;

-- Tickets: owner or tickets.manage admins.
create policy tickets_select_own on public.support_tickets
  for select to authenticated using (player_id = auth.uid());
create policy tickets_select_admin on public.support_tickets
  for select to authenticated using (public.has_permission('tickets.manage'));
create policy tickets_insert_own on public.support_tickets
  for insert to authenticated with check (player_id = auth.uid());
create policy tickets_update_own_feedback on public.support_tickets
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

-- Messages: visible/insertable by ticket owner or managing admins.
create policy ticket_messages_select on public.ticket_messages
  for select to authenticated
  using (
    public.has_permission('tickets.manage')
    or exists (
      select 1 from public.support_tickets t
      where t.id = ticket_messages.ticket_id and t.player_id = auth.uid()
    )
  );
create policy ticket_messages_insert on public.ticket_messages
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.has_permission('tickets.manage')
      or exists (
        select 1 from public.support_tickets t
        where t.id = ticket_messages.ticket_id and t.player_id = auth.uid()
      )
    )
  );

-- Attachments: same participant access.
create policy ticket_attachments_select on public.ticket_attachments
  for select to authenticated
  using (
    public.has_permission('tickets.manage')
    or exists (
      select 1 from public.support_tickets t
      where t.id = ticket_attachments.ticket_id and t.player_id = auth.uid()
    )
  );
create policy ticket_attachments_insert on public.ticket_attachments
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and (
      public.has_permission('tickets.manage')
      or exists (
        select 1 from public.support_tickets t
        where t.id = ticket_attachments.ticket_id and t.player_id = auth.uid()
      )
    )
  );
