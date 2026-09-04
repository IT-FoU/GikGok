/**
 * Database module boundary — schema lives in supabase/migrations.
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

export const ADMIN_PERMISSION_CODES = [
  "players.view",
  "players.suspend",
  "credits.view",
  "credits.adjust",
  "games.view",
  "games.control",
  "games.configure",
  "announcements.manage",
  "tickets.manage",
  "reports.view",
  "reports.export",
  "admins.manage",
  "audit.view",
  "system.settings",
] as const;

export type AdminPermissionCode = (typeof ADMIN_PERMISSION_CODES)[number];

export const STORAGE_BUCKETS = [
  "avatars",
  "ticket-attachments",
  "game-assets",
] as const;
