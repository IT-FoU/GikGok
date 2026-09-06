-- Harden storage_orphan_objects authorization and recording surface.
-- Forward-only; staging project jlpcfatcpymjnjbxmclo.
-- Existing orphan rows are treated as untrusted until revalidated by cleanup RPCs.

-- 1) Actor column + bounded text constraints
alter table public.storage_orphan_objects
  add column if not exists recorded_by uuid null references auth.users(id);

alter table public.storage_orphan_objects
  drop constraint if exists storage_orphan_objects_bucket_len_check;
alter table public.storage_orphan_objects
  add constraint storage_orphan_objects_bucket_len_check
  check (char_length(bucket_id) between 1 and 64);

alter table public.storage_orphan_objects
  drop constraint if exists storage_orphan_objects_path_len_check;
alter table public.storage_orphan_objects
  add constraint storage_orphan_objects_path_len_check
  check (char_length(object_path) between 1 and 512);

alter table public.storage_orphan_objects
  drop constraint if exists storage_orphan_objects_source_len_check;
alter table public.storage_orphan_objects
  add constraint storage_orphan_objects_source_len_check
  check (char_length(source) between 1 and 64);

alter table public.storage_orphan_objects
  drop constraint if exists storage_orphan_objects_error_len_check;
alter table public.storage_orphan_objects
  add constraint storage_orphan_objects_error_len_check
  check (last_error is null or char_length(last_error) <= 1000);

-- Deduplicate unresolved orphans by bucket+path
create unique index if not exists storage_orphan_objects_unresolved_uidx
  on public.storage_orphan_objects (bucket_id, object_path)
  where resolved_at is null;

-- 2) Revoke direct authenticated writes; SELECT only for tickets.manage
revoke all on table public.storage_orphan_objects from public, anon, authenticated;
grant select on table public.storage_orphan_objects to authenticated;
grant all on table public.storage_orphan_objects to service_role;

drop policy if exists storage_orphan_objects_insert_own on public.storage_orphan_objects;
drop policy if exists storage_orphan_objects_update_admin on public.storage_orphan_objects;
drop policy if exists storage_orphan_objects_select_admin on public.storage_orphan_objects;

create policy storage_orphan_objects_select_admin
  on public.storage_orphan_objects
  for select
  to authenticated
  using (public.has_permission('tickets.manage'::public.app_permission));

-- No INSERT/UPDATE/DELETE policies for authenticated (writes only via DEFINER RPCs).

-- 3) Path / ownership helpers (internal)
create or replace function public.storage_orphan_path_segments(p_path text)
returns table (ticket_id uuid, uploader_id uuid, file_name text)
language plpgsql
immutable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_ticket text;
  v_uploader text;
  v_file text;
begin
  if p_path is null or char_length(p_path) > 512 then
    return;
  end if;
  if p_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$' then
    return;
  end if;
  v_ticket := split_part(p_path, '/', 1);
  v_uploader := split_part(p_path, '/', 2);
  v_file := split_part(p_path, '/', 3);
  ticket_id := v_ticket::uuid;
  uploader_id := v_uploader::uuid;
  file_name := v_file;
  return next;
end;
$$;

revoke all on function public.storage_orphan_path_segments(text) from public, anon, authenticated;
grant execute on function public.storage_orphan_path_segments(text) to service_role;

comment on function public.storage_orphan_path_segments(text) is
  'INTERNAL. Parse ticket-attachments object paths. Not granted to authenticated.';

