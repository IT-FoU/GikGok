-- Phase 10 — admin console RPCs adapted to staging schema (admin_users / app_permission).
-- Forward-only. Demo GIK only. Project: jlpcfatcpymjnjbxmclo.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.admin_sensitive_challenges (
  admin_id uuid primary key references public.admin_users (id) on delete cascade,
  pin_verified_at timestamptz,
  otp_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.admin_sensitive_challenges enable row level security;
revoke all on public.admin_sensitive_challenges from anon, authenticated;
grant all on public.admin_sensitive_challenges to service_role;

-- ---------------------------------------------------------------------------
-- Session / PIN / 2FA
-- ---------------------------------------------------------------------------
create or replace function public.get_admin_session_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin_row public.admin_users;
  sec public.admin_security;
  perms text[];
  nick text;
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
    'require_2fa', admin_row.requires_2fa,
    'totp_enabled', coalesce(sec.totp_enabled, false),
    'large_adjustment_limit', admin_row.approval_limit,
    'permissions', to_jsonb(perms)
  );
end;
$$;

create or replace function public.touch_admin_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;
  update public.profiles
  set last_active_at = now(), updated_at = now()
  where id = uid;
end;
$$;

create or replace function public.set_admin_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;
  if p_pin is null or char_length(p_pin) < 4 or char_length(p_pin) > 12 or p_pin !~ '^[0-9]+$' then
    raise exception 'PIN must be 4-12 digits';
  end if;

  insert into public.admin_security (admin_id, pin_hash)
  values (uid, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (admin_id) do update
  set pin_hash = excluded.pin_hash, updated_at = now();

  perform public.write_audit('admin.pin.set', 'admin_user', uid::text);
  return jsonb_build_object('ok', true, 'pin_set', true);
end;
$$;

create or replace function public.verify_admin_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  stored text;
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;
  select pin_hash into stored from public.admin_security where admin_id = uid;
  if stored is null or stored <> extensions.crypt(p_pin, stored) then
    return false;
  end if;
  insert into public.admin_sensitive_challenges (admin_id, pin_verified_at)
  values (uid, now())
  on conflict (admin_id) do update
  set pin_verified_at = now(), updated_at = now();
  return true;
end;
$$;

create or replace function public.set_admin_2fa(p_enabled boolean, p_secret text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;
  insert into public.admin_security (admin_id, totp_secret, totp_enabled)
  values (
    uid,
    case when p_enabled then coalesce(nullif(trim(p_secret), ''), 'demo-totp-secret') else null end,
    p_enabled
  )
  on conflict (admin_id) do update
  set totp_secret = excluded.totp_secret,
      totp_enabled = excluded.totp_enabled,
      updated_at = now();
  perform public.write_audit(
    case when p_enabled then 'admin.2fa.enable' else 'admin.2fa.disable' end,
    'admin_user', uid::text
  );
  return jsonb_build_object('ok', true, 'totp_enabled', p_enabled);
end;
$$;

create or replace function public.verify_admin_2fa(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  sec public.admin_security;
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;
  select * into sec from public.admin_security where admin_id = uid;
  if not found or not sec.totp_enabled then
    return false;
  end if;
  -- Demo 2FA: accept the last 6 chars of the stored secret, or "000000".
  if p_code is distinct from right(coalesce(sec.totp_secret, ''), 6)
     and p_code is distinct from '000000' then
    return false;
  end if;
  insert into public.admin_sensitive_challenges (admin_id, otp_verified_at)
  values (uid, now())
  on conflict (admin_id) do update
  set otp_verified_at = now(), updated_at = now();
  return true;
end;
$$;

create or replace function public.assert_admin_sensitive()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  admin_row public.admin_users;
  sec public.admin_security;
  challenge public.admin_sensitive_challenges;
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;
  select * into admin_row from public.admin_users where id = uid;
  select * into sec from public.admin_security where admin_id = uid;
  select * into challenge from public.admin_sensitive_challenges where admin_id = uid;

  if admin_row.requires_pin and coalesce(sec.pin_hash, '') <> '' then
    if challenge.pin_verified_at is null or challenge.pin_verified_at < now() - interval '5 minutes' then
      raise exception 'admin PIN verification required';
    end if;
  end if;
  if admin_row.requires_2fa and coalesce(sec.totp_enabled, false) then
    if challenge.otp_verified_at is null or challenge.otp_verified_at < now() - interval '5 minutes' then
      raise exception 'admin 2FA verification required';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin management
-- ---------------------------------------------------------------------------
create or replace function public.create_admin_account(
  p_user_id uuid,
  p_display_name text,
  p_role_code text default 'support_viewer',
  p_is_owner boolean default false,
  p_pin text default null,
  p_otp text default null
)
returns public.admin_users
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  role_id uuid;
  row_out public.admin_users;
begin
  if uid is null or not public.is_owner(uid) then
    raise exception 'owner access required';
  end if;
  if p_pin is not null then perform public.verify_admin_pin(p_pin); end if;
  if p_otp is not null then perform public.verify_admin_2fa(p_otp); end if;
  perform public.assert_admin_sensitive();

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

  perform public.write_audit('admin.create', 'admin_user', p_user_id::text,
    null, jsonb_build_object('role', p_role_code, 'is_owner', p_is_owner));
  return row_out;
end;
$$;

create or replace function public.set_admin_status(
  p_target_admin_id uuid,
  p_status text,
  p_pin text default null,
  p_otp text default null
)
returns public.admin_users
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.admin_users;
  target public.admin_users;
begin
  if uid is null or not public.has_permission('admins.manage', uid) then
    raise exception 'permission denied';
  end if;
  if p_pin is not null then perform public.verify_admin_pin(p_pin); end if;
  if p_otp is not null then perform public.verify_admin_2fa(p_otp); end if;
  perform public.assert_admin_sensitive();

  select * into target from public.admin_users where id = p_target_admin_id;
  if not found then raise exception 'admin not found'; end if;
  if target.is_owner then raise exception 'cannot disable owner'; end if;
  if p_status not in ('active', 'disabled') then raise exception 'invalid status'; end if;

  update public.admin_users
  set is_active = (p_status = 'active'), updated_at = now()
  where id = p_target_admin_id
  returning * into row_out;

  perform public.write_audit('admin.status', 'admin_user', p_target_admin_id::text,
    null, jsonb_build_object('status', p_status));
  return row_out;
end;
$$;

create or replace function public.assign_admin_role(
  p_target_admin_id uuid,
  p_role_code text,
  p_pin text default null,
  p_otp text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  role_id uuid;
begin
  if uid is null or not public.has_permission('admins.manage', uid) then
    raise exception 'permission denied';
  end if;
  if p_pin is not null then perform public.verify_admin_pin(p_pin); end if;
  if p_otp is not null then perform public.verify_admin_2fa(p_otp); end if;
  perform public.assert_admin_sensitive();

  select id into role_id from public.admin_roles where key = p_role_code;
  if role_id is null then raise exception 'role not found'; end if;

  delete from public.admin_user_roles where admin_id = p_target_admin_id;
  insert into public.admin_user_roles (admin_id, role_id, assigned_by)
  values (p_target_admin_id, role_id, uid);

  perform public.write_audit('admin.role.assign', 'admin_user', p_target_admin_id::text,
    null, jsonb_build_object('role', p_role_code));
end;
$$;

create or replace function public.set_admin_permission_override(
  p_target_admin_id uuid,
  p_permission text,
  p_granted boolean,
  p_reason text default null,
  p_pin text default null,
  p_otp text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  perm public.app_permission;
begin
  if uid is null or not public.is_owner(uid) then
    raise exception 'owner access required';
  end if;
  if p_pin is not null then perform public.verify_admin_pin(p_pin); end if;
  if p_otp is not null then perform public.verify_admin_2fa(p_otp); end if;
  perform public.assert_admin_sensitive();

  perm := p_permission::public.app_permission;
  insert into public.admin_user_permissions (admin_id, permission, granted, updated_by)
  values (p_target_admin_id, perm, p_granted, uid)
  on conflict (admin_id, permission) do update
  set granted = excluded.granted, updated_by = uid, updated_at = now();

  perform public.write_audit('admin.permission.override', 'admin_user', p_target_admin_id::text,
    null, jsonb_build_object('permission', p_permission, 'granted', p_granted), p_reason);
end;
$$;

create or replace function public.set_player_status_admin(
  p_player_id uuid,
  p_status text,
  p_reason text,
  p_pin text default null,
  p_otp text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.has_permission('players.suspend', uid) then
    raise exception 'permission denied';
  end if;
  if p_pin is not null then perform public.verify_admin_pin(p_pin); end if;
  if p_otp is not null then perform public.verify_admin_2fa(p_otp); end if;
  perform public.assert_admin_sensitive();
  return public.admin_set_player_status(
    p_player_id,
    p_status::public.player_status,
    p_reason
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard + ops modules
-- ---------------------------------------------------------------------------
create or replace function public.get_admin_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.is_admin(uid) then
    raise exception 'admin access required';
  end if;

  return jsonb_build_object(
    'pending_credit_requests',
      (select count(*) from public.credit_requests where status = 'pending'),
    'open_tickets',
      (select count(*) from public.support_tickets where status in ('open', 'in_progress', 'waiting_for_player')),
    'open_rounds',
      (select count(*) from public.game_rounds where status = 'open'),
    'active_players_15m',
      (select count(*) from public.profiles
       where last_active_at is not null and last_active_at > now() - interval '15 minutes'
         and status = 'active'),
    'games',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'key', g.key, 'name', g.name, 'status', g.status, 'is_enabled', g.is_enabled
        ) order by g.key)
        from public.games g
      ), '[]'::jsonb),
    'health_events',
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'level', e.level, 'source', e.source, 'message', e.message, 'created_at', e.created_at
        ) order by e.created_at desc)
        from (
          select * from public.operational_health_events order by created_at desc limit 5
        ) e
      ), '[]'::jsonb),
    'maintenance',
      (select jsonb_build_object('is_active', m.is_maintenance, 'message', m.message)
       from public.maintenance_state m where m.id),
    'generated_at', now()
  );
