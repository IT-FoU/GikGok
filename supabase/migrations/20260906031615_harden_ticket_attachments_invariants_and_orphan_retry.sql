-- Ticket attachments: message/ticket coherence, concurrency-safe max-3,
-- path/filename bounds, orphan ledger for failed Storage deletes.
-- Demo GIK only. Forward-only.

-- 1) message_id must belong to the same ticket_id
create or replace function public.enforce_ticket_attachment_message_coherence()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  msg_ticket uuid;
begin
  if new.message_id is null then
    raise exception 'message_id is required' using errcode = 'check_violation';
  end if;

  select ticket_id into msg_ticket
  from public.ticket_messages
  where id = new.message_id;

  if msg_ticket is null then
    raise exception 'message_id not found' using errcode = 'foreign_key_violation';
  end if;

  if msg_ticket is distinct from new.ticket_id then
    raise exception 'message_id must belong to ticket_id'
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists ticket_attachments_message_coherence on public.ticket_attachments;
create trigger ticket_attachments_message_coherence
  before insert or update of message_id, ticket_id
  on public.ticket_attachments
  for each row execute function public.enforce_ticket_attachment_message_coherence();

revoke all on function public.enforce_ticket_attachment_message_coherence() from public, anon, authenticated;

comment on function public.enforce_ticket_attachment_message_coherence() is
  'INTERNAL: ticket_attachments.message_id must reference a message on the same ticket_id.';

-- 2) Concurrency-safe per-ticket max 3 (lock ticket row, then count)
create or replace function public.enforce_ticket_attachment_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  ticket_status text;
begin
  select status::text into ticket_status
  from public.support_tickets
  where id = new.ticket_id
  for update;

  if ticket_status is null then
    raise exception 'ticket not found' using errcode = 'foreign_key_violation';
  end if;

  if ticket_status in ('closed', 'resolved') then
    raise exception 'attachments are not allowed on closed tickets'
      using errcode = 'check_violation';
  end if;

  if (
    select count(*) from public.ticket_attachments
    where ticket_id = new.ticket_id
  ) >= 3 then
    raise exception 'A ticket may have at most 3 attachments'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.enforce_ticket_attachment_limit() is
  'INTERNAL: lock support_tickets row then enforce max 3 attachments and open status.';

-- Align / drop ambiguous per-message limit so product rule is ticket-scoped.
drop trigger if exists ticket_attachments_limit on public.ticket_attachments;

-- 3) Path / filename bounds + unique storage path
alter table public.ticket_attachments
  drop constraint if exists ticket_attachments_storage_path_format_check;

alter table public.ticket_attachments
  add constraint ticket_attachments_storage_path_format_check
  check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$'
    and char_length(storage_path) <= 512
  );

alter table public.ticket_attachments
  drop constraint if exists ticket_attachments_file_name_len_check;

alter table public.ticket_attachments
  add constraint ticket_attachments_file_name_len_check
  check (char_length(file_name) between 1 and 255);

create unique index if not exists ticket_attachments_storage_path_uidx
  on public.ticket_attachments (storage_path);

-- 4) Orphan ledger for Storage objects whose DB row is gone / upload rollback failed
create table if not exists public.storage_orphan_objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  object_path text not null,
  source text not null,
  source_id uuid null,
  last_error text null,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  next_retry_at timestamptz not null default now(),
  resolved_at timestamptz null
);

create index if not exists storage_orphan_objects_retry_idx
  on public.storage_orphan_objects (next_retry_at)
  where resolved_at is null;

alter table public.storage_orphan_objects enable row level security;

revoke all on public.storage_orphan_objects from public, anon, authenticated;
grant select, insert, update on public.storage_orphan_objects to authenticated;

-- Players/admins may record orphans for their own failed deletes/rollbacks.
drop policy if exists storage_orphan_objects_insert_own on public.storage_orphan_objects;
create policy storage_orphan_objects_insert_own
  on public.storage_orphan_objects
  for insert
  to authenticated
  with check (true);

drop policy if exists storage_orphan_objects_select_admin on public.storage_orphan_objects;
create policy storage_orphan_objects_select_admin
  on public.storage_orphan_objects
  for select
  to authenticated
  using (public.has_permission('tickets.manage'::public.app_permission));

create or replace function public.record_storage_orphan(
  p_bucket text,
  p_path text,
  p_source text,
  p_source_id uuid default null,
  p_error text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  rid uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if p_bucket is null or length(trim(p_bucket)) = 0 or p_path is null or length(trim(p_path)) = 0 then
    raise exception 'bucket and path required' using errcode = 'check_violation';
  end if;

  insert into public.storage_orphan_objects (bucket_id, object_path, source, source_id, last_error)
  values (p_bucket, p_path, coalesce(nullif(trim(p_source), ''), 'unknown'), p_source_id, p_error)
  returning id into rid;

  return rid;
end;
$$;

comment on function public.record_storage_orphan(text, text, text, uuid, text) is
  'Authenticated helper to record Storage orphans for later admin/service retry.';

revoke all on function public.record_storage_orphan(text, text, text, uuid, text) from public, anon;
grant execute on function public.record_storage_orphan(text, text, text, uuid, text) to authenticated, service_role;

-- 5) Tighten ticket-attachments bucket limits when column exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit'
  ) then
    update storage.buckets
    set file_size_limit = 5242880
    where id = 'ticket-attachments';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    update storage.buckets
    set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
    where id = 'ticket-attachments';
  end if;
end;
$$;
