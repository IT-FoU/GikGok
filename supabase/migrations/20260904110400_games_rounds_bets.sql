-- Games, versioned configs, release lifecycle, feature flags, rounds, bets, outcomes, receipts.

CREATE TYPE public.game_lifecycle_status AS ENUM (
  'draft',
  'qa',
  'owner_approved',
  'scheduled',
  'live',
  'disabled'
);

CREATE TYPE public.settlement_mode AS ENUM ('random', 'controlled_demo');

CREATE TYPE public.round_status AS ENUM (
  'open',
  'locked',
  'settling',
  'settled',
  'cancelled'
);

CREATE TYPE public.bet_status AS ENUM (
  'pending',
  'locked',
  'settled',
  'cancelled'
);

CREATE TABLE public.games (
  id text PRIMARY KEY,
  display_name_key text NOT NULL,
  description_key text,
  lifecycle_status public.game_lifecycle_status NOT NULL DEFAULT 'draft',
  is_enabled boolean NOT NULL DEFAULT false,
  scheduled_launch_at timestamptz,
  maintenance_close_started_at timestamptz,
  maintenance_announcement_key text,
  min_stake bigint NOT NULL DEFAULT 500,
  max_stake bigint NOT NULL DEFAULT 100000,
  quick_stakes bigint[] NOT NULL DEFAULT ARRAY[500, 1000, 5000, 10000],
  sound_pack public.sound_pack NOT NULL DEFAULT 'classic_casino',
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT games_stake_bounds CHECK (min_stake > 0 AND max_stake >= min_stake)
);

CREATE TRIGGER games_set_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.games (id, display_name_key, description_key, lifecycle_status)
VALUES
  ('fish-prawn-crab', 'games.fpc.name', 'games.fpc.description', 'draft'),
  ('high-low', 'games.highlow.name', 'games.highlow.description', 'draft'),
  ('spinning-plate', 'games.plate.name', 'games.plate.description', 'draft');

CREATE TABLE public.game_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES public.games (id),
  version integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  guide_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.admin_profiles (user_id),
  approved_by uuid REFERENCES public.admin_profiles (user_id),
  approved_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, version)
);

CREATE UNIQUE INDEX game_versions_one_active
  ON public.game_versions (game_id)
  WHERE is_active = true;

CREATE TABLE public.feature_flags (
  key text PRIMARY KEY,
  description text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid REFERENCES public.admin_profiles (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER feature_flags_set_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id text NOT NULL REFERENCES public.games (id),
  game_version_id uuid NOT NULL REFERENCES public.game_versions (id),
  status public.round_status NOT NULL DEFAULT 'open',
  settlement_mode public.settlement_mode NOT NULL DEFAULT 'random',
  controlled_demo_payload jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  settled_at timestamptz,
  created_by uuid REFERENCES public.admin_profiles (user_id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT game_rounds_controlled_demo_check CHECK (
    settlement_mode = 'random'
    OR controlled_demo_payload IS NOT NULL
  )
);

CREATE INDEX game_rounds_game_status_idx
  ON public.game_rounds (game_id, status, opened_at DESC);

CREATE TABLE public.bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.game_rounds (id),
  player_id uuid NOT NULL REFERENCES public.profiles (id),
  game_id text NOT NULL REFERENCES public.games (id),
  game_version_id uuid NOT NULL REFERENCES public.game_versions (id),
  status public.bet_status NOT NULL DEFAULT 'pending',
  stake bigint NOT NULL,
  selection jsonb NOT NULL,
  idempotency_key text NOT NULL,
  debit_ledger_entry_id uuid REFERENCES public.ledger_entries (id),
  payout_ledger_entry_id uuid REFERENCES public.ledger_entries (id),
  locked_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bets_stake_positive CHECK (stake > 0),
  UNIQUE (player_id, idempotency_key)
);

CREATE INDEX bets_player_created_idx ON public.bets (player_id, created_at DESC);
CREATE INDEX bets_round_idx ON public.bets (round_id);
CREATE INDEX bets_game_idx ON public.bets (game_id, created_at DESC);

CREATE TRIGGER bets_set_updated_at
  BEFORE UPDATE ON public.bets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.bet_outcomes (
  bet_id uuid PRIMARY KEY REFERENCES public.bets (id) ON DELETE CASCADE,
  result_payload jsonb NOT NULL,
  total_return_multiplier numeric(10, 4) NOT NULL DEFAULT 0,
  payout_amount bigint NOT NULL DEFAULT 0,
  is_win boolean NOT NULL DEFAULT false,
  settled_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bet_outcomes_payout_nonneg CHECK (payout_amount >= 0),
  CONSTRAINT bet_outcomes_multiplier_nonneg CHECK (total_return_multiplier >= 0)
);

CREATE TABLE public.bet_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id uuid NOT NULL UNIQUE REFERENCES public.bets (id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles (id),
  game_id text NOT NULL REFERENCES public.games (id),
  game_version_id uuid NOT NULL REFERENCES public.game_versions (id),
  settlement_mode public.settlement_mode NOT NULL,
  stake bigint NOT NULL,
  selection jsonb NOT NULL,
  result_payload jsonb NOT NULL,
  total_return_multiplier numeric(10, 4) NOT NULL,
  payout_amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  is_win boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX bet_receipts_player_idx
  ON public.bet_receipts (player_id, created_at DESC);