end;
$$;

create or replace function public.upsert_announcement_admin(
  p_title_i18n jsonb,
  p_body_i18n jsonb,
  p_status text default 'draft',
  p_id uuid default null
)
returns public.announcements
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  title text;
  body text;
  row_out public.announcements;
  published boolean;
begin
  if uid is null or not public.has_permission('announcements.manage', uid) then
    raise exception 'permission denied';
  end if;
  title := coalesce(p_title_i18n->>'en', p_title_i18n->>'lo', 'Announcement');
  body := coalesce(p_body_i18n->>'en', p_body_i18n->>'lo', '');
  published := p_status in ('published', 'live');

  if p_id is null then
    insert into public.announcements (title, body, audience, is_published, publish_at, created_by)
    values (title, body, 'players', published, case when published then now() else null end, uid)
    returning * into row_out;
  else
    update public.announcements
    set title = title,
        body = body,
        is_published = published,
        publish_at = case when published then coalesce(publish_at, now()) else publish_at end,
        updated_at = now()
    where id = p_id
    returning * into row_out;
  end if;

  perform public.write_audit('announcement.upsert', 'announcement', row_out.id::text);
  return row_out;
end;
$$;

create or replace function public.update_ticket_status_admin(
  p_ticket_id uuid,
  p_status text,
  p_reply text default null
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.support_tickets;
begin
  if uid is null or not public.has_permission('tickets.manage', uid) then
    raise exception 'permission denied';
  end if;

  update public.support_tickets
  set status = p_status::public.ticket_status,
      assigned_admin = coalesce(assigned_admin, uid),
      closed_at = case when p_status in ('resolved', 'closed') then coalesce(closed_at, now()) else closed_at end,
      updated_at = now()
  where id = p_ticket_id
  returning * into row_out;

  if not found then raise exception 'ticket not found'; end if;

  if p_reply is not null and char_length(trim(p_reply)) > 0 then
    insert into public.ticket_messages (ticket_id, author_id, author_role, body)
    values (p_ticket_id, uid, 'admin', trim(p_reply));
  end if;

  insert into public.notifications (player_id, type, title, body, data)
  values (
    row_out.player_id, 'ticket', 'Support ticket updated',
    format('Status → %s', p_status),
    jsonb_build_object('ticket_id', p_ticket_id, 'status', p_status)
  );

  perform public.write_audit('ticket.status', 'ticket', p_ticket_id::text,
    null, jsonb_build_object('status', p_status));
  return row_out;
end;
$$;

create or replace function public.upsert_mission_admin(
  p_code text,
  p_title_i18n jsonb,
  p_description_i18n jsonb,
  p_target_count integer,
  p_reward_amount bigint,
  p_is_enabled boolean default true
)
returns public.missions
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.missions;
  title text;
  description text;
begin
  if uid is null or not public.has_permission('system.settings', uid) then
    raise exception 'permission denied';
  end if;
  title := coalesce(p_title_i18n->>'en', p_code);
  description := coalesce(p_description_i18n->>'en', '');

  insert into public.missions (
    key, name, description, scope, goal_type, goal_target, reward_amount, is_active
  ) values (
    p_code, title, description, 'any_game', 'play_rounds',
    greatest(p_target_count, 1), greatest(p_reward_amount, 0), p_is_enabled
  )
  on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      goal_target = excluded.goal_target,
      reward_amount = excluded.reward_amount,
      is_active = excluded.is_active,
      updated_at = now()
  returning * into row_out;

  perform public.write_audit('mission.upsert', 'mission', row_out.id::text);
  return row_out;
end;
$$;

create or replace function public.upsert_achievement_admin(
  p_code text,
  p_title_i18n jsonb,
  p_description_i18n jsonb,
  p_is_enabled boolean default true,
  p_badge_asset_key text default null
)
returns public.achievements
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.achievements;
begin
  if uid is null or not public.has_permission('system.settings', uid) then
    raise exception 'permission denied';
  end if;

  insert into public.achievements (key, name, description, icon, is_active)
  values (
    p_code,
    coalesce(p_title_i18n->>'en', p_code),
    coalesce(p_description_i18n->>'en', ''),
    p_badge_asset_key,
    p_is_enabled
  )
  on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      icon = excluded.icon,
      is_active = excluded.is_active
  returning * into row_out;

  perform public.write_audit('achievement.upsert', 'achievement', row_out.id::text);
  return row_out;
end;
$$;

create or replace function public.set_feature_flag_admin(
  p_key text,
  p_enabled boolean,
  p_payload jsonb default '{}'::jsonb
)
returns public.feature_flags
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.feature_flags;
begin
  if uid is null or not public.has_permission('system.settings', uid) then
    raise exception 'permission denied';
  end if;

  insert into public.feature_flags (key, description, is_enabled, audience, updated_by)
  values (p_key, coalesce(p_payload->>'description', p_key), p_enabled, coalesce(p_payload, '{}'::jsonb), uid)
  on conflict (key) do update
  set is_enabled = excluded.is_enabled,
      audience = case when p_payload = '{}'::jsonb then public.feature_flags.audience else excluded.audience end,
      updated_by = uid,
      updated_at = now()
  returning * into row_out;

  perform public.write_audit('feature_flag.set', 'feature_flag', p_key,
    null, jsonb_build_object('enabled', p_enabled));
  return row_out;
end;
$$;

create or replace function public.set_system_setting_admin(p_key text, p_value jsonb)
returns public.system_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.system_settings;
begin
  if uid is null or not public.has_permission('system.settings', uid) then
    raise exception 'permission denied';
  end if;

  insert into public.system_settings (key, value, updated_by)
  values (p_key, p_value, uid)
  on conflict (key) do update
  set value = excluded.value, updated_by = uid, updated_at = now()
  returning * into row_out;

  perform public.write_audit('system_setting.set', 'system_setting', p_key);
  return row_out;
end;
$$;

create or replace function public.set_maintenance_admin(
  p_is_active boolean,
  p_message_i18n jsonb default '{}'::jsonb,
  p_pin text default null,
  p_otp text default null
)
returns public.maintenance_state
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.maintenance_state;
  msg text;
begin
  if uid is null or not public.has_permission('system.settings', uid) then
    raise exception 'permission denied';
  end if;
  if p_pin is not null then perform public.verify_admin_pin(p_pin); end if;
  if p_otp is not null then perform public.verify_admin_2fa(p_otp); end if;
  perform public.assert_admin_sensitive();

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

  perform public.write_audit('maintenance.set', 'system', 'maintenance',
    null, jsonb_build_object('is_active', p_is_active));
  return row_out;
end;
$$;

create or replace function public.create_game_version_admin(
  p_game_id text,
  p_config jsonb,
  p_activate boolean default false
)
returns public.game_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  game_row public.games;
  next_version integer;
  row_out public.game_versions;
begin
  if uid is null or not public.has_permission('games.configure', uid) then
    raise exception 'permission denied';
  end if;

  select * into game_row from public.games where key = p_game_id;
  if not found then raise exception 'game not found'; end if;

  select coalesce(max(version), 0) + 1 into next_version
  from public.game_versions where game_id = game_row.id;

  insert into public.game_versions (game_id, version, config, is_published, created_by)
  values (game_row.id, next_version, p_config, p_activate, uid)
  returning * into row_out;

  if p_activate then
    update public.games
    set active_version_id = row_out.id, updated_at = now()
    where id = game_row.id;
  end if;

  perform public.write_audit('game.version.create', 'game', p_game_id,
    null, jsonb_build_object('version', next_version, 'activate', p_activate));
  return row_out;
end;
$$;

create or replace function public.advance_game_release(
  p_game_id text,
  p_to_status text,
  p_pin text default null,
  p_otp text default null
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  game_row public.games;
  from_status text;
begin
  if uid is null or not public.has_permission('games.control', uid) then
    raise exception 'permission denied';
  end if;
  if p_pin is not null then perform public.verify_admin_pin(p_pin); end if;
  if p_otp is not null then perform public.verify_admin_2fa(p_otp); end if;

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

  perform public.write_audit('game.release', 'game', p_game_id,
    jsonb_build_object('from', from_status),
    jsonb_build_object('to', p_to_status));
  return game_row;
end;
$$;

create or replace function public.upsert_asset_metadata_admin(
  p_key text,
  p_kind text,
  p_storage_path text default null,
  p_rights_cleared boolean default false
)
returns public.asset_metadata
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.asset_metadata;
  bucket text := split_part(coalesce(p_storage_path, 'game-assets/' || p_key), '/', 1);
  path text := coalesce(nullif(p_storage_path, ''), p_key);
begin
  if uid is null or not public.has_permission('system.settings', uid) then
    raise exception 'permission denied';
  end if;

  insert into public.asset_metadata (bucket, path, kind, metadata, created_by)
  values (
    bucket,
    path,
    p_kind,
    jsonb_build_object('key', p_key, 'rights_cleared', p_rights_cleared),
    uid
  )
  on conflict (bucket, path) do update
  set kind = excluded.kind,
      metadata = excluded.metadata
  returning * into row_out;

  perform public.write_audit('asset.upsert', 'asset', row_out.id::text);
  return row_out;
end;
$$;

create or replace function public.register_qa_account(
  p_player_id uuid,
  p_label text,
  p_notes text default null,
  p_pin text default null,
  p_otp text default null
)
returns public.qa_demo_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.qa_demo_accounts;
begin
  if uid is null or not public.has_permission('admins.manage', uid) then
    raise exception 'permission denied';
  end if;
  if p_pin is not null then perform public.verify_admin_pin(p_pin); end if;
  if p_otp is not null then perform public.verify_admin_2fa(p_otp); end if;
  perform public.assert_admin_sensitive();

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

create or replace function public.export_admin_report(p_report_type text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  rows jsonb := '[]'::jsonb;
begin
  if uid is null or not public.has_permission('reports.view', uid) then
    raise exception 'permission denied';
  end if;
  if not public.has_permission('reports.export', uid) then
    raise exception 'export permission required';
  end if;

  if p_report_type = 'players' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'nickname', p.nickname, 'status', p.status, 'is_qa', p.is_qa_account
    )), '[]'::jsonb)
    into rows
    from public.profiles p
    where not p.is_qa_account;
  elsif p_report_type = 'games' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', g.key, 'status', g.status, 'enabled', g.is_enabled
    )), '[]'::jsonb)
    into rows from public.games g;
  elsif p_report_type = 'credits' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'player_id', c.player_id, 'amount', c.requested_amount, 'status', c.status
    )), '[]'::jsonb)
    into rows from public.credit_requests c;
  elsif p_report_type = 'activity' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'player_id', r.player_id, 'stake', r.stake, 'is_win', r.is_win, 'created_at', r.created_at
    )), '[]'::jsonb)
    into rows from (
      select * from public.receipts order by created_at desc limit 500
    ) r;
  elsif p_report_type = 'support' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'subject', t.subject, 'status', t.status, 'category', t.category
    )), '[]'::jsonb)
    into rows from public.support_tickets t;
  elsif p_report_type = 'system' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', s.key, 'value', s.value
    )), '[]'::jsonb)
    into rows from public.system_settings s;
  else
    raise exception 'unknown report type';
  end if;

  perform public.write_audit('report.export', 'report', p_report_type);
  return jsonb_build_object('report_type', p_report_type, 'rows', rows, 'exported_at', now());
