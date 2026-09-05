import { describe, expect, it } from "vitest";

import { parseClientEnv } from "@/lib/env/client";

describe("client env validation", () => {
  it("accepts valid public Supabase variables", () => {
    const env = parseClientEnv({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test-key",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    });

    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://example.supabase.co");
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(
      "sb_publishable_test-key",
    );
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("rejects missing public variables", () => {
    expect(() =>
      parseClientEnv({
        NEXT_PUBLIC_SUPABASE_URL: undefined,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined,
      }),
    ).toThrow(/Invalid public environment variables/);
  });

  it("rejects invalid URL", () => {
    expect(() =>
      parseClientEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key",
      }),
    ).toThrow(/Invalid public environment variables/);
  });
});
