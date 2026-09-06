import Link from "next/link";
import { redirect } from "next/navigation";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { LedgerFilters } from "@/modules/ledger/ui";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FILTERS = ["all", "credit", "debit"] as const;

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = (FILTERS as readonly string[]).includes(params.filter ?? "")
    ? (params.filter as (typeof FILTERS)[number])
    : "all";

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let query = supabase
    .from("gik_ledger")
    .select(
      "id, entry_type, amount, balance_after, reason, source, reference_id, created_at, metadata",
    )
    .eq("player_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter === "credit") query = query.gt("amount", 0);
  if (filter === "debit") query = query.lt("amount", 0);

  const { data: entries } = await query;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/credits" className="underline-offset-4 hover:underline">
            ← Credits
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          Ledger history
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Append-only demo-credit ledger (`gik_ledger`). Balances are never
          edited directly.
        </p>
      </div>

      <LedgerFilters active={filter} />

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        {!entries?.length ? (
          <EmptyState title="No ledger entries yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Type</TH>
                <TH>Amount</TH>
                <TH>Balance after</TH>
                <TH>Reason</TH>
              </TR>
            </THead>
            <TBody>
              {entries.map((entry) => (
                <TR key={entry.id}>
                  <TD>{new Date(entry.created_at).toLocaleString()}</TD>
                  <TD>{entry.entry_type}</TD>
                  <TD className={entry.amount < 0 ? "text-red-300" : ""}>
                    {entry.amount.toLocaleString()}
                  </TD>
                  <TD>{entry.balance_after.toLocaleString()}</TD>
                  <TD>{entry.reason ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </main>
  );
}
