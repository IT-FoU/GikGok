import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import { SupportTicketForm } from "@/modules/engagement/ui";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, category, subject, status, created_at, updated_at")
    .eq("player_id", user.id)
    .order("updated_at", { ascending: false });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← Home
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          Support
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Demo platform support — no real-money issues.
        </p>
      </div>

      <SupportTicketForm />

      <section className="space-y-3">
        <h2 className="font-medium">Your tickets</h2>
        {!tickets?.length ? (
          <EmptyState title="No tickets yet" />
        ) : (
          <ul className="space-y-2">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/support/${ticket.id}`}
                  className="flex items-center justify-between gap-3 border border-[var(--brand-border)] p-4 transition-colors hover:border-[var(--brand-accent)]"
                >
                  <div>
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-sm capitalize text-[var(--brand-muted)]">
                      {ticket.category} · {ticket.status}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--brand-muted)]">
                    {new Date(ticket.updated_at).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
