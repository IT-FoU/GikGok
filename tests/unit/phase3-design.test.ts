import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  FUTURE_LOCALES,
  SUPPORTED_LOCALES,
  translate,
} from "@/modules/localization";
import {
  resolveColorMode,
  sanitizeAccentTheme,
} from "@/modules/theme/accents";
import { SoundManager } from "@/modules/sound/sound-manager";

describe("phase 3 design and localization", () => {
  it("supports Lao and English with Thai reserved", () => {
    expect(SUPPORTED_LOCALES).toEqual(["lo", "en"]);
    expect(DEFAULT_LOCALE).toBe("lo");
    expect(FUTURE_LOCALES).toContain("th");
  });

  it("translates keys with params and falls back to English", () => {
    expect(translate("en", "nav.home")).toBe("Home");
    expect(translate("lo", "nav.home")).toBe("ໜ້າຫຼັກ");
    expect(
      translate("en", "home.greeting", { name: "Ava" }),
    ).toBe("Welcome, Ava");
  });

  it("keeps owner accent sanitization and color mode resolution", () => {
    expect(sanitizeAccentTheme("red_white")).toBe("red_white");
    expect(sanitizeAccentTheme("purple")).toBe("green");
    expect(resolveColorMode("system", true)).toBe("dark");
    expect(resolveColorMode("light", true)).toBe("light");
  });

  it("no-ops sound manager in silent/muted modes", async () => {
    const manager = new SoundManager({ pack: "silent", volume: 0.5 });
    await expect(manager.play("ui_click")).resolves.toBeUndefined();
    manager.setPack("classic_casino");
    manager.setMuted(true);
    await expect(manager.play("ui_success")).resolves.toBeUndefined();
  });
});