create or replace function public.assert_can_record_ticket_attachment_orphan(
  p_path text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_seg record;
  v_ticket public.support_tickets;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_seg from public.storage_orphan_path_segments(p_path);
  if not found then
    raise exception 'invalid attachment object path' using errcode = 'check_violation';
  end if;

  select * into v_ticket
  from public.support_tickets t
  where t.id = v_seg.ticket_id;

  if found then
    if v_ticket.player_id = v_uid
       or v_seg.uploader_id = v_uid
       or public.has_permission('tickets.manage'::public.app_permission, v_uid) then
      return;
    end if;
    raise exception 'not authorized to record orphan for this path'
      using errcode = 'insufficient_privilege';
  end if;

  -- Ticket gone: only the path uploader or tickets.manage may record.
  if v_seg.uploader_id = v_uid
     or public.has_permission('tickets.manage'::public.app_permission, v_uid) then
    return;
  end if;

  raise exception 'not authorized to record orphan for this path'
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function public.assert_can_record_ticket_attachment_orphan(text)
  from public, anon, authenticated;
grant execute on function public.assert_can_record_ticket_attachment_orphan(text) to service_role;

comment on function public.assert_can_record_ticket_attachment_orphan(text) is
  'INTERNAL. Ownership gate for orphan recording. Not granted to authenticated.';

-- 4) Hardened record_storage_orphan (authenticated RPC)
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
  v_uid uuid := auth.uid();
  v_bucket text := lower(trim(coalesce(p_bucket, '')));
  v_path text := trim(coalesce(p_path, ''));
  v_source text := trim(coalesce(p_source, ''));
  v_error text := nullif(left(trim(coalesce(p_error, '')), 1000), '');
  v_allowed_sources text[] := array[
    'ticket_attachment_delete',
    'ticket_attachment_upload_rollback',
    'ticket_attachment_insert_failure',
    'ticket_attachment_admin_retry'
  ];
  v_existing uuid;
  v_rid uuid;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;

  if v_bucket <> 'ticket-attachments' then
    raise exception 'bucket not allowed' using errcode = 'check_violation';
  end if;

  if char_length(v_path) < 1 or char_length(v_path) > 512 then
    raise exception 'path length invalid' using errcode = 'check_violation';
  end if;

  if v_source = any (v_allowed_sources) is not true then
    raise exception 'source not allowed' using errcode = 'check_violation';
  end if;

  perform public.assert_can_record_ticket_attachment_orphan(v_path);

  select id into v_existing
  from public.storage_orphan_objects
  where bucket_id = v_bucket
    and object_path = v_path
    and resolved_at is null
  for update;

  if found then
    update public.storage_orphan_objects
    set last_error = coalesce(v_error, last_error),
        source = v_source,
        source_id = coalesce(p_source_id, source_id),
        recorded_by = coalesce(recorded_by, v_uid),
        next_retry_at = now()
    where id = v_existing;
    return v_existing;
  end if;

  insert into public.storage_orphan_objects (
    bucket_id, object_path, source, source_id, last_error, recorded_by
  )
  values (v_bucket, v_path, v_source, p_source_id, v_error, v_uid)
  returning id into v_rid;

  return v_rid;
end;
$$;

comment on function public.record_storage_orphan(text, text, text, uuid, text) is
  'AUTHENTICATED RPC. Records ticket-attachment Storage orphans for the caller''s owned path only. Deduplicates unresolved (bucket,path). Does not authorize deletion.';

revoke all on function public.record_storage_orphan(text, text, text, uuid, text)
  from public, anon;
grant execute on function public.record_storage_orphan(text, text, text, uuid, text)
  to authenticated, service_role;

-- 5) Validate orphan is safe to delete (orphan row alone is NOT enough)
create or replace function public.validate_storage_orphan_for_deletion(p_orphan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.storage_orphan_objects;
  v_seg record;
  v_ticket public.support_tickets;
  v_active boolean;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_permission('tickets.manage'::public.app_permission, v_uid) then
    raise exception 'tickets.manage required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row
  from public.storage_orphan_objects
  where id = p_orphan_id
  for update;

  if not found then
    raise exception 'orphan not found' using errcode = 'no_data_found';
  end if;
  if v_row.resolved_at is not null then
    raise exception 'orphan already resolved' using errcode = 'check_violation';
  end if;
  if v_row.bucket_id <> 'ticket-attachments' then
    raise exception 'untrusted bucket' using errcode = 'check_violation';
  end if;

  select * into v_seg from public.storage_orphan_path_segments(v_row.object_path);
  if not found then
    raise exception 'untrusted object path' using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.ticket_attachments ta
    where ta.storage_path = v_row.object_path
  ) into v_active;

  if v_active then
    raise exception 'object still referenced by active attachment'
      using errcode = 'check_violation';
  end if;

  select * into v_ticket from public.support_tickets where id = v_seg.ticket_id;
  if found then
    if v_ticket.player_id <> v_seg.uploader_id
       and not exists (
         select 1 from public.profiles p where p.id = v_seg.uploader_id
       ) then
      raise exception 'untrusted attachment provenance' using errcode = 'check_violation';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'bucket_id', v_row.bucket_id,
    'object_path', v_row.object_path,
    'attempts', v_row.attempts,
    'source', v_row.source,
    'source_id', v_row.source_id
  );
end;
$$;

comment on function public.validate_storage_orphan_for_deletion(uuid) is
  'ADMIN RPC (tickets.manage). Revalidates orphan provenance before Storage delete. Orphan row alone never authorizes deletion.';

revoke all on function public.validate_storage_orphan_for_deletion(uuid)
  from public, anon;
grant execute on function public.validate_storage_orphan_for_deletion(uuid)
  to authenticated, service_role;

