import { describe, expect, it } from "vitest";

import {
  assertSameOrigin,
  detectImageMimeFromBytes,
  findExposedSecretKeys,
  FORBIDDEN_BROWSER_ENV_KEYS,
  requireSameOrigin,
  sanitizeUserErrorMessage,
  validateImageMagicBytes,
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

    expect(() =>
      requireSameOrigin(
        {
          headers: headers({
            origin: "https://evil.example",
            host: "localhost:3000",
          }),
        },
        { appUrl: "http://localhost:3000", nodeEnv: "production" },
      ),
    ).toThrow(/cross-origin/i);
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

  it("accepts real image magic bytes and rejects spoofed MIME", () => {
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const webp = Uint8Array.from([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectImageMimeFromBytes(png)).toBe("image/png");
    expect(detectImageMimeFromBytes(jpeg)).toBe("image/jpeg");
    expect(detectImageMimeFromBytes(webp)).toBe("image/webp");
    expect(
      validateImageMagicBytes({
        bytes: png,
        claimedType: "image/png",
        size: png.byteLength,
      }).ok,
    ).toBe(true);
    expect(
      validateImageMagicBytes({
        bytes: png,
        claimedType: "image/jpeg",
        size: png.byteLength,
      }).ok,
    ).toBe(false);
    expect(
      validateImageMagicBytes({
        bytes: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
        size: 12,
      }).ok,
    ).toBe(false);
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
