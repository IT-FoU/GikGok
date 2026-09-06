import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  TicketAttachmentGallery,
  TicketReplyForm,
  TicketSatisfactionForm,
} from "@/modules/engagement/ui";
import { signTicketAttachmentUrls } from "@/modules/engagement/actions";
import { T } from "@/modules/localization/t";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: ticket }, { data: messages }, attachments] = await Promise.all([
    supabase
      .from("support_tickets")
      .select("*")
      .eq("id", ticketId)
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("ticket_messages")
      .select("id, author_id, author_role, body, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    signTicketAttachmentUrls(ticketId),
  ]);

  if (!ticket) notFound();

  const canReply = !["closed", "resolved"].includes(ticket.status);
  const showSatisfaction =
    (ticket.status === "resolved" || ticket.status === "closed") &&
    ticket.satisfaction_rating == null;

  const attachmentsByMessage = new Map<string, typeof attachments>();
  for (const attachment of attachments) {
    const key = attachment.message_id ?? "__ticket__";
    const list = attachmentsByMessage.get(key) ?? [];
    list.push(attachment);
    attachmentsByMessage.set(key, list);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/support" className="underline-offset-4 hover:underline">
            <T id="support.backToSupport" />
          </Link>
        </p>
        <h1 className="font-display text-2xl font-semibold text-[var(--brand-accent)]">
          {ticket.subject}
        </h1>
        <p className="mt-2 text-sm capitalize text-[var(--brand-muted)]">
          {ticket.category} · {ticket.status}
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">
          <T id="support.messages" />
        </h2>
        <ul className="space-y-3">
          {(messages ?? []).map((message) => (
            <li
              key={message.id}
              className={`border p-3 ${
                message.author_role === "admin"
                  ? "border-[var(--brand-accent)]"
                  : "border-[var(--brand-border)]"
              }`}
            >
              <p className="text-xs text-[var(--brand-muted)]">
                {message.author_role === "admin" ? (
                  <T id="support.staff" />
                ) : (
                  <T id="support.you" />
                )}{" "}
                · {new Date(message.created_at).toLocaleString()}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
              <div className="mt-3">
                <TicketAttachmentGallery
                  items={attachmentsByMessage.get(message.id) ?? []}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <TicketAttachmentGallery
        items={attachmentsByMessage.get("__ticket__") ?? []}
      />

      {canReply ? <TicketReplyForm ticketId={ticket.id} /> : null}
      {showSatisfaction ? (
        <TicketSatisfactionForm ticketId={ticket.id} />
      ) : null}
      {ticket.satisfaction_rating ? (
        <p className="text-sm text-[var(--brand-muted)]">
          <T
            id="support.satisfaction"
            params={{ score: ticket.satisfaction_rating }}
          />
        </p>
      ) : null}
    </main>
  );
}
