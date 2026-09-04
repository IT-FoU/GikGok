/**
 * Database module boundary.
 * Schema lives in `supabase/migrations`; generated types land in `src/lib/supabase/types.ts`.
 */
export const DATABASE_MODULE = "database" as const;

export const REQUIRED_TABLE_GROUPS = [
  "profiles_and_settings",
  "admin_roles_and_permissions",
  "ledger_and_credit_requests",
  "games_rounds_bets_receipts",
  "engagement_and_support",
  "audit_system_and_ops",
] as const;
