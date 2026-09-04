-- Announcements, notifications, tickets, missions, achievements, leaderboards, friends, QA accounts.

CREATE TYPE public.announcement_status AS ENUM ('draft', 'scheduled', 'published', 'archived');
CREATE TYPE public.notification_kind AS ENUM (
  'verification',
  'reward',
  'credit_request',
  'ticket',
  'achievement',
  'announcement',
  'system'
);

CREATE TYPE public.ticket_status AS ENUM (
  'open',
  'in_progress',
  'waiting_for_player',
  'resolved',
  'closed'
);

CREATE TYPE public.ticket_category AS ENUM (
  'account',
  'credits',
  'gameplay',
  'technical',
  'other'
);

CREATE TYPE public.friendship_status AS ENUM (
  'pending',
  'accepted',
  'blocked',
  'removed'
);

CREATE TYPE public.leaderboard_metric AS ENUM (
  'highest_credit',
  'cumulative_winnings',
  'most_wins'
);

CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_i18n jsonb NOT NULL,
  body_i18n jsonb NOT NULL,
  status public.announcement_status NOT NULL DEFAULT 'draft',
  target_all_players boolean NOT NULL DEFAULT true,
  scheduled_at timestamptz,
  published_at timestamptz,
  created_by uuid REFERENCES public.admin_profiles (user_id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX announcements_status_idx
  ON public.announcements (status, published_at DESC NULLS LAST);

CREATE TRIGGER announcements_set_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.announcements (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  PRIMARY KEY (announcement_id, player_id)
);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  kind public.notification_kind NOT NULL,
  title_key text NOT NULL,
  body_key text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_player_idx
  ON public.notifications (player_id, created_at DESC);

CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id),
  category public.ticket_category NOT NULL DEFAULT 'other',
  subject text NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  assigned_admin_id uuid REFERENCES public.admin_profiles (user_id),
  satisfaction_score integer,
  satisfaction_comment text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_subject_length CHECK (char_length(subject) BETWEEN 3 AND 120),
  CONSTRAINT support_tickets_satisfaction_check CHECK (
    satisfaction_score IS NULL OR satisfaction_score BETWEEN 1 AND 5
  )
);

CREATE INDEX support_tickets_player_idx
  ON public.support_tickets (player_id, created_at DESC);

CREATE INDEX support_tickets_status_idx
  ON public.support_tickets (status, updated_at DESC);

CREATE TRIGGER support_tickets_set_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users (id),
  body text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_messages_body_length CHECK (char_length(body) BETWEEN 1 AND 5000)
);

CREATE INDEX support_ticket_messages_ticket_idx
  ON public.support_ticket_messages (ticket_id, created_at ASC);

CREATE TABLE public.support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets (id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.support_ticket_messages (id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ticket_attachments_size CHECK (byte_size > 0 AND byte_size <= 5242880),
  CONSTRAINT support_ticket_attachments_mime CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  )
);

CREATE INDEX support_ticket_attachments_ticket_idx
  ON public.support_ticket_attachments (ticket_id);

-- Max 3 attachments per ticket enforced via trigger.
CREATE OR REPLACE FUNCTION public.enforce_ticket_attachment_limit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  attachment_count integer;
BEGIN
  SELECT count(*) INTO attachment_count
  FROM public.support_ticket_attachments
  WHERE ticket_id = NEW.ticket_id;

  IF attachment_count >= 3 THEN
    RAISE EXCEPTION 'support tickets allow at most 3 attachments';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER support_ticket_attachments_limit
  BEFORE INSERT ON public.support_ticket_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ticket_attachment_limit();

CREATE TABLE public.missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title_i18n jsonb NOT NULL,
  description_i18n jsonb NOT NULL,
  game_id text REFERENCES public.games (id),
  target_count integer NOT NULL DEFAULT 1,
  reward_amount bigint NOT NULL DEFAULT 0,
  is_enabled boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT missions_target_positive CHECK (target_count > 0),
  CONSTRAINT missions_reward_nonneg CHECK (reward_amount >= 0)
);

CREATE TRIGGER missions_set_updated_at
  BEFORE UPDATE ON public.missions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.player_mission_progress (
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES public.missions (id) ON DELETE CASCADE,
  progress_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, mission_id),
  CONSTRAINT player_mission_progress_nonneg CHECK (progress_count >= 0)
);

CREATE TABLE public.achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title_i18n jsonb NOT NULL,
  description_i18n jsonb NOT NULL,
  badge_asset_key text,
  is_enabled boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER achievements_set_updated_at
  BEFORE UPDATE ON public.achievements
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.player_achievements (
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES public.achievements (id) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, achievement_id)
);

CREATE TABLE public.leaderboard_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric public.leaderboard_metric NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  entries jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX leaderboard_snapshots_metric_idx
  ON public.leaderboard_snapshots (metric, captured_at DESC);

CREATE TABLE public.leaderboard_projections (
  player_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  metric public.leaderboard_metric NOT NULL,
  score bigint NOT NULL DEFAULT 0,
  rank integer,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, metric),
  CONSTRAINT leaderboard_projections_score_nonneg CHECK (score >= 0)
);

CREATE INDEX leaderboard_projections_metric_score_idx
  ON public.leaderboard_projections (metric, score DESC);

CREATE TABLE public.friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_not_self CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX friendships_pair_unique
  ON public.friendships (
    LEAST(requester_id, addressee_id),
    GREATEST(requester_id, addressee_id)
  );

CREATE TRIGGER friendships_set_updated_at
  BEFORE UPDATE ON public.friendships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  accepted_by uuid REFERENCES public.profiles (id),
  accepted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.qa_accounts (
  player_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  label text NOT NULL,
  notes text,
  isolated_from_analytics boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.admin_profiles (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER qa_accounts_set_updated_at
  BEFORE UPDATE ON public.qa_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
