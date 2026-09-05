-- Phase 9 — player experience RPCs adapted to staging schema.
-- Forward-only. Demo GIK only. Project: jlpcfatcpymjnjbxmclo.

-- Responsible-play columns on profiles
alter table public.profiles
  add column if not exists play_paused_until timestamptz,
  add column if not exists session_started_at timestamptz;

-- Optional dismiss timestamp for announcements (read_at already exists)
alter table public.announcement_reads
  add column if not exists dismissed_at timestamptz;

-- Feature flags + responsible-play settings (idempotent)
insert into public.feature_flags (key, description, is_enabled) values
  ('friends_invites', 'Friends and invite system', false),
  ('leaderboard', 'Leaderboards', true),
  ('missions', 'Optional daily missions', true),
  ('achievements', 'Achievements and badges', true)
on conflict (key) do update
  set description = excluded.description,
      updated_at = now();

insert into public.system_settings (key, value, description) values
  ('responsible.session_break_minutes', '45'::jsonb, 'Remind players to take a break after N minutes'),
  ('responsible.daily_bet_limit', '500000'::jsonb, 'Soft daily stake reminder (demo GIK)'),
  ('responsible.pause_days_options', '[1,3,7]'::jsonb, 'Voluntary temporary pause options in days'),
  (
    'responsible.demo_notice',
    '"GIK credits are demo credits only and have no cash value."'::jsonb,
    'Persistent demo-credit notice'
  )
on conflict (key) do update
  set value = excluded.value,
      description = excluded.description,
      updated_at = now();

-- Sample announcement when none published
insert into public.announcements (title, body, audience, is_published, publish_at)
select
  'Welcome to GIKGOK',
  'Demo credits only — no real money. Take breaks and play for fun.',
  'players',
  true,
  now()
where not exists (
  select 1 from public.announcements where is_published limit 1
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.feature_flag_enabled(p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_enabled from public.feature_flags where key = p_key),
    false
  );
$$;