end;
$$;

create or replace function public.search_players_admin(p_query text default '', p_limit integer default 50)
returns setof public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null or not public.has_permission('players.view', uid) then
    raise exception 'permission denied';
  end if;
  return query
  select p.*
  from public.profiles p
  where p_query = ''
     or p.nickname::text ilike '%' || p_query || '%'
     or p.id::text ilike '%' || p_query || '%'
  order by p.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

-- Grants
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'get_admin_session_state()',
    'touch_admin_login()',
    'set_admin_pin(text)',
    'verify_admin_pin(text)',
    'set_admin_2fa(boolean, text)',
    'verify_admin_2fa(text)',
    'assert_admin_sensitive()',
    'create_admin_account(uuid, text, text, boolean, text, text)',
    'set_admin_status(uuid, text, text, text)',
    'assign_admin_role(uuid, text, text, text)',
    'set_admin_permission_override(uuid, text, boolean, text, text, text)',
    'set_player_status_admin(uuid, text, text, text, text)',
    'get_admin_dashboard()',
    'upsert_announcement_admin(jsonb, jsonb, text, uuid)',
    'update_ticket_status_admin(uuid, text, text)',
    'upsert_mission_admin(text, jsonb, jsonb, integer, bigint, boolean)',
    'upsert_achievement_admin(text, jsonb, jsonb, boolean, text)',
    'set_feature_flag_admin(text, boolean, jsonb)',
    'set_system_setting_admin(text, jsonb)',
    'set_maintenance_admin(boolean, jsonb, text, text)',
    'create_game_version_admin(text, jsonb, boolean)',
    'advance_game_release(text, text, text, text)',
    'upsert_asset_metadata_admin(text, text, text, boolean)',
    'register_qa_account(uuid, text, text, text, text)',
    'export_admin_report(text)',
    'search_players_admin(text, integer)'
  ]
  loop
    execute format('revoke all on function public.%s from public', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end $$;
