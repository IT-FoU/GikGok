"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  UPLOAD_MAX_BYTES,
  validateImageMagicBytes,
} from "@/lib/security";
import {
  deletionRequestSchema,
  loginSchema,
  mapAuthConflictMessage,
  otpSchema,
  profileUpdateSchema,
  registerSchema,
  resetPasswordSchema,
  resetRequestSchema,
  settingsUpdateSchema,
} from "@/modules/player/auth";
import type { ActionResult } from "@/modules/player/auth-shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type { ActionResult };

function fieldErrorsFromZod(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string[]> {
  const flat = error.flatten().fieldErrors;
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value?.length) result[key] = value;
  }
  return result;
}

export async function registerAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    contactType: formData.get("contactType"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
    nickname: formData.get("nickname"),
    avatarPresetId: formData.get("avatarPresetId") || "lotus",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const input = parsed.data;
  const supabase = await createServerSupabaseClient();
  const email =
    input.contactType === "email"
      ? input.email!.trim().toLowerCase()
      : undefined;
  const phone =
    input.contactType === "phone" ? input.phone!.trim() : undefined;

  const signUpOptions = {
    password: input.password,
    options: {
      data: {
        nickname: input.nickname,
        avatar_preset: input.avatarPresetId,
        contact_type: input.contactType,
      },
    },
  };

  const { data, error } =
    input.contactType === "email"
      ? await supabase.auth.signUp({
          email: email!,
          ...signUpOptions,
        })
      : await supabase.auth.signUp({
          phone: phone!,
          ...signUpOptions,
        });

  if (error) {
    return { ok: false, message: mapAuthConflictMessage(error.message) };
  }

  if (!data.user) {
    return { ok: false, message: "Registration failed. Please try again." };
  }

  const { error: profileError } = await supabase.rpc(
    "complete_player_onboarding",
    {
      p_nickname: input.nickname,
      p_contact_type: input.contactType,
      p_contact_value: email ?? phone!,
      p_avatar_preset: input.avatarPresetId,
    },
  );

  if (profileError) {
    return { ok: false, message: mapAuthConflictMessage(profileError.message) };
  }

  redirect(
    `/verify?channel=${input.contactType}${
      email ? `&email=${encodeURIComponent(email)}` : ""
    }${phone ? `&phone=${encodeURIComponent(phone)}` : ""}`,
  );
}

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    contactType: formData.get("contactType"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const input = parsed.data;
  const supabase = await createServerSupabaseClient();

  const { error } =
    input.contactType === "email"
      ? await supabase.auth.signInWithPassword({
          email: input.email!.trim().toLowerCase(),
          password: input.password,
        })
      : await supabase.auth.signInWithPassword({
          phone: input.phone!.trim(),
          password: input.password,
        });

  if (error) {
    return { ok: false, message: "Invalid credentials. Please try again." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: access } = await supabase.rpc("get_player_access_state", {
      p_user_id: user.id,
    });
    const state = (access ?? {}) as {
      status?: string;
      verified?: boolean;
      can_play?: boolean;
      deletion_requested?: boolean;
    };

    if (state.status === "banned") {
      await supabase.auth.signOut();
      return {
        ok: false,
        message: "This account is banned and cannot sign in.",
      };
    }

    if (state.deletion_requested || state.status === "deletion_requested") {
      return {
        ok: false,
        message: "This account has a pending deletion request.",
      };
    }

    if (!state.verified) {
      redirect("/verify");
    }

    if (state.status === "suspended") {
      redirect("/account-status?reason=suspended");
    }
  }

  redirect("/home");
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function verifyOtpAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = otpSchema.safeParse({
    contactType: formData.get("contactType"),
    email: formData.get("email") || undefined,
    phone: formData.get("phone") || undefined,
    token: formData.get("token"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Enter a valid 6-digit code.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const input = parsed.data;
  const supabase = await createServerSupabaseClient();

  if (input.contactType === "phone") {
    return {
      ok: false,
      message:
        "Phone OTP is prepared but waiting for an Owner-selected SMS provider. Use email verification for now.",
    };
  }

  const { error } = await supabase.auth.verifyOtp({
    email: input.email!.trim().toLowerCase(),
    token: input.token,
    type: "email",
  });

  if (error) {
    return { ok: false, message: "Invalid or expired verification code." };
  }

  const { error: markError } = await supabase.rpc("mark_contact_verified", {
    p_channel: input.contactType,
  });

  if (markError) {
    return { ok: false, message: mapAuthConflictMessage(markError.message) };
  }

  const { error: grantError } = await supabase.rpc("grant_welcome_credit");

  if (grantError) {
    return { ok: false, message: mapAuthConflictMessage(grantError.message) };
  }

  revalidatePath("/home");
  redirect("/home");
}

export async function requestPasswordResetAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const genericMessage =
    "If an account exists for that email, a reset link was sent.";

  const parsed = resetRequestSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Enter a valid email.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const supabase = await createServerSupabaseClient();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Never expose whether the account exists.
  await supabase.auth.resetPasswordForEmail(
    parsed.data.email.trim().toLowerCase(),
    { redirectTo: `${origin}/reset-password` },
  );

  return { ok: true, message: genericMessage };
}

export async function updatePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  redirect("/login?reset=1");
}

export async function updateProfileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = profileUpdateSchema.safeParse({
    nickname: formData.get("nickname"),
    avatarPresetId: formData.get("avatarPresetId") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in required." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      nickname: parsed.data.nickname,
      ...(parsed.data.avatarPresetId
        ? {
            avatar_kind: "preset" as const,
            avatar_preset: parsed.data.avatarPresetId,
            avatar_url: null,
          }
        : {}),
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: mapAuthConflictMessage(error.message) };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Profile updated." };
}

export async function updateSettingsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = settingsUpdateSchema.safeParse({
    language: formData.get("language"),
    soundPack: formData.get("soundPack"),
    soundVolume: formData.get("soundVolume"),
    graphicsMode: formData.get("graphicsMode"),
    graphicsQuality: formData.get("graphicsQuality"),
    fpsCap: formData.get("fpsCap"),
    shadowsEnabled: formData.get("shadowsEnabled") === "on",
    effectsEnabled: formData.get("effectsEnabled") === "on",
    reduceMotion: formData.get("reduceMotion") === "on",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in required." };
  }

  const { error } = await supabase.from("player_settings").upsert({
    player_id: user.id,
    language: parsed.data.language,
    sound_pack: parsed.data.soundPack,
    sound_volume: parsed.data.soundVolume,
    graphics_mode: parsed.data.graphicsMode,
    graphics_quality: parsed.data.graphicsQuality,
    fps_cap: parsed.data.fpsCap,
    shadows_enabled: parsed.data.shadowsEnabled,
    effects_enabled: parsed.data.effectsEnabled,
    reduce_motion: parsed.data.reduceMotion,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Settings saved." };
}

export async function uploadAvatarAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("avatar");
  if (!(file instanceof File)) {
    return { ok: false, message: "Choose an image file." };
  }

  const bytes = await file.arrayBuffer();
  const validation = validateImageMagicBytes({
    bytes,
    claimedType: file.type || null,
    size: file.size,
    maxBytes: UPLOAD_MAX_BYTES.avatar,
  });
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in required." };
  }

  const extension =
    validation.mime === "image/png"
      ? "png"
      : validation.mime === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${user.id}/avatar.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { upsert: true, contentType: validation.mime });

  if (uploadError) {
    return { ok: false, message: uploadError.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const { error } = await supabase
    .from("profiles")
    .update({
      avatar_kind: "uploaded",
      avatar_url: publicUrl,
      avatar_preset: null,
    })
    .eq("id", user.id);

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath("/profile");
  return { ok: true, message: "Avatar uploaded." };
}

export async function requestDeletionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = deletionRequestSchema.safeParse({
    reason: formData.get("reason") || undefined,
    confirm: formData.get("confirm") === "on" ? true : false,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Confirm deletion to continue.",
      fieldErrors: fieldErrorsFromZod(parsed.error),
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("request_account_deletion", {
    p_reason: parsed.data.reason,
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  await supabase.auth.signOut();
  redirect("/?deleted=1");
}
