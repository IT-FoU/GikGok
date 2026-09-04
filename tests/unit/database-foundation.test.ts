import { describe, expect, it } from "vitest";

import {
  ADMIN_PERMISSION_CODES,
  REQUIRED_TABLE_GROUPS,
  STORAGE_BUCKETS,
} from "@/modules/database";
import type { Database, LedgerEntryType } from "@/lib/supabase/types";

describe("database foundation", () => {
  it("covers required table groups", () => {
    expect(REQUIRED_TABLE_GROUPS).toHaveLength(6);
  });

  it("lists all required admin permissions", () => {
    expect(ADMIN_PERMISSION_CODES).toContain("credits.adjust");
    expect(ADMIN_PERMISSION_CODES).toContain("admins.manage");
    expect(ADMIN_PERMISSION_CODES).toHaveLength(14);
  });

  it("defines required storage buckets", () => {
    expect(STORAGE_BUCKETS).toEqual([
      "avatars",
      "ticket-attachments",
      "game-assets",
    ]);
  });

  it("exposes typed ledger entry union", () => {
    const sample: LedgerEntryType = "welcome_credit";
    expect(sample).toBe("welcome_credit");

    type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
    const status: ProfileRow["status"] = "active";
    expect(status).toBe("active");
  });
});
