/**
 * Admin Console module: permissions, session guards, ops actions, UI.
 * Routes live under `src/app/admin`. Never reuse player session assumptions here.
 */

export const ADMIN_MODULE = "admin" as const;

export {
  ADMIN_PERMISSION_CODES,
  type AdminPermissionCode,
} from "@/modules/database";

export const ADMIN_NAV = [
  { href: "/admin", labelKey: "nav.dashboard", permission: null },
  { href: "/admin/players", labelKey: "nav.players", permission: "players.view" },
  { href: "/admin/credits", labelKey: "nav.credits", permission: "credits.view" },
  { href: "/admin/games", labelKey: "nav.games", permission: "games.view" },
  {
    href: "/admin/games/releases",
    labelKey: "admin.nav.releases",
    permission: "games.control",
  },
  {
    href: "/admin/games/config",
    labelKey: "admin.nav.config",
    permission: "games.configure",
  },
  {
    href: "/admin/admins",
    labelKey: "admin.nav.admins",
    permission: "admins.manage",
  },
  {
    href: "/admin/announcements",
    labelKey: "admin.nav.announcements",
    permission: "announcements.manage",
  },
  { href: "/admin/tickets", labelKey: "nav.tickets", permission: "tickets.manage" },
  {
    href: "/admin/missions",
    labelKey: "admin.nav.missions",
    permission: "system.settings",
  },
  {
    href: "/admin/flags",
    labelKey: "admin.nav.flags",
    permission: "system.settings",
  },
  {
    href: "/admin/assets",
    labelKey: "admin.nav.assets",
    permission: "system.settings",
  },
  {
    href: "/admin/qa",
    labelKey: "admin.nav.qa",
    permission: "admins.manage",
  },
  {
    href: "/admin/audit",
    labelKey: "admin.nav.audit",
    permission: "audit.view",
  },
  {
    href: "/admin/reports",
    labelKey: "admin.nav.reports",
    permission: "reports.view",
  },
  { href: "/admin/settings", labelKey: "nav.settings", permission: "system.settings" },
] as const;

export const GAME_LIFECYCLE_ORDER = [
  "draft",
  "qa",
  "owner_approved",
  "scheduled",
  "live",
  "disabled",
] as const;

export const REPORT_TYPES = [
  "players",
  "games",
  "credits",
  "activity",
  "support",
  "system",
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export type AdminSessionState = {
  is_admin: boolean;
  status?: string;
  is_owner?: boolean;
  display_name?: string;
  pin_set?: boolean;
  require_2fa?: boolean;
  totp_enabled?: boolean;
  permissions?: string[];
  large_adjustment_limit?: number;
  requires_second_approver_above?: number;
  last_admin_login_at?: string | null;
};

export function hasPermission(
  session: AdminSessionState | null | undefined,
  permission: string | null,
): boolean {
  if (!session?.is_admin) return false;
  if (!permission) return true;
  if (session.is_owner) return true;
  return (session.permissions ?? []).includes(permission);
}

export function pinSchemaValid(pin: string): boolean {
  return /^[0-9]{4,12}$/.test(pin);
}

export function canAdvanceRelease(
  from: string,
  to: string,
  isOwner: boolean,
): { ok: boolean; reason?: string } {
  const allowed: Record<string, string[]> = {
    draft: ["qa"],
    qa: ["owner_approved", "draft"],
    owner_approved: ["scheduled", "live", "qa"],
    scheduled: ["live", "disabled", "owner_approved"],
    live: ["disabled"],
    disabled: ["draft", "qa"],
  };
  if (!(allowed[from] ?? []).includes(to)) {
    return { ok: false, reason: `Invalid transition ${from} → ${to}` };
  }
  if ((to === "owner_approved" || to === "live") && !isOwner) {
    return { ok: false, reason: "Owner approval required" };
  }
  return { ok: true };
}

export function filterAuditRows<T extends { action_type: string; target_type?: string | null }>(
  rows: T[],
  filters: { action?: string; targetType?: string },
): T[] {
  return rows.filter((row) => {
    if (filters.action && !row.action_type.toLowerCase().includes(filters.action.toLowerCase())) {
      return false;
    }
    if (filters.targetType && row.target_type !== filters.targetType) {
      return false;
    }
    return true;
  });
}

export function serializeReportCsv(
  reportType: string,
  rows: Array<Record<string, unknown>>,
): string {
  if (rows.length === 0) {
    return `report_type,exported\n${reportType},empty\n`;
  }
  const keys = Object.keys(rows[0]!);
  const header = keys.join(",");
  const lines = rows.map((row) =>
    keys
      .map((key) => {
        const value = row[key];
        const text = value == null ? "" : String(value);
        return `"${text.replaceAll('"', '""')}"`;
      })
      .join(","),
  );
  return [`# ${reportType}`, header, ...lines].join("\n");
}
