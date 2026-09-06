-- Correct admin MFA contract (forward-only).
-- 2FA = Supabase Auth verified TOTP + current JWT aal2 (no code-minted stamps).
-- PIN = separate short-lived confirmation for high-impact actions.
-- Owners always fail closed when TOTP is missing/disabled or session is aal1.
-- Demo GIK only.

create or replace function public.verify_admin_2fa(p_code text)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception
    'admin 2FA confirmation via verify_admin_2fa is removed; complete Supabase Auth MFA to aal2, then use admin PIN for sensitive actions'
    using errcode = 'feature_not_supported';
end;
$$;

comment on function public.verify_admin_2fa(text) is
  'REMOVED. Do not mint otp_verified_at from caller codes. Use Auth MFA aal2 + verify_admin_pin.';

revoke all on function public.verify_admin_2fa(text) from public, anon;
grant execute on function public.verify_admin_2fa(text) to authenticated, service_role;

create or replace function public.assert_admin_sensitive()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  admin_row public.admin_users;
  sec public.admin_security;
  challenge public.admin_sensitive_challenges;
  sess text := public.admin_session_id();
  needs_2fa boolean := false;
  aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
begin
  if uid is null then
    raise exception 'admin access required' using errcode = 'insufficient_privilege';
  end if;

  select * into admin_row from public.admin_users where id = uid;
  if not found or not admin_row.is_active then
    raise exception 'admin access required' using errcode = 'insufficient_privilege';
  end if;

  select * into sec from public.admin_security where admin_id = uid;
  select * into challenge
  from public.admin_sensitive_challenges
  where admin_id = uid and session_id = sess;

  needs_2fa := coalesce(admin_row.is_owner, false)
    or coalesce(admin_row.requires_2fa, false);

  if coalesce(admin_row.requires_pin, false) then
    if coalesce(sec.pin_hash, '') = '' then
      raise exception 'admin PIN is required but not configured'
        using errcode = 'insufficient_privilege';
    end if;
    if challenge.pin_verified_at is null
       or challenge.pin_verified_at < now() - interval '5 minutes' then
      raise exception 'admin PIN verification required'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if needs_2fa then
    if not public.admin_has_verified_totp(uid) then
      raise exception 'admin 2FA is required but not enrolled'
        using errcode = 'insufficient_privilege';
    end if;
    if not coalesce(sec.totp_enabled, false) then
      raise exception 'admin 2FA is required but disabled'
        using errcode = 'insufficient_privilege';
    end if;
    if aal is distinct from 'aal2' then
      raise exception 'admin 2FA session (aal2) required'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
end;
$$;

comment on function public.assert_admin_sensitive() is
  'Fail-closed. PIN: 5-minute session confirmation. Owner/requires_2fa: Auth MFA aal2 + enrolled enabled TOTP. No otp_verified_at mint.';

