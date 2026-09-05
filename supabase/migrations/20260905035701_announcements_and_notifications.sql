-- GIKGOK — announcements and per-player notifications

create type public.announcement_audience as enum ('all', 'players', 'admins');
create type public.notification_type as enum (
  'verification', 'reward', 'credit_request', 'ticket',
  'achievement', 'announcement', 'system'
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience public.announcement_audience not null default 'all',
  target jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  publish_at timestamptz,
  expires_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index announcements_published_idx on public.announcements (is_published, publish_at);

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  player_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, player_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_player_idx on public.notifications (player_id, created_at desc);
create index notifications_unread_idx on public.notifications (player_id) where not is_read;

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.notifications enable row level security;

revoke all on public.announcements, public.announcement_reads, public.notifications
  from anon, authenticated;
grant all on public.announcements, public.announcement_reads, public.notifications
  to service_role;
grant select on public.announcements to authenticated;
grant select, insert on public.announcement_reads to authenticated;
grant select on public.notifications to authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;

-- Players see live, non-expired announcements addressed to them; admins see all.
create policy announcements_select_live on public.announcements
  for select to authenticated
  using (
    public.has_permission('announcements.manage')
    or (
      is_published
      and (publish_at is null or publish_at <= now())
      and (expires_at is null or expires_at > now())
      and audience in ('all', 'players')
    )
  );

create policy announcement_reads_own on public.announcement_reads
  for all to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());

create policy notifications_select_own on public.notifications
  for select to authenticated using (player_id = auth.uid());
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (player_id = auth.uid())
  with check (player_id = auth.uid());