revoke all on function public.feature_flag_enabled(text) from public;
grant execute on function public.feature_flag_enabled(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Announcements / notifications
-- ---------------------------------------------------------------------------
create or replace function public.mark_announcement_read(
  p_announcement_id uuid,
  p_dismiss boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required'; end if;
  insert into public.announcement_reads (announcement_id, player_id, read_at, dismissed_at)
  values (
    p_announcement_id,
    uid,
    now(),
    case when p_dismiss then now() else null end
  )
  on conflict (announcement_id, player_id) do update
  set read_at = now(),
      dismissed_at = case
        when p_dismiss then now()
        else public.announcement_reads.dismissed_at
      end;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'authentication required'; end if;
  update public.notifications
  set is_read = true, read_at = coalesce(read_at, now())
  where id = p_notification_id and player_id = uid;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  updated_count integer;
begin
  if uid is null then raise exception 'authentication required'; end if;
  update public.notifications
  set is_read = true, read_at = coalesce(read_at, now())
  where player_id = uid and not is_read;
  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Missions / achievements / leaderboard
-- ---------------------------------------------------------------------------
create or replace function public.record_mission_progress(p_game_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mission_row public.missions;
  game_uuid uuid;
  new_progress integer;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if not public.feature_flag_enabled('missions') then return; end if;

  select id into game_uuid from public.games where key = p_game_key;

  for mission_row in
    select * from public.missions
    where is_active
      and (starts_at is null or starts_at <= now())
      and (ends_at is null or ends_at > now())
      and (
        scope = 'any_game'
        or (scope = 'single_game' and game_id = game_uuid)
      )
  loop
    insert into public.mission_progress (mission_id, player_id, progress, is_completed)
    values (mission_row.id, uid, 1, mission_row.goal_target <= 1)
    on conflict (mission_id, player_id) do update
    set progress = least(
          public.mission_progress.progress + 1,
          mission_row.goal_target
        ),
        is_completed = case
          when public.mission_progress.reward_ledger_id is not null then true
          when public.mission_progress.progress + 1 >= mission_row.goal_target then true
          else public.mission_progress.is_completed
        end,
        completed_at = case
          when public.mission_progress.completed_at is not null then public.mission_progress.completed_at
          when public.mission_progress.progress + 1 >= mission_row.goal_target then now()
          else null
        end,
        updated_at = now()
    where public.mission_progress.reward_ledger_id is null;
  end loop;
end;
$$;

create or replace function public.claim_mission_reward(p_mission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  mission_row public.missions;
  progress public.mission_progress;
  ledger_row public.gik_ledger;
begin
  if uid is null then raise exception 'authentication required'; end if;

  select * into mission_row
  from public.missions
  where id = p_mission_id and is_active;
  if not found then raise exception 'mission not found'; end if;

  select * into progress
  from public.mission_progress
  where player_id = uid and mission_id = p_mission_id
  for update;

  if not found or not progress.is_completed then
    raise exception 'mission not completed';
  end if;
  if progress.reward_ledger_id is not null then
    raise exception 'mission already claimed';
  end if;

  ledger_row := public.append_ledger_entry(
    uid,
    'mission_reward'::public.ledger_entry_type,
    mission_row.reward_amount,
    'mission',
    mission_row.id,
    uid,
    'Mission reward: ' || mission_row.name,
    jsonb_build_object('mission_key', mission_row.key)
  );

  update public.mission_progress
  set reward_ledger_id = ledger_row.id, updated_at = now()
  where mission_id = p_mission_id and player_id = uid;

  insert into public.notifications (player_id, type, title, body, data)
  values (
    uid,
    'reward',
    'Mission reward claimed',
    format('You received %s GIK for %s.', mission_row.reward_amount, mission_row.name),
    jsonb_build_object('mission_id', p_mission_id, 'amount', mission_row.reward_amount)
  );

  return jsonb_build_object(
    'claimed', true,
    'amount', mission_row.reward_amount,
    'ledger_entry_id', ledger_row.id
  );
end;
$$;

create or replace function public.unlock_achievement(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  achievement_row public.achievements;
  inserted integer;
begin
  if uid is null then return false; end if;
  if not public.feature_flag_enabled('achievements') then return false; end if;

  select * into achievement_row
  from public.achievements
  where key = p_key and is_active;
  if not found then return false; end if;

  insert into public.achievement_unlocks (player_id, achievement_id)
  values (uid, achievement_row.id)
  on conflict (achievement_id, player_id) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 then
    insert into public.notifications (player_id, type, title, body, data)
    values (
      uid,
      'achievement',
      'Achievement unlocked',
      achievement_row.name,
      jsonb_build_object('key', p_key)
    );
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.refresh_leaderboard_entries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Current credit
  insert into public.leaderboard_entries (
    board, player_id, nickname, avatar_url, metric_value, rank, snapshot_at
  )
  select
    'current_credit'::public.leaderboard_board,
    pb.player_id,
    p.nickname,
    p.avatar_url,
    pb.balance,
    0,
    now()
  from public.player_balances pb
  join public.profiles p on p.id = pb.player_id
  where p.status = 'active' and not p.is_qa_account
  on conflict (board, player_id) do update
  set nickname = excluded.nickname,
      avatar_url = excluded.avatar_url,
      metric_value = excluded.metric_value,
      snapshot_at = now();

  -- Cumulative winnings
  insert into public.leaderboard_entries (
    board, player_id, nickname, avatar_url, metric_value, rank, snapshot_at
  )
  select
    'cumulative_winnings'::public.leaderboard_board,
    le.player_id,
    p.nickname,
    p.avatar_url,
    coalesce(sum(le.amount), 0),
    0,
    now()
  from public.gik_ledger le
  join public.profiles p on p.id = le.player_id
  where le.entry_type = 'game_payout'
    and p.status = 'active'
    and not p.is_qa_account
  group by le.player_id, p.nickname, p.avatar_url
  on conflict (board, player_id) do update
  set nickname = excluded.nickname,
      avatar_url = excluded.avatar_url,
      metric_value = excluded.metric_value,
      snapshot_at = now();

  -- Most wins
  insert into public.leaderboard_entries (
    board, player_id, nickname, avatar_url, metric_value, rank, snapshot_at
  )
  select
    'most_wins'::public.leaderboard_board,
    r.player_id,
    p.nickname,
    p.avatar_url,
    count(*)::bigint,
    0,
    now()
  from public.receipts r
  join public.profiles p on p.id = r.player_id
  where r.is_win
    and p.status = 'active'
    and not p.is_qa_account
  group by r.player_id, p.nickname, p.avatar_url
  on conflict (board, player_id) do update
  set nickname = excluded.nickname,
      avatar_url = excluded.avatar_url,
      metric_value = excluded.metric_value,
      snapshot_at = now();

  update public.leaderboard_entries le
  set rank = ranked.r
  from (
    select id,
           rank() over (partition by board order by metric_value desc) as r
    from public.leaderboard_entries
  ) ranked
  where le.id = ranked.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Friends / invites
-- ---------------------------------------------------------------------------
create or replace function public.request_friend(p_nickname text)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  target uuid;
  row_out public.friendships;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if not public.feature_flag_enabled('friends_invites') then
    raise exception 'friends disabled';
  end if;

  select id into target
  from public.profiles
  where lower(nickname::text) = lower(trim(p_nickname));
  if target is null then raise exception 'player not found'; end if;
  if target = uid then raise exception 'cannot friend yourself'; end if;

  if exists (
    select 1 from public.friendships
    where status = 'blocked'
      and (
        (requester_id = uid and addressee_id = target)
        or (requester_id = target and addressee_id = uid)
      )
  ) then
    raise exception 'friendship blocked';
  end if;

  select * into row_out
  from public.friendships
  where (requester_id = uid and addressee_id = target)
     or (requester_id = target and addressee_id = uid)
  order by updated_at desc
  limit 1;

  if found then
    return row_out;
  end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (uid, target, 'pending')
  returning * into row_out;
  return row_out;
end;
$$;

create or replace function public.respond_friendship(
  p_friendship_id uuid,
  p_action text
)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.friendships;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_action not in ('accept', 'block', 'remove') then
    raise exception 'invalid friendship action';
  end if;

  select * into row_out from public.friendships where id = p_friendship_id for update;
  if not found then raise exception 'friendship not found'; end if;
  if row_out.requester_id <> uid and row_out.addressee_id <> uid then
    raise exception 'not allowed';
  end if;

  if p_action = 'accept' then
    if row_out.addressee_id <> uid then raise exception 'only addressee can accept'; end if;
    update public.friendships
    set status = 'accepted', updated_at = now()
    where id = p_friendship_id
    returning * into row_out;
  elsif p_action = 'block' then
    update public.friendships
    set status = 'blocked', updated_at = now()
    where id = p_friendship_id
    returning * into row_out;
  else
    delete from public.friendships where id = p_friendship_id;
    return row_out;
  end if;

  return row_out;
end;
$$;

create or replace function public.create_invite_code()
returns public.invites
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  row_out public.invites;
  code text;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if not public.feature_flag_enabled('friends_invites') then
    raise exception 'friends disabled';
  end if;

  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.invites (inviter_id, code)
  values (uid, code)
  returning * into row_out;
  return row_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Support tickets
-- ---------------------------------------------------------------------------
create or replace function public.create_support_ticket(
  p_category public.ticket_category,
  p_subject text,
  p_message text
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ticket public.support_tickets;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_subject)) < 3 then raise exception 'subject required'; end if;
  if char_length(trim(p_message)) < 3 then raise exception 'message required'; end if;

  insert into public.support_tickets (player_id, category, subject)
  values (uid, p_category, trim(p_subject))
  returning * into ticket;

  insert into public.ticket_messages (ticket_id, author_id, author_role, body)
  values (ticket.id, uid, 'player', trim(p_message));

  insert into public.notifications (player_id, type, title, body, data)
  values (
    uid,
    'ticket',
    'Support ticket created',
    ticket.subject,
    jsonb_build_object('ticket_id', ticket.id)
  );

  return ticket;
end;
$$;

create or replace function public.reply_support_ticket(
  p_ticket_id uuid,
  p_message text
)
returns public.ticket_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ticket public.support_tickets;
  msg public.ticket_messages;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_message)) < 1 then raise exception 'message required'; end if;

  select * into ticket from public.support_tickets where id = p_ticket_id;
  if not found or ticket.player_id <> uid then raise exception 'ticket not found'; end if;
  if ticket.status in ('closed', 'resolved') then raise exception 'ticket closed'; end if;

  insert into public.ticket_messages (ticket_id, author_id, author_role, body)
  values (p_ticket_id, uid, 'player', trim(p_message))
  returning * into msg;

  return msg;
end;
$$;

create or replace function public.submit_ticket_satisfaction(
  p_ticket_id uuid,
  p_score integer,
  p_comment text default null
)
returns public.support_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  ticket public.support_tickets;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_score < 1 or p_score > 5 then raise exception 'score must be 1-5'; end if;

  update public.support_tickets
  set satisfaction_rating = p_score,
      satisfaction_comment = nullif(trim(coalesce(p_comment, '')), ''),
      status = case when status = 'resolved' then 'closed' else status end,
      closed_at = coalesce(closed_at, now()),
      updated_at = now()
  where id = p_ticket_id and player_id = uid
  returning * into ticket;

  if not found then raise exception 'ticket not found'; end if;
  return ticket;
end;
$$;

-- ---------------------------------------------------------------------------
-- Responsible play
-- ---------------------------------------------------------------------------
create or replace function public.set_play_pause(p_days integer)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  profile_row public.profiles;
begin
  if uid is null then raise exception 'authentication required'; end if;
  if p_days is null or p_days <= 0 then
    update public.profiles
    set play_paused_until = null, updated_at = now()
    where id = uid
    returning * into profile_row;
  else
    update public.profiles
    set play_paused_until = now() + make_interval(days => p_days), updated_at = now()
    where id = uid
    returning * into profile_row;
  end if;
  return profile_row;
end;
$$;

create or replace function public.touch_play_session()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  started timestamptz;
begin
  if uid is null then raise exception 'authentication required'; end if;
  update public.profiles
  set session_started_at = coalesce(session_started_at, now()),
      last_active_at = now(),
      updated_at = now()
  where id = uid
  returning session_started_at into started;
  return started;
end;
$$;

create or replace function public.assert_play_allowed()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  paused_until timestamptz;
begin
  if uid is null then raise exception 'authentication required'; end if;
  select play_paused_until into paused_until from public.profiles where id = uid;
  if paused_until is not null and paused_until > now() then
    raise exception 'play temporarily paused until %', paused_until;
  end if;
end;
$$;

create or replace function public.get_responsible_play_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'session_break_minutes',
      coalesce((public.get_setting('responsible.session_break_minutes', '45'::jsonb))::text::bigint, 45),
    'daily_bet_limit',
      coalesce((public.get_setting('responsible.daily_bet_limit', '500000'::jsonb))::text::bigint, 500000),
    'pause_days_options',
      coalesce(public.get_setting('responsible.pause_days_options', '[1,3,7]'::jsonb), '[1,3,7]'::jsonb),
    'demo_notice',
      coalesce(
        public.get_setting('responsible.demo_notice', null) #>> '{}',
        'GIK credits are demo credits only and have no cash value.'
      )
  );
$$;

-- Grants
revoke all on function public.mark_announcement_read(uuid, boolean) from public;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;
revoke all on function public.record_mission_progress(text) from public;
revoke all on function public.claim_mission_reward(uuid) from public;
revoke all on function public.unlock_achievement(text) from public;
revoke all on function public.refresh_leaderboard_entries() from public;
revoke all on function public.request_friend(text) from public;
revoke all on function public.respond_friendship(uuid, text) from public;
revoke all on function public.create_invite_code() from public;
revoke all on function public.create_support_ticket(public.ticket_category, text, text) from public;
revoke all on function public.reply_support_ticket(uuid, text) from public;
revoke all on function public.submit_ticket_satisfaction(uuid, integer, text) from public;
revoke all on function public.set_play_pause(integer) from public;
revoke all on function public.touch_play_session() from public;
revoke all on function public.assert_play_allowed() from public;
revoke all on function public.get_responsible_play_config() from public;

grant execute on function public.mark_announcement_read(uuid, boolean) to authenticated, service_role;
grant execute on function public.mark_notification_read(uuid) to authenticated, service_role;
grant execute on function public.mark_all_notifications_read() to authenticated, service_role;
grant execute on function public.record_mission_progress(text) to authenticated, service_role;
grant execute on function public.claim_mission_reward(uuid) to authenticated, service_role;
grant execute on function public.unlock_achievement(text) to authenticated, service_role;
grant execute on function public.refresh_leaderboard_entries() to authenticated, service_role;
grant execute on function public.request_friend(text) to authenticated, service_role;
grant execute on function public.respond_friendship(uuid, text) to authenticated, service_role;
grant execute on function public.create_invite_code() to authenticated, service_role;
grant execute on function public.create_support_ticket(public.ticket_category, text, text) to authenticated, service_role;
grant execute on function public.reply_support_ticket(uuid, text) to authenticated, service_role;
grant execute on function public.submit_ticket_satisfaction(uuid, integer, text) to authenticated, service_role;
grant execute on function public.set_play_pause(integer) to authenticated, service_role;
grant execute on function public.touch_play_session() to authenticated, service_role;
grant execute on function public.assert_play_allowed() to authenticated, service_role;
grant execute on function public.get_responsible_play_config() to authenticated, service_role;
