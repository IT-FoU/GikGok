-- Audit log, system settings, assets, maintenance, operational health.

CREATE TYPE public.audit_result AS ENUM ('success', 'failure', 'denied');
CREATE TYPE public.accent_theme AS ENUM ('green', 'red_white', 'blue_white', 'yellow_gray');
CREATE TYPE public.health_severity AS ENUM ('info', 'warning', 'error', 'critical');
CREATE TYPE public.asset_kind AS ENUM (
  'avatar_preset',
  'game_icon',
  'game_model',
  'texture',
  'sound',
  'other'
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users (id),
  actor_role text,
  action_type text NOT NULL,
  target_type text,
  target_id text,
  before_values jsonb,
  after_values jsonb,
  reason text,
  approval_chain jsonb NOT NULL DEFAULT '[]'::jsonb,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  result public.audit_result NOT NULL DEFAULT 'success',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_actor_idx ON public.audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_action_idx ON public.audit_log (action_type, created_at DESC);
CREATE INDEX audit_log_target_idx ON public.audit_log (target_type, target_id);
CREATE INDEX audit_log_created_idx ON public.audit_log (created_at DESC);

CREATE OR REPLACE FUNCTION public.deny_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_audit_mutation();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON public.audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_audit_mutation();

CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  description text,
  updated_by uuid REFERENCES public.admin_profiles (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER system_settings_set_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.system_settings (key, value, description) VALUES
  ('credits.welcome_amount', '50000', 'Welcome credit for newly verified players'),
  ('credits.daily_base_amount', '5000', 'Daily check-in base reward'),
  ('credits.daily_streak_day3_bonus', '2000', 'Day 3 streak bonus'),
  ('credits.daily_streak_day7_bonus', '10000', 'Day 7 streak bonus'),
  ('credits.daily_reward_max_balance', '200000', 'Block daily rewards above this balance'),
  ('credits.daily_rewards_enabled', 'true', 'Owner toggle for daily rewards'),
  ('theme.accent', '"green"', 'System-wide accent theme chosen by Owner'),
  ('credits.second_approver_threshold', '500000', 'Large adjustment second-approver threshold');

CREATE TABLE public.asset_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  kind public.asset_kind NOT NULL,
  storage_path text,
  mime_type text,
  byte_size integer,
  checksum text,
  rights_cleared boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT asset_metadata_size_check CHECK (
    byte_size IS NULL OR byte_size > 0
  )
);

CREATE TRIGGER asset_metadata_set_updated_at
  BEFORE UPDATE ON public.asset_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.maintenance_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  is_active boolean NOT NULL DEFAULT false,
  message_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz,
  estimated_end_at timestamptz,
  updated_by uuid REFERENCES public.admin_profiles (user_id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.maintenance_state (id, is_active)
VALUES (true, false);

CREATE TRIGGER maintenance_state_set_updated_at
  BEFORE UPDATE ON public.maintenance_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.operational_health_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  severity public.health_severity NOT NULL DEFAULT 'info',
  code text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operational_health_events_created_idx
  ON public.operational_health_events (created_at DESC);

CREATE INDEX operational_health_events_severity_idx
  ON public.operational_health_events (severity, created_at DESC)
  WHERE resolved_at IS NULL;
