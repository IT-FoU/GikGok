"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireSameOrigin } from "@/lib/security";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { pinSchemaValid, REPORT_TYPES, type ReportType } from "@/modules/admin";
import { requireAdminSession } from "@/modules/admin/guards";
import type { ActionResult } from "@/modules/player/auth-shared";

const TICKET_ATTACHMENT_BUCKET = "ticket-attachments";

async function assertMutatingOrigin() {
  requireSameOrigin(
    { headers: await headers() },
    { allowMissingInDev: true },
  );
}

function failFromError(error: { message: string } | null): ActionResult {
  const raw = error?.message ?? "Unexpected error";
  const lower = raw.toLowerCase();
  if (lower.includes("pin")) {
    return {
      ok: false,
      code: "ADMIN_PIN_FAILED",
      message: "Admin PIN verification failed.",
    };
  }
  if (lower.includes("2fa") || lower.includes("mfa") || lower.includes("aal")) {
    return {
      ok: false,
      code: "ADMIN_MFA_FAILED",
      message: "Admin MFA verification failed.",
    };
  }
  if (lower.includes("permission") || lower.includes("access required")) {
    return {
      ok: false,
      code: "PERMISSION_DENIED",
      message: "You do not have permission for this action.",
    };
  }
  if (lower.includes("otp") && lower.includes("aal2")) {
    return {
      ok: false,
      code: "ADMIN_OTP_MISUSE",
      message:
        "Use authenticator MFA for 2FA; do not submit OTP codes to admin actions.",
    };
  }
  return {
    ok: false,
    code: "AUTH_GENERIC",
    message: "Request could not be completed.",
  };
}


function sensitiveFields(formData: FormData) {
  const pin = String(formData.get("pin") ?? "").trim() || null;
  // OTP codes are verified only via Supabase Auth MFA (aal2), never as RPC args.
  return { pin, otp: null as string | null };
}

function revalidateAdmin(...paths: string[]) {
  for (const path of paths) revalidatePath(path);
}

export async function setAdminPinAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const pin = String(formData.get("pin") ?? "");
  if (!pinSchemaValid(pin)) {
    return { ok: false, message: "PIN must be 4–12 digits." };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_admin_pin", { p_pin: pin });
  if (error) return failFromError(error);
  revalidateAdmin("/admin", "/admin/settings");
  return { ok: true, message: "Admin PIN saved." };
}

export async function verifyAdminPinAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const pin = String(formData.get("pin") ?? "");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("verify_admin_pin", { p_pin: pin });
  if (error) return failFromError(error);
  return data
    ? { ok: true, message: "PIN verified for 5 minutes." }
    : { ok: false, message: "Invalid PIN." };
}

export async function setAdmin2faAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const supabase = await createServerSupabaseClient();

  if (enabled) {
    // Enrollment / verification of the TOTP factor must use Supabase Auth MFA.
    // This RPC only flips the admin_security flag after a verified factor exists.
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) return failFromError(factors.error);
    const verified = (factors.data?.totp ?? []).some((f) => f.status === "verified");
    if (!verified) {
      return {
        ok: false,
        message:
          "Enroll and verify Supabase Auth TOTP MFA before enabling admin 2FA.",
      };
    }
  }

  const { error } = await supabase.rpc("set_admin_2fa", {
    p_enabled: enabled,
    p_secret: null,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/settings");
  return {
    ok: true,
    message: enabled
      ? "Admin 2FA enabled (Supabase Auth MFA)."
      : "Admin 2FA disabled.",
  };
}

export async function startAdminMfaEnrollAction(): Promise<
  ActionResult & { factorId?: string; qr?: string; secret?: string }
> {
  await assertMutatingOrigin();
  const supabase = await createServerSupabaseClient();
  const enrolled = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "GIKGOK Admin",
  });
  if (enrolled.error) return failFromError(enrolled.error);
  return {
    ok: true,
    code: "ADMIN_MFA_ENROLL_STARTED",
    message: "Scan the QR code with your authenticator app, then confirm with a code.",
    factorId: enrolled.data.id,
    qr: enrolled.data.totp.qr_code,
    secret: enrolled.data.totp.secret,
  };
}

