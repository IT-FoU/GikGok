import { describe, expect, it } from "vitest";

import {
  grantWelcomeCreditIdempotent,
  playerCanPlay,
} from "@/modules/player/auth-domain";
import {
  loginSchema,
  mapAuthConflictMessage,
  registerSchema,
  resolvePlayerGate,
  validateAvatarFile,
  NICKNAME_MAX,
  PHONE_OTP_STATUS,
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

  it("rejects nickname longer than schema max", () => {
    expect(NICKNAME_MAX).toBe(24);
    const parsed = registerSchema.safeParse({
      contactType: "email",
      email: "player@example.com",
      password: "password1",
      nickname: "a".repeat(25),
      avatarPresetId: "lotus",
    });
    expect(parsed.success).toBe(false);
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
    expect(validateAvatarFile({ type: "image/png", size: 1024 }).ok).toBe(true);
    expect(validateAvatarFile({ type: "image/gif", size: 1024 }).ok).toBe(false);
    expect(
      validateAvatarFile({ type: "image/png", size: 3_000_000 }).ok,
    ).toBe(false);
  });

  it("maps conflict messages clearly", () => {
    expect(
      mapAuthConflictMessage(
        "verified email already registered to another account",
      ),
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

  it("marks phone OTP as waiting for SMS provider", () => {
    expect(PHONE_OTP_STATUS).toBe("WAITING_SMS_PROVIDER");
  });
});

describe("welcome credit domain rules", () => {
  it("grants once when verified and never granted", () => {
    expect(
      grantWelcomeCreditIdempotent({
        verified: true,
        alreadyGranted: false,
        amount: 50_000,
      }),
    ).toEqual({ granted: true, already_granted: false, amount: 50_000 });
  });

  it("is idempotent when already granted", () => {
    expect(
      grantWelcomeCreditIdempotent({
        verified: true,
        alreadyGranted: true,
        amount: 50_000,
      }),
    ).toEqual({ granted: false, already_granted: true, amount: 0 });
  });

  it("refuses unverified players", () => {
    expect(() =>
      grantWelcomeCreditIdempotent({
        verified: false,
        alreadyGranted: false,
        amount: 50_000,
      }),
    ).toThrow(/verify/i);
  });

  it("requires active verified status to play", () => {
    expect(playerCanPlay({ status: "active", verified: true })).toBe(true);
    expect(playerCanPlay({ status: "active", verified: false })).toBe(false);
    expect(playerCanPlay({ status: "suspended", verified: true })).toBe(false);
    expect(playerCanPlay({ status: "banned", verified: true })).toBe(false);
  });
});
