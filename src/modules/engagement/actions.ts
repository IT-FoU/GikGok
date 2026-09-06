"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import {
  UPLOAD_MAX_BYTES,
  requireSameOrigin,
  validateImageMagicBytes,
} from "@/lib/security";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { ActionResult } from "@/modules/player/auth-shared";

type TicketCategory = Database["public"]["Enums"]["ticket_category"];

const TICKET_ATTACHMENT_MAX = 3;
const TICKET_ATTACHMENT_BUCKET = "ticket-attachments";

function asMessage(error: { message: string } | null): string {
  return error?.message ?? "Unexpected error";
}

function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function sanitizeFileBase(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "attachment";
}

async function assertMutatingOrigin() {
  requireSameOrigin(
    { headers: await headers() },
    { allowMissingInDev: true },
  );
}

const ENGAGEMENT_PATHS = [
  "/home",
  "/history",
  "/notifications",
  "/missions",
  "/achievements",
  "/leaderboard",
  "/friends",
  "/support",
  "/profile",
] as const;

function revalidateEngagement(extra: string[] = []) {
  for (const path of [...ENGAGEMENT_PATHS, ...extra]) {
    revalidatePath(path);
  }
}

export async function markAnnouncementReadAction(
  id: string,
  dismiss = false,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("mark_announcement_read", {
    p_announcement_id: id,
    p_dismiss: dismiss,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement();
  return {
    ok: true,
    message: dismiss ? "Announcement dismissed." : "Marked as read.",
  };
}

export async function markNotificationReadAction(
  id: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: id,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement();
  return { ok: true, message: "Notification marked read." };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("mark_all_notifications_read");

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement();
  return {
    ok: true,
    message: `Marked ${Number(data ?? 0)} notification(s) as read.`,
    data: { count: Number(data ?? 0) },
  };
}

export async function claimMissionRewardAction(
  missionId: string,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("claim_mission_reward", {
    p_mission_id: missionId,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement(["/credits", "/ledger"]);
  const payload = (data ?? {}) as { amount?: number };
  return {
    ok: true,
    message: `Claimed ${(payload.amount ?? 0).toLocaleString()} GIK.`,
    data: payload as Record<string, unknown>,
  };
}

export async function requestFriendAction(
  nickname: string,
): Promise<ActionResult> {
  const trimmed = nickname.trim();
  if (trimmed.length < 2) {
    return { ok: false, message: "Enter a nickname." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("request_friend", {
    p_nickname: trimmed,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement();
  return {
    ok: true,
    message: "Friend request sent.",
    data: data as Record<string, unknown>,
  };
}

export async function respondFriendshipAction(
  id: string,
  action: "accept" | "block" | "remove",
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("respond_friendship", {
    p_friendship_id: id,
    p_action: action,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement();
  return { ok: true, message: `Friendship ${action}.` };
}

export async function createInviteAction(): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_invite_code");

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement();
  const invite = data as { code?: string } | null;
  return {
    ok: true,
    message: "Invite code created.",
    data: { code: invite?.code ?? "" },
  };
}

export async function createSupportTicketAction(
  formData: FormData,
): Promise<ActionResult> {
  const category = String(formData.get("category") ?? "") as TicketCategory;
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();

  const validCategories: TicketCategory[] = [
    "general",
    "account",
    "credits",
    "games",
    "technical",
    "other",
  ];
  if (!validCategories.includes(category)) {
    return { ok: false, message: "Choose a category." };
  }
  if (subject.length < 3) {
    return { ok: false, message: "Subject is required (min 3 characters)." };
  }
  if (message.length < 3) {
    return { ok: false, message: "Message is required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_support_ticket", {
    p_category: category,
    p_subject: subject,
    p_message: message,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  const ticket = data as { id?: string } | null;
  let messageId: string | null = null;
  if (ticket?.id) {
    const { data: firstMessage } = await supabase
      .from("ticket_messages")
      .select("id")
      .eq("ticket_id", ticket.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    messageId = firstMessage?.id ?? null;
  }

  revalidateEngagement([`/support/${ticket?.id ?? ""}`]);
  return {
    ok: true,
    message: "Support ticket created.",
    data: {
      ...(ticket as Record<string, unknown>),
      messageId,
    },
  };
}

export async function replySupportTicketAction(
  ticketId: string,
  message: string,
): Promise<ActionResult> {
  const trimmed = message.trim();
  if (trimmed.length < 1) {
    return { ok: false, message: "Message is required." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("reply_support_ticket", {
    p_ticket_id: ticketId,
    p_message: trimmed,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  const msg = data as { id?: string } | null;
  revalidateEngagement([`/support/${ticketId}`]);
  return {
    ok: true,
    message: "Reply sent.",
    data: { id: msg?.id ?? null, messageId: msg?.id ?? null },
  };
}

export async function uploadTicketAttachmentsAction(
  ticketId: string,
  messageId: string,
  formData: FormData,
): Promise<ActionResult> {
  await assertMutatingOrigin();

  if (!ticketId || !messageId) {
    return { ok: false, message: "Ticket and message are required." };
  }

  const files = formData
    .getAll("attachments")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);

  if (files.length === 0) {
    return { ok: false, message: "Choose at least one image." };
  }
  if (files.length > TICKET_ATTACHMENT_MAX) {
    return {
      ok: false,
      message: `At most ${TICKET_ATTACHMENT_MAX} images per upload.`,
    };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in required." };
  }

  const { count, error: countError } = await supabase
    .from("ticket_attachments")
    .select("id", { count: "exact", head: true })
    .eq("ticket_id", ticketId);

  if (countError) {
    return { ok: false, message: asMessage(countError) };
  }

  const existing = count ?? 0;
  if (existing + files.length > TICKET_ATTACHMENT_MAX) {
    return {
      ok: false,
      message: `A ticket may have at most ${TICKET_ATTACHMENT_MAX} attachments.`,
    };
  }

  const uploaded: Array<{ id: string; storage_path: string }> = [];

  for (const file of files) {
    const bytes = await file.arrayBuffer();
    const magic = validateImageMagicBytes({
      bytes,
      claimedType: file.type || null,
      size: file.size,
      maxBytes: UPLOAD_MAX_BYTES.ticketAttachment,
    });
    if (!magic.ok) {
      return { ok: false, message: magic.message };
    }

    const safeBase = sanitizeFileBase(file.name);
    const storagePath = `${ticketId}/${user.id}/${Date.now()}-${safeBase}.${extensionForMime(magic.mime)}`;

    const { error: uploadError } = await supabase.storage
      .from(TICKET_ATTACHMENT_BUCKET)
      .upload(storagePath, bytes, {
        contentType: magic.mime,
        upsert: false,
      });

    if (uploadError) {
      return { ok: false, message: asMessage(uploadError) };
    }

    const { data: row, error: insertError } = await supabase
      .from("ticket_attachments")
      .insert({
        ticket_id: ticketId,
        message_id: messageId,
        storage_path: storagePath,
        file_name: file.name || `attachment.${extensionForMime(magic.mime)}`,
        mime_type: magic.mime,
        size_bytes: file.size,
        uploaded_by: user.id,
      })
      .select("id, storage_path")
      .single();

    if (insertError) {
      await supabase.storage
        .from(TICKET_ATTACHMENT_BUCKET)
        .remove([storagePath])
        .catch(() => undefined);
      return { ok: false, message: asMessage(insertError) };
    }

    uploaded.push(row);
  }

  revalidateEngagement([`/support/${ticketId}`, "/admin/tickets"]);
  return {
    ok: true,
    message: `Uploaded ${uploaded.length} attachment(s).`,
    data: { attachments: uploaded },
  };
}

export async function deleteTicketAttachmentAction(
  attachmentId: string,
): Promise<ActionResult> {
  await assertMutatingOrigin();

  if (!attachmentId) {
    return { ok: false, message: "Attachment id is required." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, message: "Sign in required." };
  }

  const { data: row, error: fetchError } = await supabase
    .from("ticket_attachments")
    .select("id, ticket_id, storage_path, uploaded_by")
    .eq("id", attachmentId)
    .maybeSingle();

  if (fetchError) {
    return { ok: false, message: asMessage(fetchError) };
  }
  if (!row) {
    return { ok: false, message: "Attachment not found." };
  }

  const { error: deleteError } = await supabase
    .from("ticket_attachments")
    .delete()
    .eq("id", attachmentId);

  if (deleteError) {
    return { ok: false, message: asMessage(deleteError) };
  }

  await supabase.storage
    .from(TICKET_ATTACHMENT_BUCKET)
    .remove([row.storage_path])
    .catch(() => undefined);

  revalidateEngagement([`/support/${row.ticket_id}`, "/admin/tickets"]);
  return { ok: true, message: "Attachment deleted." };
}

/** Create short-lived signed URLs for ticket attachment thumbnails. */
export async function signTicketAttachmentUrls(
  ticketId: string,
): Promise<
  Array<{
    id: string;
    message_id: string | null;
    file_name: string;
    mime_type: string;
    size_bytes: number;
    storage_path: string;
    signedUrl: string | null;
  }>
> {
  const supabase = await createServerSupabaseClient();
  const { data: rows, error } = await supabase
    .from("ticket_attachments")
    .select(
      "id, message_id, file_name, mime_type, size_bytes, storage_path",
    )
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  if (error || !rows?.length) {
    return [];
  }

  const signed = await Promise.all(
    rows.map(async (row) => {
      const { data } = await supabase.storage
        .from(TICKET_ATTACHMENT_BUCKET)
        .createSignedUrl(row.storage_path, 60 * 30);
      return {
        ...row,
        signedUrl: data?.signedUrl ?? null,
      };
    }),
  );

  return signed;
}

export async function submitTicketSatisfactionAction(
  ticketId: string,
  score: number,
  comment?: string,
): Promise<ActionResult> {
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { ok: false, message: "Score must be between 1 and 5." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("submit_ticket_satisfaction", {
    p_ticket_id: ticketId,
    p_score: score,
    p_comment: comment?.trim() || null,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement([`/support/${ticketId}`]);
  return { ok: true, message: "Thanks for your feedback." };
}

export async function setPlayPauseAction(
  days: number | 0,
): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_play_pause", {
    p_days: days,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement();
  return {
    ok: true,
    message:
      days > 0 ? `Play paused for ${days} day(s).` : "Play pause cleared.",
  };
}

export async function touchPlaySessionAction(): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("touch_play_session");

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/profile");
  return { ok: true };
}

export async function refreshLeaderboardAction(): Promise<ActionResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("refresh_leaderboard_entries");
  if (error) {
    return { ok: false, message: asMessage(error) };
  }
  revalidatePath("/leaderboard");
  revalidatePath("/home");
  return { ok: true, message: "Leaderboard refreshed." };
}
