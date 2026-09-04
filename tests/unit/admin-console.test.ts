import { describe, expect, it } from "vitest";

import {
  ADMIN_MODULE,
  ADMIN_NAV,
  canAdvanceRelease,
  filterAuditRows,
  hasPermission,
  pinSchemaValid,
  REPORT_TYPES,
  serializeReportCsv,
  type AdminSessionState,
} from "@/modules/admin";

describe("admin console helpers", () => {
  it("exports module identity and nav", () => {
    expect(ADMIN_MODULE).toBe("admin");
    expect(ADMIN_NAV.length).toBeGreaterThan(10);
    expect(REPORT_TYPES).toContain("players");
  });

  it("validates PIN shape", () => {
    expect(pinSchemaValid("1234")).toBe(true);
    expect(pinSchemaValid("12")).toBe(false);
    expect(pinSchemaValid("abcd")).toBe(false);
  });

  it("enforces permission and owner bypass", () => {
    const viewer: AdminSessionState = {
      is_admin: true,
      permissions: ["players.view"],
    };
    expect(hasPermission(viewer, "players.view")).toBe(true);
    expect(hasPermission(viewer, "admins.manage")).toBe(false);
    expect(
      hasPermission({ is_admin: true, is_owner: true, permissions: [] }, "admins.manage"),
    ).toBe(true);
    expect(hasPermission({ is_admin: false }, null)).toBe(false);
  });

  it("gates owner-only release transitions", () => {
    expect(canAdvanceRelease("draft", "qa", false).ok).toBe(true);
    expect(canAdvanceRelease("qa", "owner_approved", false).ok).toBe(false);
    expect(canAdvanceRelease("qa", "owner_approved", true).ok).toBe(true);
    expect(canAdvanceRelease("live", "draft", true).ok).toBe(false);
  });

  it("filters audit rows and serializes CSV exports", () => {
    const filtered = filterAuditRows(
      [
        { action_type: "player.status", target_type: "player" },
        { action_type: "report.export", target_type: "report" },
      ],
      { action: "player", targetType: "player" },
    );
    expect(filtered).toHaveLength(1);

    const csv = serializeReportCsv("players", [
      { id: "1", nickname: 'A"B', status: "active" },
    ]);
    expect(csv).toContain("# players");
    expect(csv).toContain('A""B');
  });
});