export async function confirmAdminMfaEnrollAction(
  formData: FormData,
): Promise<ActionResult> {
  await assertMutatingOrigin();
  const factorId = String(formData.get("factorId") ?? "").trim();
  const code = String(formData.get("otp") ?? "").trim();
  if (!factorId || !/^\d{6}$/.test(code) || code === "000000") {
    return { ok: false, message: "Invalid enrollment code." };
  }

  const supabase = await createServerSupabaseClient();
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) return failFromError(challenge.error);

  const verified = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) return failFromError(verified.error);

  const { error } = await supabase.rpc("set_admin_2fa", {
    p_enabled: true,
    p_secret: null,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/settings", "/admin/mfa");
  return { ok: true, message: "Authenticator enrolled. Admin 2FA is enabled." };
}

export async function verifyAdmin2faAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const code = String(formData.get("otp") ?? "").trim();
  if (!/^\d{6}$/.test(code) || code === "000000") {
    return { ok: false, message: "Invalid 2FA code." };
  }

  const supabase = await createServerSupabaseClient();

  // Challenge + verify against Supabase Auth MFA so the JWT reaches aal2.
  // Do not call verify_admin_2fa — that RPC no longer mints confirmation stamps.
  const factors = await supabase.auth.mfa.listFactors();
  if (factors.error) return failFromError(factors.error);
  const totp = (factors.data?.totp ?? []).find((f) => f.status === "verified");
  if (!totp) {
    return { ok: false, message: "No verified TOTP factor enrolled." };
  }

  const challenge = await supabase.auth.mfa.challenge({ factorId: totp.id });
  if (challenge.error) return failFromError(challenge.error);

  const verified = await supabase.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.data.id,
    code,
  });
  if (verified.error) return failFromError(verified.error);

  revalidateAdmin("/admin", "/admin/mfa", "/admin/settings");
  return { ok: true, message: "Authenticator verified. Session upgraded to aal2." };
}

