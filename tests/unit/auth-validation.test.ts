import { describe, expect, it } from "vitest";

import {
  loginSchema,
  mapAuthConflictMessage,
  registerSchema,
  resolvePlayerGate,
  validateAvatarFile,
} from "@/modules/player/auth";

describe("auth validation", () => {
  it("accepts valid email registration", () => {
    const parsed = registerSchema.safeParse({
      contactType: "email",
      email: "player@example.com",
      password: "password1",
      nickname: "PlayerOne",
      avatarPresetId: "lotus",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects short nickname and weak password", () => {
    const parsed = registerSchema.safeParse({
      contactType: "email",
      email: "player@example.com",
      password: "short",
      nickname: "A",
      avatarPresetId: "lotus",
    });
    expect(parsed.success).toBe(false);
  });

  it("requires E.164 phone for phone registration", () => {
    const bad = registerSchema.safeParse({
      contactType: "phone",
      phone: "0201234567",
      password: "password1",
      nickname: "PhoneUser",
      avatarPresetId: "koi",
    });
    expect(bad.success).toBe(false);

    const good = registerSchema.safeParse({
      contactType: "phone",
      phone: "+856201234567",
      password: "password1",
      nickname: "PhoneUser",
      avatarPresetId: "koi",
    });
    expect(good.success).toBe(true);
  });

  it("validates login payloads", () => {
    const parsed = loginSchema.safeParse({
      contactType: "email",
      email: "player@example.com",
      password: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("validates avatar mime and size", () => {
    expect(
      validateAvatarFile({ type: "image/png", size: 1024 }).ok,
    ).toBe(true);
    expect(
      validateAvatarFile({ type: "image/gif", size: 1024 }).ok,
    ).toBe(false);
    expect(
      validateAvatarFile({ type: "image/png", size: 3_000_000 }).ok,
    ).toBe(false);
  });

  it("maps conflict messages clearly", () => {
    expect(
      mapAuthConflictMessage("verified email already registered to another account"),
    ).toMatch(/verified email already belongs/i);
    expect(mapAuthConflictMessage("nickname already taken")).toMatch(
      /nickname is already taken/i,
    );
  });

  it("resolves player gate reasons", () => {
    expect(resolvePlayerGate({ authenticated: false }).reason).toBe(
      "unauthenticated",
    );
    expect(
      resolvePlayerGate({
        authenticated: true,
        has_profile: true,
        status: "suspended",
      }).reason,
    ).toBe("suspended");
    expect(
      resolvePlayerGate({
        authenticated: true,
        has_profile: true,
        status: "active",
        verified: true,
        can_play: true,
      }),
    ).toEqual({ canPlay: true, reason: "ok" });
  });
});