-- 6) Claim a bounded batch for manual admin retry (no automatic consumer)
create or replace function public.claim_storage_orphan_retry_batch(p_limit integer default 10)
returns setof jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
  r public.storage_orphan_objects;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_permission('tickets.manage'::public.app_permission, v_uid) then
    raise exception 'tickets.manage required' using errcode = 'insufficient_privilege';
  end if;

  for r in
    select *
    from public.storage_orphan_objects
    where resolved_at is null
      and next_retry_at <= now()
    order by next_retry_at asc, created_at asc
    limit v_limit
    for update skip locked
  loop
    begin
      perform public.validate_storage_orphan_for_deletion(r.id);
    exception
      when others then
        update public.storage_orphan_objects
        set attempts = attempts + 1,
            last_error = left(sqlerrm, 1000),
            next_retry_at = now() + make_interval(mins => least(60, greatest(1, attempts + 1) * 5))
        where id = r.id;
        continue;
    end;

    update public.storage_orphan_objects
    set attempts = attempts + 1,
        next_retry_at = now() + make_interval(mins => least(60, greatest(1, attempts + 1) * 5))
    where id = r.id
    returning * into r;

    return next jsonb_build_object(
      'id', r.id,
      'bucket_id', r.bucket_id,
      'object_path', r.object_path,
      'attempts', r.attempts,
      'source', r.source,
      'source_id', r.source_id
    );
  end loop;
end;
$$;

comment on function public.claim_storage_orphan_retry_batch(integer) is
  'ADMIN RPC (tickets.manage). Claims a bounded batch for MANUAL Storage cleanup retry. No automatic scheduler consumer exists.';

revoke all on function public.claim_storage_orphan_retry_batch(integer)
  from public, anon;
grant execute on function public.claim_storage_orphan_retry_batch(integer)
  to authenticated, service_role;