export async function createAdminAccountAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const userId = String(formData.get("userId") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const roleCode = String(formData.get("roleCode") ?? "support_viewer").trim();
  const isOwner = String(formData.get("isOwner") ?? "") === "true";
  const { pin, otp } = sensitiveFields(formData);

  if (!userId || displayName.length < 2) {
    return { ok: false, message: "User ID and display name required." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("create_admin_account", {
    p_user_id: userId,
    p_display_name: displayName,
    p_role_code: roleCode,
    p_is_owner: isOwner,
    p_pin: pin,
    p_otp: otp,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/admins", "/admin/audit");
  return { ok: true, message: "Admin account created." };
}

export async function setAdminStatusAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const targetId = String(formData.get("targetAdminId") ?? "").trim();
  const status = String(formData.get("status") ?? "") as "active" | "disabled";
  const { pin, otp } = sensitiveFields(formData);
  if (!targetId || (status !== "active" && status !== "disabled")) {
    return { ok: false, message: "Target and status required." };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_admin_status", {
    p_target_admin_id: targetId,
    p_status: status,
    p_pin: pin,
    p_otp: otp,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/admins", "/admin/audit");
  return { ok: true, message: `Admin marked ${status}.` };
}

export async function assignAdminRoleAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const targetId = String(formData.get("targetAdminId") ?? "").trim();
  const roleCode = String(formData.get("roleCode") ?? "").trim();
  const { pin, otp } = sensitiveFields(formData);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("assign_admin_role", {
    p_target_admin_id: targetId,
    p_role_code: roleCode,
    p_pin: pin,
    p_otp: otp,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/admins", "/admin/audit");
  return { ok: true, message: "Role assigned." };
}

export async function setPermissionOverrideAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const targetId = String(formData.get("targetAdminId") ?? "").trim();
  const permission = String(formData.get("permission") ?? "").trim();
  const granted = String(formData.get("granted") ?? "") === "true";
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const { pin, otp } = sensitiveFields(formData);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_admin_permission_override", {
    p_target_admin_id: targetId,
    p_permission: permission,
    p_granted: granted,
    p_reason: reason,
    p_pin: pin,
    p_otp: otp,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/admins", "/admin/audit");
  return { ok: true, message: "Permission override saved." };
}

export async function setPlayerStatusAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const playerId = String(formData.get("playerId") ?? "").trim();
  const status = String(formData.get("status") ?? "") as
    | "active"
    | "suspended"
    | "banned";
  const reason = String(formData.get("reason") ?? "").trim();
  const { pin, otp } = sensitiveFields(formData);
  if (!playerId || !reason) {
    return { ok: false, message: "Player and reason required." };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_player_status_admin", {
    p_player_id: playerId,
    p_status: status,
    p_reason: reason,
    p_pin: pin,
    p_otp: otp,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/players", "/admin/audit");
  return { ok: true, message: `Player status → ${status}.` };
}

export async function upsertAnnouncementAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const titleEn = String(formData.get("titleEn") ?? "").trim();
  const titleLo = String(formData.get("titleLo") ?? "").trim();
  const bodyEn = String(formData.get("bodyEn") ?? "").trim();
  const bodyLo = String(formData.get("bodyLo") ?? "").trim();
  const status = String(formData.get("status") ?? "draft");
  const id = String(formData.get("id") ?? "").trim() || null;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("upsert_announcement_admin", {
    p_title_i18n: { en: titleEn, lo: titleLo || titleEn } as Json,
    p_body_i18n: { en: bodyEn, lo: bodyLo || bodyEn } as Json,
    p_status: status,
    p_id: id,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/announcements", "/home");
  return { ok: true, message: "Announcement saved." };
}

export async function updateTicketStatusAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const ticketId = String(formData.get("ticketId") ?? "").trim();
  const status = String(formData.get("status") ?? "");
  const reply = String(formData.get("reply") ?? "").trim() || null;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_ticket_status_admin", {
    p_ticket_id: ticketId,
    p_status: status,
    p_reply: reply,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/tickets");
  return { ok: true, message: "Ticket updated." };
}

export async function upsertMissionAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const code = String(formData.get("code") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const targetCount = Number(formData.get("targetCount") ?? 1);
  const rewardAmount = Number(formData.get("rewardAmount") ?? 0);
  const isEnabled = String(formData.get("isEnabled") ?? "true") === "true";
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("upsert_mission_admin", {
    p_code: code,
    p_title_i18n: { en: title, lo: title } as Json,
    p_description_i18n: { en: description, lo: description } as Json,
    p_target_count: targetCount,
    p_reward_amount: rewardAmount,
    p_is_enabled: isEnabled,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/missions", "/missions");
  return { ok: true, message: "Mission saved." };
}

export async function upsertAchievementAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const code = String(formData.get("code") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const isEnabled = String(formData.get("isEnabled") ?? "true") === "true";
  const badge = String(formData.get("badgeAssetKey") ?? "").trim() || null;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("upsert_achievement_admin", {
    p_code: code,
    p_title_i18n: { en: title, lo: title } as Json,
    p_description_i18n: { en: description, lo: description } as Json,
    p_is_enabled: isEnabled,
    p_badge_asset_key: badge,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/missions", "/achievements");
  return { ok: true, message: "Achievement / badge saved." };
}

export async function setFeatureFlagAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const key = String(formData.get("key") ?? "").trim();
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const payloadRaw = String(formData.get("payload") ?? "").trim();
  let payload: Json = {};
  if (payloadRaw) {
    try {
      payload = JSON.parse(payloadRaw) as Json;
    } catch {
      return { ok: false, message: "Payload must be JSON." };
    }
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_feature_flag_admin", {
    p_key: key,
    p_enabled: enabled,
    p_payload: payload,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/flags");
  return { ok: true, message: `Flag ${key} → ${enabled ? "on" : "off"}.` };
}

export async function setSystemSettingAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const key = String(formData.get("key") ?? "").trim();
  const valueRaw = String(formData.get("value") ?? "").trim();
  let value: Json;
  try {
    value = JSON.parse(valueRaw) as Json;
  } catch {
    value = valueRaw as unknown as Json;
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_system_setting_admin", {
    p_key: key,
    p_value: value,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/settings");
  return { ok: true, message: `Setting ${key} saved.` };
}

export async function setMaintenanceAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const isActive = String(formData.get("isActive") ?? "") === "true";
  const message = String(formData.get("message") ?? "").trim();
  const { pin, otp } = sensitiveFields(formData);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_maintenance_admin", {
    p_is_active: isActive,
    p_message_i18n: { en: message, lo: message } as Json,
    p_pin: pin,
    p_otp: otp,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin", "/admin/settings", "/home");
  return {
    ok: true,
    message: isActive ? "Maintenance mode ON." : "Maintenance mode OFF.",
  };
}

export async function createGameVersionAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const gameId = String(formData.get("gameId") ?? "").trim();
  const configRaw = String(formData.get("config") ?? "").trim();
  const activate = String(formData.get("activate") ?? "") === "true";
  let config: Json;
  try {
    config = JSON.parse(configRaw || "{}") as Json;
  } catch {
    return { ok: false, message: "Config must be JSON." };
  }
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("create_game_version_admin", {
    p_game_id: gameId,
    p_config: config,
    p_activate: activate,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/games/config", "/admin/audit");
  return { ok: true, message: "Game version created." };
}

export async function advanceGameReleaseAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const gameId = String(formData.get("gameId") ?? "").trim();
  const toStatus = String(formData.get("toStatus") ?? "").trim();
  const { pin, otp } = sensitiveFields(formData);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("advance_game_release", {
    p_game_id: gameId,
    p_to_status: toStatus,
    p_pin: pin,
    p_otp: otp,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/games", "/admin/games/releases", "/home");
  return { ok: true, message: `${gameId} → ${toStatus}.` };
}

export async function upsertAssetAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const key = String(formData.get("key") ?? "").trim();
  const kind = String(formData.get("kind") ?? "other").trim();
  const storagePath = String(formData.get("storagePath") ?? "").trim() || null;
  const rightsCleared = String(formData.get("rightsCleared") ?? "") === "true";
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("upsert_asset_metadata_admin", {
    p_key: key,
    p_kind: kind,
    p_storage_path: storagePath,
    p_rights_cleared: rightsCleared,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/assets");
  return { ok: true, message: "Asset metadata saved." };
}

export async function registerQaAccountAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const playerId = String(formData.get("playerId") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const { pin, otp } = sensitiveFields(formData);
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("register_qa_account", {
    p_player_id: playerId,
    p_label: label,
    p_notes: notes,
    p_pin: pin,
    p_otp: otp,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/qa", "/admin/audit");
  return { ok: true, message: "QA account registered (analytics-isolated)." };
}

export async function exportReportAction(formData: FormData): Promise<ActionResult> {
  await assertMutatingOrigin();
  const reportType = String(formData.get("reportType") ?? "") as ReportType;
  if (!REPORT_TYPES.includes(reportType)) {
    return { ok: false, message: "Unknown report type." };
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("export_admin_report", {
    p_report_type: reportType,
  });
  if (error) return failFromError(error);
  revalidateAdmin("/admin/reports", "/admin/audit");
  return {
    ok: true,
    message: `Exported ${reportType} report.`,
    data: data as Record<string, unknown>,
  };
}

/**
 * Manual admin retry for Storage orphans.
 * There is no automatic scheduler consumer — this is the only cleanup path.
 * Orphan rows alone do not authorize deletion; claim/validate RPCs re-check
 * path provenance and active attachment references first.
 */
export async function retryStorageOrphanCleanupAction(
  formData: FormData,
): Promise<ActionResult> {
  await assertMutatingOrigin();
  await requireAdminSession("tickets.manage");

  const rawLimit = Number(formData.get("limit") ?? 10);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(25, Math.max(1, Math.floor(rawLimit)))
    : 10;

  const supabase = await createServerSupabaseClient();
  // Generated Database types lag behind forward migrations for these RPCs.
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

  const { data, error } = await rpc("claim_storage_orphan_retry_batch", {
    p_limit: limit,
  });
  if (error) return failFromError(error);

  const batch = (Array.isArray(data) ? data : []) as Array<{
    id: string;
    bucket_id: string;
    object_path: string;
    attempts?: number;
  }>;

  let resolved = 0;
  let failed = 0;

  for (const item of batch) {
    if (
      item.bucket_id !== TICKET_ATTACHMENT_BUCKET ||
      typeof item.object_path !== "string" ||
      !item.object_path
    ) {
      await rpc("mark_storage_orphan_retry_failed", {
        p_orphan_id: item.id,
        p_error: "untrusted bucket or path after claim",
      });
      failed += 1;
      continue;
    }

    // Re-validate immediately before Storage delete (orphan row is never enough).
    const { error: validateError } = await rpc(
      "validate_storage_orphan_for_deletion",
      { p_orphan_id: item.id },
    );
    if (validateError) {
      await rpc("mark_storage_orphan_retry_failed", {
        p_orphan_id: item.id,
        p_error: validateError.message,
      });
      failed += 1;
      continue;
    }

    const { error: removeError } = await supabase.storage
      .from(TICKET_ATTACHMENT_BUCKET)
      .remove([item.object_path]);

    if (removeError) {
      await rpc("mark_storage_orphan_retry_failed", {
        p_orphan_id: item.id,
        p_error: removeError.message,
      });
      failed += 1;
      continue;
    }

    const { error: resolveError } = await rpc("mark_storage_orphan_resolved", {
      p_orphan_id: item.id,
      p_note: "manual admin retry",
    });
    if (resolveError) {
      failed += 1;
      continue;
    }
    resolved += 1;
  }

  revalidateAdmin("/admin/tickets", "/admin/audit");
  if (batch.length === 0) {
    return {
      ok: true,
      code: "ADMIN_ORPHAN_NONE",
      message: "No eligible storage orphans ready for manual retry.",
      data: { claimed: 0, resolved: 0, failed: 0 },
    };
  }
  return {
    ok: failed === 0,
    code: "ADMIN_ORPHAN_RESULT",
    message: `Manual orphan cleanup: ${resolved} resolved, ${failed} failed, ${batch.length} claimed.`,
    data: { claimed: batch.length, resolved, failed },
  };
}
