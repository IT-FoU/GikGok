import { describe, expect, it } from "vitest";

import {
  assertSameOrigin,
  findExposedSecretKeys,
  FORBIDDEN_BROWSER_ENV_KEYS,
  sanitizeUserErrorMessage,
  validateUploadFile,
} from "@/lib/security";
import {
  detectWebGLSupport,
  PERFORMANCE_BUDGETS,
  resolveGraphicsMode,
} from "@/lib/performance/graphics";

function headers(map: Record<string, string>) {
  return {
    get(name: string) {
      return map[name.toLowerCase()] ?? null;
    },
  };
}

describe("security helpers", () => {
  it("lists forbidden browser secret keys", () => {
    expect(FORBIDDEN_BROWSER_ENV_KEYS).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("detects exposed secrets in env-like objects", () => {
    expect(
      findExposedSecretKeys({
        SUPABASE_SERVICE_ROLE_KEY: "secret",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toEqual(["SUPABASE_SERVICE_ROLE_KEY"]);
  });

  it("enforces same-origin for mutating requests", () => {
    const ok = assertSameOrigin(
      {
        headers: headers({
          origin: "http://localhost:3000",
          host: "localhost:3000",
        }),
      },
      { appUrl: "http://localhost:3000", nodeEnv: "production" },
    );
    expect(ok.ok).toBe(true);

    const bad = assertSameOrigin(
      {
        headers: headers({
          origin: "https://evil.example",
          host: "localhost:3000",
        }),
      },
      { appUrl: "http://localhost:3000", nodeEnv: "production" },
    );
    expect(bad.ok).toBe(false);
  });

  it("validates uploads and sanitizes unsafe messages", () => {
    expect(
      validateUploadFile({ type: "image/png", size: 1000 }).ok,
    ).toBe(true);
    expect(
      validateUploadFile({ type: "application/pdf", size: 1000 }).ok,
    ).toBe(false);
    expect(sanitizeUserErrorMessage("jwt secret leaked")).toMatch(/try again/i);
  });
});

describe("graphics fallback", () => {
  it("falls back to 2d without WebGL", () => {
    expect(resolveGraphicsMode("auto", false)).toBe("2d");
    expect(resolveGraphicsMode("3d", false)).toBe("2d");
    expect(resolveGraphicsMode("3d", true)).toBe("3d");
    expect(resolveGraphicsMode("2d", true)).toBe("2d");
  });

  it("exposes performance budgets", () => {
    expect(PERFORMANCE_BUDGETS.jsBundleSoftMaxKb).toBeGreaterThan(100);
    expect(typeof detectWebGLSupport()).toBe("boolean");
  });
});
