"use client";

import { useTranslations } from "@/modules/localization/provider";

const TYPE_KEYS: Record<string, string> = {
  verification: "notifications.typeVerification",
  reward: "notifications.typeReward",
  credit_request: "notifications.typeCreditRequest",
  credit_approved: "notifications.typeCreditApproved",
  credit_rejected: "notifications.typeCreditRejected",
  ticket: "notifications.typeTicket",
  ticket_reply: "notifications.typeTicketReply",
  achievement: "notifications.typeAchievement",
  announcement: "notifications.typeAnnouncement",
  system: "notifications.typeSystem",
};

export function NotificationTypeLabel({
  type,
  data,
}: {
  type: string;
  data?: Record<string, unknown> | null;
}) {
  const t = useTranslations();
  let key = TYPE_KEYS[type] ?? "notifications.typeGeneric";
  if (type === "credit_request" && data && typeof data === "object") {
    const decision = String(data.decision ?? data.status ?? "").toLowerCase();
    if (decision === "approved" || decision === "approve") {
      key = "notifications.typeCreditApproved";
    } else if (decision === "rejected" || decision === "reject") {
      key = "notifications.typeCreditRejected";
    }
  }
  if (type === "ticket" && data && typeof data === "object") {
    if (data.reply || data.has_reply) {
      key = "notifications.typeTicketReply";
    }
  }
  return <span>{t(key)}</span>;
}
