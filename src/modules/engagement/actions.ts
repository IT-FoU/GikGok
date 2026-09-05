"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { ActionResult } from "@/modules/player/auth-shared";

type TicketCategory = Database["public"]["Enums"]["ticket_category"];

function asMessage(error: { message: string } | null): string {
  return error?.message ?? "Unexpected error";
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
  revalidateEngagement([`/support/${ticket?.id ?? ""}`]);
  return {
    ok: true,
    message: "Support ticket created.",
    data: ticket as Record<string, unknown>,
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
  const { error } = await supabase.rpc("reply_support_ticket", {
    p_ticket_id: ticketId,
    p_message: trimmed,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidateEngagement([`/support/${ticketId}`]);
  return { ok: true, message: "Reply sent." };
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
