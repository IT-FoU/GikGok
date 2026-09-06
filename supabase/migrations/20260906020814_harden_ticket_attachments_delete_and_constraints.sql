-- P1: ticket attachment delete path + MIME/size DB constraints.
-- Private bucket already exists; add table DELETE RLS and content bounds.

alter table public.ticket_attachments
  drop constraint if exists ticket_attachments_mime_type_check;

alter table public.ticket_attachments
  add constraint ticket_attachments_mime_type_check
  check (mime_type in ('image/jpeg', 'image/png', 'image/webp'));

alter table public.ticket_attachments
  drop constraint if exists ticket_attachments_size_bytes_check;

alter table public.ticket_attachments
  add constraint ticket_attachments_size_bytes_check
  check (size_bytes > 0 and size_bytes <= 5242880);

grant delete on public.ticket_attachments to authenticated;

drop policy if exists ticket_attachments_delete on public.ticket_attachments;
create policy ticket_attachments_delete
  on public.ticket_attachments
  for delete
  to authenticated
  using (
    uploaded_by = (select auth.uid())
    or public.has_permission('tickets.manage'::public.app_permission)
  );

-- Ticket-level attachment cap (in addition to per-message trigger): max 3 per ticket.
create or replace function public.enforce_ticket_attachment_limit()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
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

drop trigger if exists ticket_attachments_ticket_limit on public.ticket_attachments;
create trigger ticket_attachments_ticket_limit
  before insert on public.ticket_attachments
  for each row execute function public.enforce_ticket_attachment_limit();

revoke all on function public.enforce_ticket_attachment_limit() from public, anon, authenticated;