create or replace function public.admin_prepare_sensitive(p_pin text, p_otp text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  pin_ok boolean;
begin
  if p_otp is not null and length(trim(p_otp)) > 0 then
    raise exception
      'OTP codes are verified by Supabase Auth MFA (aal2); do not pass p_otp to admin RPCs'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_pin is not null and length(trim(p_pin)) > 0 then
    pin_ok := public.verify_admin_pin(p_pin);
    if not coalesce(pin_ok, false) then
      raise exception 'invalid admin PIN' using errcode = 'invalid_password';
    end if;
  end if;

  perform public.assert_admin_sensitive();
end;
$$;

comment on function public.admin_prepare_sensitive(text, text) is
  'Sensitive preamble: reject p_otp, optionally verify PIN, then assert_admin_sensitive.';

revoke all on function public.admin_prepare_sensitive(text, text) from public, anon;
grant execute on function public.admin_prepare_sensitive(text, text) to authenticated, service_role;

create or replace function public.get_admin_session_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  admin_row public.admin_users;
  sec public.admin_security;
  perms text[];
  nick text;
  aal text := coalesce(auth.jwt() ->> 'aal', 'aal1');
  enrolled boolean := false;
  needs_2fa boolean := false;
begin
  if uid is null then
    return jsonb_build_object('is_admin', false);
  end if;

  select * into admin_row from public.admin_users where id = uid;
  if not found or not admin_row.is_active then
    return jsonb_build_object('is_admin', false);
  end if;

  select * into sec from public.admin_security where admin_id = uid;
  select nickname::text into nick from public.profiles where id = uid;
  enrolled := public.admin_has_verified_totp(uid);
  needs_2fa := coalesce(admin_row.is_owner, false)
    or coalesce(admin_row.requires_2fa, false);

  select coalesce(array_agg(p order by p), array[]::text[])
  into perms
  from unnest(enum_range(null::public.app_permission)) as p
  where public.has_permission(p::public.app_permission, uid);

  return jsonb_build_object(
    'is_admin', true,
    'status', case when admin_row.is_active then 'active' else 'disabled' end,
    'is_owner', admin_row.is_owner,
    'display_name', coalesce(nick, uid::text),
    'pin_set', sec.pin_hash is not null,
    'require_2fa', needs_2fa,
    'requires_pin', coalesce(admin_row.requires_pin, false),
    'totp_enabled', coalesce(sec.totp_enabled, false),
    'totp_enrolled', enrolled,
    'aal', aal,
    'mfa_ok', (not needs_2fa)
      or (enrolled and coalesce(sec.totp_enabled, false) and aal = 'aal2'),
    'large_adjustment_limit', admin_row.approval_limit,
    'permissions', to_jsonb(perms)
  );
end;
$$;

comment on function public.get_admin_session_state() is
  'Admin session snapshot including AAL / TOTP enrollment for fail-closed UI gates.';

-- Replace PIN/OTP mint preambles on sensitive RPCs.
create or replace function public.create_admin_account(
  p_user_id uuid,
  p_display_name text,
  p_role_code text default 'support_viewer'::text,
  p_is_owner boolean default false,
  p_pin text default null::text,
  p_otp text default null::text
)
returns admin_users
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  role_id uuid;
  row_out public.admin_users;
begin
  if uid is null or not public.is_owner(uid) then
    raise exception 'owner access required';
  end if;
  perform public.admin_prepare_sensitive(p_pin, p_otp);

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'user profile not found';
  end if;

  insert into public.admin_users (id, is_owner, is_active, created_by)
  values (p_user_id, p_is_owner, true, uid)
  on conflict (id) do update
  set is_active = true, is_owner = excluded.is_owner, updated_at = now()
  returning * into row_out;

  if char_length(trim(p_display_name)) >= 2 then
    update public.profiles
    set nickname = left(trim(p_display_name), 24), updated_at = now()
    where id = p_user_id;
  end if;

  select id into role_id from public.admin_roles where key = p_role_code;
  if role_id is not null then
    insert into public.admin_user_roles (admin_id, role_id, assigned_by)
    values (p_user_id, role_id, uid)
    on conflict do nothing;
  end if;

  perform public.write_audit(
    'admin.create',
    'admin_user',
    p_user_id::text,
    null,
    jsonb_build_object('role', p_role_code, 'is_owner', p_is_owner)
  );
  return row_out;
end;
$$;

create or replace function public.set_admin_status(
  p_target_admin_id uuid,
  p_status text,
  p_pin text default null::text,
  p_otp text default null::text
)
returns admin_users
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  row_out public.admin_users;
  target public.admin_users;
begin
  if uid is null or not public.has_permission('admins.manage', uid) then
    raise exception 'permission denied';
  end if;
  perform public.admin_prepare_sensitive(p_pin, p_otp);

  select * into target from public.admin_users where id = p_target_admin_id;
  if not found then raise exception 'admin not found'; end if;
  if target.is_owner then raise exception 'cannot disable owner'; end if;
  if p_status not in ('active', 'disabled') then raise exception 'invalid status'; end if;

  update public.admin_users
  set is_active = (p_status = 'active'), updated_at = now()
  where id = p_target_admin_id
  returning * into row_out;

  perform public.write_audit(
    'admin.status',
    'admin_user',
    p_target_admin_id::text,
    null,
    jsonb_build_object('status', p_status)
  );
  return row_out;
end;
$$;

create or replace function public.assign_admin_role(
  p_target_admin_id uuid,
  p_role_code text,
  p_pin text default null::text,
  p_otp text default null::text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  role_id uuid;
begin
  if uid is null or not public.has_permission('admins.manage', uid) then
    raise exception 'permission denied';
  end if;
  perform public.admin_prepare_sensitive(p_pin, p_otp);

  select id into role_id from public.admin_roles where key = p_role_code;
  if role_id is null then raise exception 'role not found'; end if;

  delete from public.admin_user_roles where admin_id = p_target_admin_id;
  insert into public.admin_user_roles (admin_id, role_id, assigned_by)
  values (p_target_admin_id, role_id, uid);

  perform public.write_audit(
    'admin.role.assign',
    'admin_user',
    p_target_admin_id::text,
    null,
    jsonb_build_object('role', p_role_code)
  );
end;
$$;

create or replace function public.set_admin_permission_override(
  p_target_admin_id uuid,
  p_permission text,
  p_granted boolean,
  p_reason text default null::text,
  p_pin text default null::text,
  p_otp text default null::text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  perm public.app_permission;
begin
  if uid is null or not public.is_owner(uid) then
    raise exception 'owner access required';
  end if;
  perform public.admin_prepare_sensitive(p_pin, p_otp);

  perm := p_permission::public.app_permission;
  insert into public.admin_user_permissions (admin_id, permission, granted, updated_by)
  values (p_target_admin_id, perm, p_granted, uid)
  on conflict (admin_id, permission) do update
  set granted = excluded.granted, updated_by = uid, updated_at = now();

  perform public.write_audit(
    'admin.permission.override',
    'admin_user',
    p_target_admin_id::text,
    null,
    jsonb_build_object('permission', p_permission, 'granted', p_granted),
    p_reason
  );
end;
$$;

create or replace function public.set_player_status_admin(
  p_player_id uuid,
  p_status text,
  p_reason text,
  p_pin text default null::text,
  p_otp text default null::text
)
returns profiles
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.has_permission('players.suspend', uid) then
    raise exception 'permission denied';
  end if;
  perform public.admin_prepare_sensitive(p_pin, p_otp);
  return public.admin_set_player_status(
    p_player_id,
    p_status::public.player_status,
    p_reason
  );
end;
$$;

create or replace function public.advance_game_release(
  p_game_id text,
  p_to_status text,
  p_pin text default null::text,
  p_otp text default null::text
)
returns games
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  game_row public.games;
  from_status text;
begin
  if uid is null or not public.has_permission('games.control', uid) then
    raise exception 'permission denied';
  end if;
  if p_otp is not null and length(trim(p_otp)) > 0 then
    raise exception
      'OTP codes are verified by Supabase Auth MFA (aal2); do not pass p_otp to admin RPCs'
      using errcode = 'invalid_parameter_value';
  end if;
  if p_pin is not null and length(trim(p_pin)) > 0 then
    if not coalesce(public.verify_admin_pin(p_pin), false) then
      raise exception 'invalid admin PIN' using errcode = 'invalid_password';
    end if;
  end if;

  select * into game_row from public.games where key = p_game_id for update;
  if not found then raise exception 'game not found'; end if;
  from_status := game_row.status::text;

  if p_to_status in ('owner_approved', 'live') and not public.is_owner(uid) then
    raise exception 'owner approval required';
  end if;

  if p_to_status in ('owner_approved', 'live') then
    perform public.assert_admin_sensitive();
  end if;

  update public.games
  set status = p_to_status::public.game_status,
      is_enabled = case when p_to_status = 'live' then true
                        when p_to_status = 'disabled' then false
                        else is_enabled end,
      updated_at = now()
  where id = game_row.id
  returning * into game_row;

  insert into public.game_release_events (game_id, from_status, to_status, actor_id)
  values (
    game_row.id,
    from_status::public.game_status,
    p_to_status::public.game_status,
    uid
  );

  perform public.write_audit(
    'game.release',
    'game',
    p_game_id,
    jsonb_build_object('from', from_status),
    jsonb_build_object('to', p_to_status)
  );
  return game_row;
end;
$$;

create or replace function public.set_maintenance_admin(
  p_is_active boolean,
  p_message_i18n jsonb default '{}'::jsonb,
  p_pin text default null::text,
  p_otp text default null::text
)
returns maintenance_state
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  row_out public.maintenance_state;
  msg text;
begin
  if uid is null or not public.has_permission('system.settings', uid) then
    raise exception 'permission denied';
  end if;
  perform public.admin_prepare_sensitive(p_pin, p_otp);

  msg := coalesce(p_message_i18n->>'en', p_message_i18n->>'lo', 'Maintenance');
  update public.maintenance_state
  set is_maintenance = p_is_active,
      message = msg,
      started_at = case when p_is_active then coalesce(started_at, now()) else started_at end,
      ended_at = case when not p_is_active then now() else null end,
      updated_by = uid,
      updated_at = now()
  where id
  returning * into row_out;

  perform public.write_audit(
    'maintenance.set',
    'system',
    'maintenance',
    null,
    jsonb_build_object('is_active', p_is_active)
  );
  return row_out;
end;
$$;

create or replace function public.register_qa_account(
  p_player_id uuid,
  p_label text,
  p_notes text default null::text,
  p_pin text default null::text,
  p_otp text default null::text
)
returns qa_demo_accounts
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  uid uuid := auth.uid();
  row_out public.qa_demo_accounts;
begin
  if uid is null or not public.has_permission('admins.manage', uid) then
    raise exception 'permission denied';
  end if;
  perform public.admin_prepare_sensitive(p_pin, p_otp);

  update public.profiles set is_qa_account = true where id = p_player_id;

  insert into public.qa_demo_accounts (player_id, label, purpose, created_by)
  values (p_player_id, p_label, p_notes, uid)
  on conflict (player_id) do update
  set label = excluded.label, purpose = excluded.purpose
  returning * into row_out;

  perform public.write_audit('qa.register', 'player', p_player_id::text);
  return row_out;
end;
$$;

update public.admin_users
set requires_2fa = true
where is_owner and coalesce(requires_2fa, false) = false;
