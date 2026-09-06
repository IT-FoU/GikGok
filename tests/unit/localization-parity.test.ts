import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import en from "@/modules/localization/messages/en.json";
import lo from "@/modules/localization/messages/lo.json";

function flatten(
  value: unknown,
  prefix = "",
): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  if (!value || typeof value !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    Object.assign(out, flatten(child, path));
  }
  return out;
}

describe("localization catalogs", () => {
  const enFlat = flatten(en);
  const loFlat = flatten(lo);

  it("keeps English and Lao key parity", () => {
    expect(Object.keys(loFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it("does not leave Lao strings identical to English for narrative copy", () => {
    const narrativePrefixes = ["auth.", "status.", "errors.", "actionCodes."];
    const identical: string[] = [];
    for (const [key, enValue] of Object.entries(enFlat)) {
      if (!narrativePrefixes.some((p) => key.startsWith(p))) continue;
      // Brand tokens and protocol values may match.
      if (enValue === "GIKGOK" || enValue === "GIK") continue;
      if (loFlat[key] === enValue) identical.push(key);
    }
    expect(identical).toEqual([]);
  });

  it("covers FUTURE_LOCALES extensibility without requiring th.json yet", async () => {
    const mod = await import("@/modules/localization");
    expect(mod.FUTURE_LOCALES).toContain("th");
    expect(mod.SUPPORTED_LOCALES).toEqual(["lo", "en"]);
  });
});

describe("hard-coded UI string guard", () => {
  const roots = [
    "src/app/(player)/login",
    "src/app/(player)/register",
    "src/app/(player)/verify",
    "src/app/(player)/forgot-password",
    "src/app/(player)/reset-password",
    "src/app/(player)/account-status",
    "src/modules/player/auth-forms.tsx",
  ];

  const allowed = new Set([
    "GIKGOK",
    "GIK",
    "← GIKGOK",
    "+85620...",
    "email",
    "phone",
    "password",
    "nickname",
    "token",
    "contactType",
    "avatarPresetId",
    "confirmPassword",
    "Promise",
    "ActionResult",
    "AuthAction",
    "FormData",
  ]);

  function walk(path: string): string[] {
    try {
      const stat = readdirSync(path, { withFileTypes: true });
      return stat.flatMap((entry) => {
        const full = join(path, entry.name);
        if (entry.isDirectory()) return walk(full);
        if (/\.(tsx|ts)$/.test(entry.name)) return [full];
        return [];
      });
    } catch {
      return [path];
    }
  }

  it("rejects unapproved English literals in auth/status surfaces", () => {
    const offenders: string[] = [];
    for (const root of roots) {
      for (const file of walk(root)) {
        const text = readFileSync(file, "utf8");
        // JSX/text nodes with 3+ letter Latin words outside translate/t calls.
        const withoutCalls = text
          .replace(/translate\([^)]*\)/g, "")
          .replace(/\bt\([^)]*\)/g, "")
          .replace(/className=\{?`[^`]*`\}?/g, "")
          .replace(/className="[^"]*"/g, "")
          .replace(/:\s*Promise<[^>]+>/g, "")
          .replace(/import\s+[\s\S]*?from\s+["'][^"']+["'];?/g, "")
          .replace(/export type[\s\S]*?;/g, "");
        for (const match of withoutCalls.matchAll(
          />\s*([A-Za-z][A-Za-z0-9 ,.'’?\-]{2,})\s*</g,
        )) {
          const value = match[1].trim();
          if (allowed.has(value)) continue;
          if (/^[A-Za-z0-9_]+$/.test(value)) continue; // skip single identifiers/types
          offenders.push(`${file}: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
