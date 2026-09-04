-- Profiles, verified contacts, avatars, settings, status, last activity.

CREATE TYPE public.player_status AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE public.app_locale AS ENUM ('lo', 'en');
CREATE TYPE public.graphics_mode AS ENUM ('auto', '2d', '3d');
CREATE TYPE public.graphics_quality AS ENUM ('low', 'medium', 'high');
CREATE TYPE public.sound_pack AS ENUM ('classic_casino', 'arcade', 'silent');
CREATE TYPE public.color_mode AS ENUM ('system', 'light', 'dark');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  nickname text NOT NULL,
  avatar_preset_id text,
  avatar_path text,
  avatar_mime_type text,
  avatar_byte_size integer,
  email text,
  phone text,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  status public.player_status NOT NULL DEFAULT 'active',
  last_activity_at timestamptz,
  last_seen_page text,
  welcome_credit_granted_at timestamptz,
  deletion_requested_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_nickname_length CHECK (char_length(nickname) BETWEEN 2 AND 32),
  CONSTRAINT profiles_avatar_size_max CHECK (
    avatar_byte_size IS NULL OR (avatar_byte_size > 0 AND avatar_byte_size <= 2097152)
  ),
  CONSTRAINT profiles_avatar_mime_ok CHECK (
    avatar_mime_type IS NULL
    OR avatar_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
  ),
  CONSTRAINT profiles_has_contact CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX profiles_verified_email_unique
  ON public.profiles (lower(email))
  WHERE email_verified_at IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX profiles_verified_phone_unique
  ON public.profiles (phone)
  WHERE phone_verified_at IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX profiles_nickname_unique
  ON public.profiles (lower(nickname))
  WHERE deleted_at IS NULL;

CREATE INDEX profiles_status_idx ON public.profiles (status) WHERE deleted_at IS NULL;
CREATE INDEX profiles_last_activity_idx ON public.profiles (last_activity_at DESC NULLS LAST);

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  locale public.app_locale NOT NULL DEFAULT 'lo',
  color_mode public.color_mode NOT NULL DEFAULT 'system',
  graphics_mode public.graphics_mode NOT NULL DEFAULT 'auto',
  graphics_quality public.graphics_quality NOT NULL DEFAULT 'medium',
  fps_cap integer NOT NULL DEFAULT 60,
  shadows_enabled boolean NOT NULL DEFAULT true,
  effects_enabled boolean NOT NULL DEFAULT true,
  reduce_motion boolean NOT NULL DEFAULT false,
  sound_pack public.sound_pack NOT NULL DEFAULT 'classic_casino',
  sound_volume numeric(3, 2) NOT NULL DEFAULT 0.70,
  muted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_fps_cap_check CHECK (fps_cap IN (30, 45, 60, 120)),
  CONSTRAINT user_settings_volume_check CHECK (sound_volume >= 0 AND sound_volume <= 1)
);

CREATE TRIGGER user_settings_set_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.is_player_verified(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.deleted_at IS NULL
      AND p.status = 'active'
      AND (p.email_verified_at IS NOT NULL OR p.phone_verified_at IS NOT NULL)
  );
$$;

REVOKE ALL ON FUNCTION public.is_player_verified(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_player_verified(uuid) TO authenticated, service_role;
