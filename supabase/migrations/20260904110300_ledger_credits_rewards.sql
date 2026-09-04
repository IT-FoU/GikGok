-- Immutable ledger, balance projection, credit requests, daily rewards/streaks.

CREATE TYPE public.ledger_entry_type AS ENUM (
  'welcome_credit',
  'daily_reward',
  'mission_reward',
  'achievement_reward',
  'demo_credit_grant',
  'simulation_fee',
  'bet_debit',
  'game_payout',
  'admin_adjustment',
  'reset_demo_data'
);

CREATE TYPE public.credit_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

CREATE TYPE public.fee_mode AS ENUM ('percent', 'amount');

CREATE TABLE public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id),
  entry_type public.ledger_entry_type NOT NULL,
  amount bigint NOT NULL,
  balance_after bigint NOT NULL,
  source_type text,
  source_id uuid,
  actor_id uuid REFERENCES auth.users (id),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_amount_nonzero CHECK (amount <> 0),
  CONSTRAINT ledger_entries_balance_nonneg CHECK (balance_after >= 0)
);

CREATE INDEX ledger_entries_player_created_idx
  ON public.ledger_entries (player_id, created_at DESC);

CREATE INDEX ledger_entries_type_idx
  ON public.ledger_entries (entry_type);

CREATE INDEX ledger_entries_source_idx
  ON public.ledger_entries (source_type, source_id);

-- Prevent updates/deletes on immutable ledger rows.
CREATE OR REPLACE FUNCTION public.deny_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'ledger_entries is append-only';
END;
$$;

CREATE TRIGGER ledger_entries_no_update
  BEFORE UPDATE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_ledger_mutation();

CREATE TRIGGER ledger_entries_no_delete
  BEFORE DELETE ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.deny_ledger_mutation();

CREATE TABLE public.player_balances (
  player_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  balance bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_balances_nonneg CHECK (balance >= 0)
);

CREATE OR REPLACE FUNCTION public.apply_ledger_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance bigint;
BEGIN
  INSERT INTO public.player_balances (player_id, balance, updated_at)
  VALUES (NEW.player_id, 0, now())
  ON CONFLICT (player_id) DO NOTHING;

  SELECT balance INTO current_balance
  FROM public.player_balances
  WHERE player_id = NEW.player_id
  FOR UPDATE;

  IF current_balance + NEW.amount < 0 THEN
    RAISE EXCEPTION 'insufficient balance for ledger entry';
  END IF;

  NEW.balance_after := current_balance + NEW.amount;

  UPDATE public.player_balances
  SET balance = NEW.balance_after,
      updated_at = now()
  WHERE player_id = NEW.player_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER ledger_entries_apply_balance
  BEFORE INSERT ON public.ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_ledger_balance();

CREATE TABLE public.credit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id),
  status public.credit_request_status NOT NULL DEFAULT 'pending',
  requested_amount bigint NOT NULL,
  player_note text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_requests_amount_positive CHECK (requested_amount > 0)
);

CREATE INDEX credit_requests_player_idx
  ON public.credit_requests (player_id, created_at DESC);

CREATE INDEX credit_requests_status_idx
  ON public.credit_requests (status, created_at DESC);

CREATE TRIGGER credit_requests_set_updated_at
  BEFORE UPDATE ON public.credit_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.credit_request_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_request_id uuid NOT NULL REFERENCES public.credit_requests (id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.admin_profiles (user_id),
  decision public.credit_request_status NOT NULL,
  gross_amount bigint,
  fee_mode public.fee_mode,
  fee_value numeric(12, 4),
  bonus_amount bigint NOT NULL DEFAULT 0,
  net_amount bigint,
  reason text NOT NULL,
  requires_second_approver boolean NOT NULL DEFAULT false,
  second_approver_id uuid REFERENCES public.admin_profiles (user_id),
  second_approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_request_reviews_decision_check CHECK (
    decision IN ('approved', 'rejected')
  ),
  CONSTRAINT credit_request_reviews_reason_length CHECK (char_length(reason) >= 3),
  CONSTRAINT credit_request_reviews_amounts_check CHECK (
    decision = 'rejected'
    OR (
      gross_amount IS NOT NULL
      AND gross_amount > 0
      AND net_amount IS NOT NULL
      AND bonus_amount >= 0
    )
  )
);

CREATE INDEX credit_request_reviews_request_idx
  ON public.credit_request_reviews (credit_request_id, created_at DESC);

CREATE TABLE public.daily_reward_state (
  player_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  streak_day integer NOT NULL DEFAULT 0,
  last_claim_date date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_reward_streak_range CHECK (streak_day >= 0 AND streak_day <= 7)
);

CREATE TABLE public.daily_reward_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.profiles (id),
  claim_date date NOT NULL,
  streak_day integer NOT NULL,
  base_amount bigint NOT NULL,
  bonus_amount bigint NOT NULL DEFAULT 0,
  ledger_entry_id uuid REFERENCES public.ledger_entries (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, claim_date),
  CONSTRAINT daily_reward_claims_amounts_nonneg CHECK (
    base_amount >= 0 AND bonus_amount >= 0
  )
);

CREATE INDEX daily_reward_claims_player_idx
  ON public.daily_reward_claims (player_id, claim_date DESC);
