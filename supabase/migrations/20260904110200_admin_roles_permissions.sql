-- Admin roles, granular permissions, assignments, PIN/2FA, approval limits.

CREATE TYPE public.admin_account_status AS ENUM ('active', 'disabled');

CREATE TABLE public.admin_permissions (
  code text PRIMARY KEY,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.admin_permissions (code, description) VALUES
  ('players.view', 'View player profiles and activity'),
  ('players.suspend', 'Suspend or ban players'),
  ('credits.view', 'View ledger and credit requests'),
  ('credits.adjust', 'Approve/reject credit requests and adjust credits'),
  ('games.view', 'View games, rounds, and receipts'),
  ('games.control', 'Control game availability and modes'),
  ('games.configure', 'Edit versioned game configuration'),
  ('announcements.manage', 'Manage announcements'),
  ('tickets.manage', 'Manage support tickets'),
  ('reports.view', 'View operational reports'),
  ('reports.export', 'Export reports'),
  ('admins.manage', 'Create and manage administrators'),
  ('audit.view', 'View append-only audit log'),
  ('system.settings', 'Manage system settings and feature flags');

CREATE TABLE public.admin_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER admin_roles_set_updated_at
  BEFORE UPDATE ON public.admin_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.admin_role_permissions (
  role_id uuid NOT NULL REFERENCES public.admin_roles (id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.admin_permissions (code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE public.admin_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL,
  status public.admin_account_status NOT NULL DEFAULT 'active',
  is_owner boolean NOT NULL DEFAULT false,
  pin_hash text,
  pin_updated_at timestamptz,
  totp_secret_encrypted text,
  totp_enabled_at timestamptz,
  require_2fa boolean NOT NULL DEFAULT false,
  large_adjustment_limit bigint NOT NULL DEFAULT 100000,
  requires_second_approver_above bigint NOT NULL DEFAULT 500000,
  last_admin_login_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_profiles_display_name_length CHECK (char_length(display_name) BETWEEN 2 AND 64),
  CONSTRAINT admin_profiles_limits_nonneg CHECK (
    large_adjustment_limit >= 0 AND requires_second_approver_above >= 0
  )
);

CREATE UNIQUE INDEX admin_profiles_single_owner
  ON public.admin_profiles ((is_owner))
  WHERE is_owner = true AND deleted_at IS NULL;

CREATE TRIGGER admin_profiles_set_updated_at
  BEFORE UPDATE ON public.admin_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.admin_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.admin_profiles (user_id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.admin_roles (id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.admin_profiles (user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, role_id)
);

CREATE TABLE public.admin_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES public.admin_profiles (user_id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.admin_permissions (code) ON DELETE CASCADE,
  granted boolean NOT NULL,
  assigned_by uuid REFERENCES public.admin_profiles (user_id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, permission_code)
);

CREATE OR REPLACE FUNCTION public.is_active_admin(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles a
    WHERE a.user_id = p_user_id
      AND a.status = 'active'
      AND a.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.admin_has_permission(
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_profiles a
    WHERE a.user_id = p_user_id
      AND a.status = 'active'
      AND a.deleted_at IS NULL
      AND (
        a.is_owner = true
        OR EXISTS (
          SELECT 1
          FROM public.admin_permission_overrides o
          WHERE o.admin_user_id = a.user_id
            AND o.permission_code = p_permission
            AND o.granted = true
        )
        OR (
          NOT EXISTS (
            SELECT 1
            FROM public.admin_permission_overrides o
            WHERE o.admin_user_id = a.user_id
              AND o.permission_code = p_permission
              AND o.granted = false
          )
          AND EXISTS (
            SELECT 1
            FROM public.admin_role_assignments ra
            JOIN public.admin_role_permissions rp ON rp.role_id = ra.role_id
            WHERE ra.admin_user_id = a.user_id
              AND rp.permission_code = p_permission
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_active_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_has_permission(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(text, uuid) TO authenticated, service_role;

-- Seed suggested role presets (permissions remain individually editable).
INSERT INTO public.admin_roles (code, name, description, is_system) VALUES
  ('owner', 'Owner', 'Full platform control', true),
  ('super_admin', 'Super Admin', 'Broad operational access', true),
  ('game_manager', 'Game Manager', 'Game control and configuration', true),
  ('player_manager', 'Player Manager', 'Player support and suspension', true),
  ('credit_manager', 'Credit Manager', 'Credit requests and adjustments', true),
  ('support_viewer', 'Support Viewer', 'Tickets and announcements', true),
  ('report_viewer', 'Report Viewer', 'Reports and exports', true);

INSERT INTO public.admin_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.admin_roles r
CROSS JOIN public.admin_permissions p
WHERE r.code = 'owner';

INSERT INTO public.admin_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.admin_roles r
JOIN public.admin_permissions p ON p.code IN (
  'players.view', 'players.suspend', 'credits.view', 'credits.adjust',
  'games.view', 'games.control', 'games.configure', 'announcements.manage',
  'tickets.manage', 'reports.view', 'reports.export', 'admins.manage',
  'audit.view', 'system.settings'
)
WHERE r.code = 'super_admin';

INSERT INTO public.admin_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.admin_roles r
JOIN public.admin_permissions p ON p.code IN (
  'games.view', 'games.control', 'games.configure', 'audit.view'
)
WHERE r.code = 'game_manager';

INSERT INTO public.admin_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.admin_roles r
JOIN public.admin_permissions p ON p.code IN (
  'players.view', 'players.suspend', 'tickets.manage', 'audit.view'
)
WHERE r.code = 'player_manager';

INSERT INTO public.admin_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.admin_roles r
JOIN public.admin_permissions p ON p.code IN (
  'players.view', 'credits.view', 'credits.adjust', 'audit.view'
)
WHERE r.code = 'credit_manager';

INSERT INTO public.admin_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.admin_roles r
JOIN public.admin_permissions p ON p.code IN (
  'players.view', 'tickets.manage', 'announcements.manage'
)
WHERE r.code = 'support_viewer';

INSERT INTO public.admin_role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM public.admin_roles r
JOIN public.admin_permissions p ON p.code IN (
  'reports.view', 'reports.export', 'games.view', 'credits.view'
)
WHERE r.code = 'report_viewer';
