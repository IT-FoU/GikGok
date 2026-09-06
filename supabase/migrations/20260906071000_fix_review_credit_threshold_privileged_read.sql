-- review_credit_request must read the dual-approval threshold as SECURITY DEFINER
-- without going through the client-restricted get_setting whitelist.

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

  -- Privileged internal read (not via client-whitelisted get_setting).
  select coalesce((s.value #>> '{}')::bigint, 500000)
    into v_threshold
  from public.system_settings s
  where s.key = 'credits.second_approval_threshold';
  v_threshold := coalesce(v_threshold, 500000);

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
  'AUTHENTICATED RPC (credits.adjust). Dual approval above credits.second_approval_threshold; rejects self-second approval. Threshold read is privileged (not client get_setting).';
