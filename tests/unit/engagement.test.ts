import { describe, expect, it } from "vitest";

import {
  ENGAGEMENT_MODULE,
  filterBetReceipts,
  formatSessionDuration,
  localizeJson,
  sessionBreakDue,
} from "@/modules/engagement";

describe("engagement helpers", () => {
  it("filters bet receipts by win/loss", () => {
    const rows = [
      { id: "1", is_win: true },
      { id: "2", is_win: false },
      { id: "3", is_win: true },
    ];

    expect(filterBetReceipts(rows, "all")).toHaveLength(3);
    expect(filterBetReceipts(rows, "wins").map((row) => row.id)).toEqual([
      "1",
      "3",
    ]);
    expect(filterBetReceipts(rows, "losses").map((row) => row.id)).toEqual([
      "2",
    ]);
  });

  it("detects session break due after configured minutes", () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    const startedAt = "2026-09-04T10:00:00.000Z";

    expect(sessionBreakDue(startedAt, 45, now)).toBe(true);
    expect(sessionBreakDue(startedAt, 200, now)).toBe(false);
    expect(sessionBreakDue(null, 45, now)).toBe(false);
  });

  it("localizes jsonb i18n maps with locale fallback", () => {
    expect(localizeJson({ en: "Hello", lo: "ສະບາຍດີ" }, "lo")).toBe(
      "ສະບາຍດີ",
    );
    expect(localizeJson({ en: "Hello" }, "lo")).toBe("Hello");
    expect(localizeJson(null, "en")).toBe("");
  });

  it("formats session duration for display", () => {
    const now = new Date("2026-09-04T12:30:00.000Z");
    expect(formatSessionDuration("2026-09-04T12:00:00.000Z", now)).toBe("30m");
    expect(formatSessionDuration("2026-09-04T10:00:00.000Z", now)).toBe(
      "2h 30m",
    );
    expect(formatSessionDuration(null, now)).toBe("0m");
  });

  it("exposes engagement module identity", () => {
    expect(ENGAGEMENT_MODULE).toBe("engagement");
  });
});
