import { z } from "zod";

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 24;
export const PASSWORD_MIN = 8;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const AVATAR_PRESETS = [
  { id: "lotus", label: "Lotus" },
  { id: "dragon", label: "Dragon" },
  { id: "tiger", label: "Tiger" },
  { id: "phoenix", label: "Phoenix" },
  { id: "koi", label: "Koi" },
  { id: "lantern", label: "Lantern" },
] as const;

export type AvatarPresetId = (typeof AVATAR_PRESETS)[number]["id"];

const nicknameSchema = z
  .string()
  .trim()
  .min(NICKNAME_MIN, "Nickname must be at least 2 characters")
  .max(NICKNAME_MAX, "Nickname must be at most 24 characters")
  .regex(/^[\p{L}\p{N}_.-]+$/u, "Nickname has invalid characters");

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, "Password must be at least 8 characters");

const emailSchema = z.string().trim().email("Enter a valid email");
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Use E.164 phone format, e.g. +85620...");

export const registerSchema = z
  .object({
    contactType: z.enum(["email", "phone"]),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: passwordSchema,
    nickname: nicknameSchema,
    avatarPresetId: z.enum([
      "lotus",
      "dragon",
      "tiger",
      "phoenix",
      "koi",
      "lantern",
    ]),
  })
  .superRefine((value, ctx) => {
    if (value.contactType === "email") {
      const parsed = emailSchema.safeParse(value.email);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: parsed.error.issues[0]?.message ?? "Invalid email",
        });
      }
    } else {
      const parsed = phoneSchema.safeParse(value.phone);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: parsed.error.issues[0]?.message ?? "Invalid phone",
        });
      }
    }
  });

export const loginSchema = z
  .object({
    contactType: z.enum(["email", "phone"]),
    email: z.string().optional(),
    phone: z.string().optional(),
    password: z.string().min(1, "Password is required"),
  })
  .superRefine((value, ctx) => {
    if (value.contactType === "email") {
      const parsed = emailSchema.safeParse(value.email);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["email"],
          message: parsed.error.issues[0]?.message ?? "Invalid email",
        });
      }
    } else {
      const parsed = phoneSchema.safeParse(value.phone);
      if (!parsed.success) {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: parsed.error.issues[0]?.message ?? "Invalid phone",
        });
      }
    }
  });

export const otpSchema = z.object({
  contactType: z.enum(["email", "phone"]),
  email: z.string().optional(),
  phone: z.string().optional(),
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const resetRequestSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const profileUpdateSchema = z.object({
  nickname: nicknameSchema,
  avatarPresetId: z
    .enum(["lotus", "dragon", "tiger", "phoenix", "koi", "lantern"])
    .optional(),
});

export const settingsUpdateSchema = z.object({
  language: z.enum(["lo", "en"]),
  soundPack: z.enum(["classic_casino", "arcade", "silent"]),
  soundVolume: z.coerce.number().min(0).max(100),
  graphicsMode: z.enum(["auto", "2d", "3d"]),
  graphicsQuality: z.enum(["low", "medium", "high"]),
  fpsCap: z.coerce
    .number()
    .refine((n) => [30, 45, 60, 120].includes(n), "Invalid FPS cap"),
  shadowsEnabled: z.boolean(),
  effectsEnabled: z.boolean(),
  reduceMotion: z.boolean(),
});

export const deletionRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  confirm: z.literal(true),
});

export function validateAvatarFile(file: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; message: string } {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, message: "Avatar must be JPG, PNG, or WebP" };
  }
  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return { ok: false, message: "Avatar must be 2 MB or smaller" };
  }
  return { ok: true };
}

export function mapAuthConflictMessage(errorMessage: string): string {
  const lower = errorMessage.toLowerCase();
  if (lower.includes("verified email already registered")) {
    return "This verified email already belongs to another account.";
  }
  if (lower.includes("verified phone already registered")) {
    return "This verified phone already belongs to another account.";
  }
  if (lower.includes("nickname already taken")) {
    return "That nickname is already taken. Please choose another.";
  }
  if (lower.includes("user already registered")) {
    return "An account with this contact already exists. Try signing in.";
  }
  return errorMessage;
}

export type PlayerGateReason =
  | "unauthenticated"
  | "profile_required"
  | "verification_required"
  | "suspended"
  | "banned"
  | "deletion_requested"
  | "ok";

export function resolvePlayerGate(access: {
  authenticated?: boolean;
  has_profile?: boolean;
  verified?: boolean;
  status?: string;
  deletion_requested?: boolean;
  can_play?: boolean;
}): { canPlay: boolean; reason: PlayerGateReason } {
  if (!access.authenticated) {
    return { canPlay: false, reason: "unauthenticated" };
  }
  if (!access.has_profile) {
    return { canPlay: false, reason: "profile_required" };
  }
  if (access.deletion_requested || access.status === "deletion_requested") {
    return { canPlay: false, reason: "deletion_requested" };
  }
  if (access.status === "banned") {
    return { canPlay: false, reason: "banned" };
  }
  if (access.status === "suspended") {
    return { canPlay: false, reason: "suspended" };
  }
  if (!access.verified) {
    return { canPlay: false, reason: "verification_required" };
  }
  if (access.can_play) {
    return { canPlay: true, reason: "ok" };
  }
  return { canPlay: false, reason: "verification_required" };
}

/** Phone OTP requires an Owner-selected SMS provider — architecture only until configured. */
export const PHONE_OTP_STATUS = "WAITING_SMS_PROVIDER" as const;
