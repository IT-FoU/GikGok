-- Phase 2 — Auth lifecycle RPCs adapted to the staging schema.
-- Uses player_contacts for verification, player_settings for preferences,
-- gik_ledger via append_ledger_entry for exactly-once welcome credit.
-- SECURITY DEFINER functions pin search_path; PUBLIC EXECUTE revoked.

-- ---------------------------------------------------------------------------
-- Profile columns for welcome-credit idempotency (ledger remains source of truth)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists welcome_credit_granted_at timestamptz;

comment on column public.profiles.welcome_credit_granted_at is
  'Set once when welcome_credit ledger entry is granted; null until verified grant.';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.get_welcome_credit_amount()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select (value #>> '{}')::bigint
       from public.system_settings
      where key = 'rewards.welcome_credit'),
    50000
  );
$$;

comment on function public.get_welcome_credit_amount() is
  'Owner-configurable welcome GIK amount (demo credits only).';

-- ---------------------------------------------------------------------------
-- Complete onboarding profile + primary contact after signup
-- ---------------------------------------------------------------------------
create or replace function public.complete_player_onboarding(
  p_nickname text,
  p_contact_type public.contact_type,
  p_contact_value text,
  p_avatar_preset text default 'lotus'
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := trim(p_nickname);
  v_value extensions.citext;
  v_row public.profiles;
  v_contact_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  if v_nickname is null
     or char_length(v_nickname) < 2
     or char_length(v_nickname) > 24 then
    raise exception 'invalid nickname' using errcode = 'check_violation';
  end if;

  if p_contact_type is null or nullif(trim(p_contact_value), '') is null then
    raise exception 'email or phone required' using errcode = 'check_violation';
  end if;

  if p_contact_type = 'email' then
    v_value := lower(trim(p_contact_value));
  else
    v_value := trim(p_contact_value);
  end if;

  if exists (
    select 1 from public.profiles
    where nickname = v_nickname::extensions.citext
      and id is distinct from v_uid
      and status <> 'deleted'
  ) then
    raise exception 'nickname already taken' using errcode = 'unique_violation';
  end if;

  if exists (
    select 1 from public.player_contacts
    where contact_type = p_contact_type
      and value = v_value
      and is_verified
      and player_id is distinct from v_uid
  ) then
    if p_contact_type = 'email' then
      raise exception 'verified email already registered to another account'
        using errcode = 'unique_violation';
    else
      raise exception 'verified phone already registered to another account'
        using errcode = 'unique_violation';
    end if;
  end if;

  update public.profiles
  set nickname = v_nickname::extensions.citext,
      avatar_kind = 'preset',
      avatar_preset = coalesce(nullif(trim(p_avatar_preset), ''), 'lotus'),
      avatar_url = null,
      updated_at = now()
  where id = v_uid
  returning * into v_row;

  if not found then
    raise exception 'profile not found' using errcode = 'no_data_found';
  end if;

  insert into public.player_settings (player_id)
  values (v_uid)
  on conflict (player_id) do nothing;

  insert into public.player_balances (player_id)
  values (v_uid)
  on conflict (player_id) do nothing;

  select id into v_contact_id
  from public.player_contacts
  where player_id = v_uid
    and contact_type = p_contact_type
    and is_primary
  for update;

  if v_contact_id is null then
    insert into public.player_contacts (
      player_id, contact_type, value, is_primary, is_verified
    )
    values (v_uid, p_contact_type, v_value, true, false);
  else
    update public.player_contacts
    set value = v_value,
        updated_at = now()
    where id = v_contact_id;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mark a contact verified after successful OTP / email confirmation
-- ---------------------------------------------------------------------------
create or replace function public.mark_contact_verified(
  p_channel text,
  p_user_id uuid default auth.uid()
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_type public.contact_type;
  v_profile public.profiles;
  v_contact public.player_contacts;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  if auth.uid() is distinct from v_uid
     and not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;

  if p_channel not in ('email', 'phone') then
    raise exception 'channel must be email or phone' using errcode = 'check_violation';
  end if;

  v_type := p_channel::public.contact_type;

  select * into v_profile
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'no_data_found';
  end if;

  if v_profile.status in ('suspended', 'banned', 'deleted') then
    raise exception 'account is %', v_profile.status using errcode = 'check_violation';
  end if;

  select * into v_contact
  from public.player_contacts
  where player_id = v_uid
    and contact_type = v_type
    and is_primary
  for update;

  if not found then
    raise exception 'no % on profile', p_channel using errcode = 'no_data_found';
  end if;

  if exists (
    select 1 from public.player_contacts
    where contact_type = v_type
      and value = v_contact.value
      and is_verified
      and player_id is distinct from v_uid
  ) then
    if v_type = 'email' then
      raise exception 'verified email already registered to another account'
        using errcode = 'unique_violation';
    else
      raise exception 'verified phone already registered to another account'
        using errcode = 'unique_violation';
    end if;
  end if;

  update public.player_contacts
  set is_verified = true,
      verified_at = coalesce(verified_at, now()),
      updated_at = now()
  where id = v_contact.id;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Exactly-once welcome credit after at least one verified contact
-- ---------------------------------------------------------------------------
create or replace function public.grant_welcome_credit(
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_profile public.profiles;
  v_amount bigint;
  v_ledger public.gik_ledger;
  v_verified boolean;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  if auth.uid() is distinct from v_uid
     and not public.is_admin() then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'no_data_found';
  end if;

  if v_profile.status is distinct from 'active' then
    raise exception 'account is not active' using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.player_contacts
    where player_id = v_uid and is_verified
  ) into v_verified;

  if not v_verified then
    raise exception 'verify email or phone before receiving welcome credit'
      using errcode = 'check_violation';
  end if;

  if v_profile.welcome_credit_granted_at is not null
     or exists (
       select 1 from public.gik_ledger
       where player_id = v_uid and entry_type = 'welcome_credit'
     ) then
    if v_profile.welcome_credit_granted_at is null then
      update public.profiles
      set welcome_credit_granted_at = now(), updated_at = now()
      where id = v_uid;
    end if;
    return jsonb_build_object(
      'granted', false,
      'already_granted', true,
      'amount', 0
    );
  end if;

  v_amount := public.get_welcome_credit_amount();
  if v_amount is null or v_amount <= 0 then
    return jsonb_build_object(
      'granted', false,
      'already_granted', false,
      'amount', 0,
      'disabled', true
    );
  end if;

  v_ledger := public.append_ledger_entry(
    v_uid,
    'welcome_credit',
    v_amount,
    'welcome_credit',
    v_uid,
    v_uid,
    'Verified player welcome credit',
    jsonb_build_object('kind', 'welcome_credit')
  );

  update public.profiles
  set welcome_credit_granted_at = now(),
      updated_at = now()
  where id = v_uid;

  perform public.write_audit(
    'credits.welcome_grant',
    'profile',
    v_uid::text,
    null,
    jsonb_build_object('amount', v_amount, 'ledger_entry_id', v_ledger.id),
    null,
    null,
    'success'
  );

  return jsonb_build_object(
    'granted', true,
    'already_granted', false,
    'amount', v_amount,
    'ledger_entry_id', v_ledger.id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Soft deletion request — preserves ledger + audit
-- ---------------------------------------------------------------------------
create or replace function public.request_account_deletion(
  p_reason text default null,
  p_user_id uuid default auth.uid()
)
returns public.profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_row public.profiles;
begin
  if v_uid is null then
    raise exception 'Authentication required' using errcode = 'insufficient_privilege';
  end if;

  if auth.uid() is distinct from v_uid then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;

  select * into v_row
  from public.profiles
  where id = v_uid
  for update;

  if not found then
    raise exception 'profile not found' using errcode = 'no_data_found';
  end if;

  if v_row.status in ('deletion_requested', 'deleted') then
    return v_row;
  end if;

  update public.profiles
  set status = 'deletion_requested',
      suspended_reason = coalesce(nullif(trim(p_reason), ''), suspended_reason),
      suspended_at = coalesce(suspended_at, now()),
      nickname = left(nickname::text, 12) || '_del_' || substr(id::text, 1, 8),
      avatar_url = null,
      updated_at = now()
  where id = v_uid
  returning * into v_row;

  perform public.write_audit(
    'account.deletion_requested',
    'profile',
    v_uid::text,
    null,
    jsonb_build_object(
      'status', v_row.status,
      'ledger_preserved', true,
      'audit_preserved', true
    ),
    p_reason,
    null,
    'success'
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access / gate state for middleware and UI
-- ---------------------------------------------------------------------------
create or replace function public.get_player_access_state(
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_profile public.profiles;
  v_verified boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('authenticated', false, 'can_play', false);
  end if;

  if auth.uid() is distinct from v_uid
     and not public.is_admin()
     and coalesce(auth.jwt() ->> 'role', '') is distinct from 'service_role' then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;

  select * into v_profile from public.profiles where id = v_uid;

  if not found then
    return jsonb_build_object(
      'authenticated', true,
      'has_profile', false,
      'can_play', false,
      'reason', 'profile_required'
    );
  end if;

  select exists (
    select 1 from public.player_contacts
    where player_id = v_uid and is_verified
  ) into v_verified;

  return jsonb_build_object(
    'authenticated', true,
    'has_profile', true,
    'status', v_profile.status,
    'verified', v_verified,
    'welcome_credit_granted', v_profile.welcome_credit_granted_at is not null,
    'deletion_requested', v_profile.status in ('deletion_requested', 'deleted'),
    'can_play',
      v_profile.status = 'active'
      and v_verified
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants — revoke PUBLIC, allow authenticated + service_role
-- ---------------------------------------------------------------------------
revoke all on function public.get_welcome_credit_amount() from public;
revoke all on function public.complete_player_onboarding(text, public.contact_type, text, text) from public;
revoke all on function public.mark_contact_verified(text, uuid) from public;
revoke all on function public.grant_welcome_credit(uuid) from public;
revoke all on function public.request_account_deletion(text, uuid) from public;
revoke all on function public.get_player_access_state(uuid) from public;

grant execute on function public.get_welcome_credit_amount() to authenticated, service_role;
grant execute on function public.complete_player_onboarding(text, public.contact_type, text, text)
  to authenticated, service_role;
grant execute on function public.mark_contact_verified(text, uuid) to authenticated, service_role;
grant execute on function public.grant_welcome_credit(uuid) to authenticated, service_role;
grant execute on function public.request_account_deletion(text, uuid) to authenticated, service_role;
grant execute on function public.get_player_access_state(uuid) to authenticated, service_role;