create or replace function public.mark_storage_orphan_resolved(
  p_orphan_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_permission('tickets.manage'::public.app_permission, v_uid) then
    raise exception 'tickets.manage required' using errcode = 'insufficient_privilege';
  end if;

  if exists (
    select 1
    from public.storage_orphan_objects o
    join public.ticket_attachments ta on ta.storage_path = o.object_path
    where o.id = p_orphan_id
  ) then
    raise exception 'object still referenced by active attachment'
      using errcode = 'check_violation';
  end if;

  update public.storage_orphan_objects
  set resolved_at = now(),
      last_error = case
        when p_note is null then last_error
        else left(p_note, 1000)
      end
  where id = p_orphan_id
    and resolved_at is null;

  if not found then
    raise exception 'orphan not found or already resolved' using errcode = 'no_data_found';
  end if;

  perform public.write_audit(
    'storage_orphan.resolve',
    'storage_orphan_objects',
    p_orphan_id::text,
    null,
    jsonb_build_object('note', p_note),
    coalesce(p_note, 'resolved')
  );
end;
$$;

comment on function public.mark_storage_orphan_resolved(uuid, text) is
  'ADMIN RPC (tickets.manage). Marks an orphan resolved after successful Storage delete.';

revoke all on function public.mark_storage_orphan_resolved(uuid, text)
  from public, anon;
grant execute on function public.mark_storage_orphan_resolved(uuid, text)
  to authenticated, service_role;

create or replace function public.mark_storage_orphan_retry_failed(
  p_orphan_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_permission('tickets.manage'::public.app_permission, v_uid) then
    raise exception 'tickets.manage required' using errcode = 'insufficient_privilege';
  end if;

  update public.storage_orphan_objects
  set last_error = left(coalesce(nullif(trim(p_error), ''), 'retry failed'), 1000),
      next_retry_at = now() + make_interval(mins => least(60, greatest(1, attempts) * 5))
  where id = p_orphan_id
    and resolved_at is null;

  if not found then
    raise exception 'orphan not found or already resolved' using errcode = 'no_data_found';
  end if;
end;
$$;

comment on function public.mark_storage_orphan_retry_failed(uuid, text) is
  'ADMIN RPC (tickets.manage). Records a failed manual Storage cleanup attempt with backoff.';

revoke all on function public.mark_storage_orphan_retry_failed(uuid, text)
  from public, anon;
grant execute on function public.mark_storage_orphan_retry_failed(uuid, text)
  to authenticated, service_role;

-- 7) Dual-approval: reject self-second / duplicate approval by the same reviewer
create or replace function public.review_credit_request(
  p_request_id uuid,
  p_decision public.credit_request_status,
  p_gross bigint default null,
  p_fee_percent numeric default 0,
  p_bonus bigint default 0,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.credit_requests;
  v_fee bigint;
  v_net bigint;
  v_threshold bigint;
  v_prior_approvals integer;
  v_self_approvals integer;
  v_is_second boolean := false;
  v_review_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;
  if not public.has_permission('credits.adjust'::public.app_permission) then
    raise exception 'Not authorized' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reason is required' using errcode = 'check_violation';
  end if;

  select * into v_req from public.credit_requests where id = p_request_id for update;
  if not found then
    raise exception 'Credit request not found' using errcode = 'no_data_found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Credit request is not pending' using errcode = 'check_violation';
  end if;

  if p_decision = 'rejected' then
    insert into public.credit_request_reviews (request_id, reviewer_id, decision, reason)
    values (p_request_id, v_uid, 'rejected', p_reason)
    returning id into v_review_id;

    update public.credit_requests set status = 'rejected' where id = p_request_id;

    insert into public.notifications (player_id, type, title, body)
    values (v_req.player_id, 'credit_request', 'Credit request rejected', p_reason);

    perform public.write_audit('credit_request.reject', 'credit_request',
      p_request_id::text, to_jsonb(v_req), null, p_reason);

    return jsonb_build_object('status', 'rejected', 'review_id', v_review_id);
  end if;

  if p_decision <> 'approved' then
    raise exception 'Decision must be approved or rejected' using errcode = 'check_violation';
  end if;

  select count(*) into v_self_approvals
  from public.credit_request_reviews
  where request_id = p_request_id
    and decision = 'approved'
    and reviewer_id = v_uid;

  if v_self_approvals > 0 then
    raise exception 'Self second approval is not allowed'
      using errcode = 'check_violation';
  end if;

  p_gross := coalesce(p_gross, v_req.requested_amount);
  v_fee := floor(p_gross * coalesce(p_fee_percent, 0) / 100.0)::bigint;
  v_net := p_gross - v_fee + coalesce(p_bonus, 0);
  v_threshold := coalesce(
    (public.get_setting('credits.second_approval_threshold') #>> '{}')::bigint, 500000);

  if v_net > v_threshold then
    select count(*) into v_prior_approvals
    from public.credit_request_reviews
    where request_id = p_request_id and decision = 'approved'
      and reviewer_id <> v_uid;

    if v_prior_approvals = 0 then
      insert into public.credit_request_reviews (
        request_id, reviewer_id, decision, gross_amount, fee_percent,
        fee_amount, bonus_amount, net_amount, reason, is_second_approval
      )
      values (p_request_id, v_uid, 'approved', p_gross, p_fee_percent,
        v_fee, coalesce(p_bonus, 0), v_net, p_reason, false)
      returning id into v_review_id;

      perform public.write_audit('credit_request.first_approval', 'credit_request',
        p_request_id::text, null, to_jsonb(v_net), p_reason);

      return jsonb_build_object(
        'status', 'pending_second_approval', 'net_amount', v_net, 'review_id', v_review_id);
    else
      v_is_second := true;
    end if;
  end if;

  perform public.append_ledger_entry(
    v_req.player_id, 'demo_credit_grant', p_gross, 'credit_request',
    p_request_id, v_uid, p_reason,
    jsonb_build_object('kind', 'grant'));

  if v_fee > 0 then
    perform public.append_ledger_entry(
      v_req.player_id, 'simulation_fee', -v_fee, 'credit_request',
      p_request_id, v_uid, 'Simulation fee',
      jsonb_build_object('fee_percent', p_fee_percent));
  end if;

  insert into public.credit_request_reviews (
    request_id, reviewer_id, decision, gross_amount, fee_percent,
    fee_amount, bonus_amount, net_amount, reason, is_second_approval
  )
  values (p_request_id, v_uid, 'approved', p_gross, p_fee_percent,
    v_fee, coalesce(p_bonus, 0), v_net, p_reason, v_is_second)
  returning id into v_review_id;

  if coalesce(p_bonus, 0) > 0 then
    perform public.append_ledger_entry(
      v_req.player_id, 'demo_credit_grant', p_bonus, 'credit_request_bonus',
      v_review_id, v_uid, 'Bonus credit',
      jsonb_build_object('kind', 'bonus'));
  end if;

  update public.credit_requests set status = 'approved' where id = p_request_id;

  insert into public.notifications (player_id, type, title, body)
  values (v_req.player_id, 'credit_request', 'Credit request approved',
    format('Net %s GIK credited.', v_net));

  perform public.write_audit('credit_request.approve', 'credit_request',
    p_request_id::text, to_jsonb(v_req), to_jsonb(v_net), p_reason,
    jsonb_build_object('is_second_approval', v_is_second));

  return jsonb_build_object(
    'status', 'approved', 'gross', p_gross, 'fee', v_fee,
    'bonus', coalesce(p_bonus, 0), 'net', v_net,
    'is_second_approval', v_is_second, 'review_id', v_review_id);
end;
$$;

comment on function public.review_credit_request(uuid, public.credit_request_status, bigint, numeric, bigint, text) is
  'AUTHENTICATED RPC (credits.adjust). Dual approval for nets above threshold; rejects self-second approval and non-pending requests.';
