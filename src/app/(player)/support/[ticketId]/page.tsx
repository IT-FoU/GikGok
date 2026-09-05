import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  TicketReplyForm,
  TicketSatisfactionForm,
} from "@/modules/engagement/ui";
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

  const [{ data: ticket }, { data: messages }] = await Promise.all([
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
  ]);

  if (!ticket) notFound();

  const canReply = !["closed", "resolved"].includes(ticket.status);
  const showSatisfaction =
    (ticket.status === "resolved" || ticket.status === "closed") &&
    ticket.satisfaction_rating == null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/support" className="underline-offset-4 hover:underline">
            ← Support
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
        <h2 className="font-medium">Messages</h2>
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
                {message.author_role === "admin" ? "Staff" : "You"} ·{" "}
                {new Date(message.created_at).toLocaleString()}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{message.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {canReply ? <TicketReplyForm ticketId={ticket.id} /> : null}
      {showSatisfaction ? (
        <TicketSatisfactionForm ticketId={ticket.id} />
      ) : null}
      {ticket.satisfaction_rating ? (
        <p className="text-sm text-[var(--brand-muted)]">
          Satisfaction: {ticket.satisfaction_rating}/5
        </p>
      ) : null}
    </main>
  );
}
