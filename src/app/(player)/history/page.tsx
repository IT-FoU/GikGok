import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import {
  filterBetReceipts,
  summarizeSelection,
  type BetHistoryFilter,
} from "@/modules/engagement/helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const FILTERS: BetHistoryFilter[] = ["all", "wins", "losses"];

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter: BetHistoryFilter = FILTERS.includes(
    params.filter as BetHistoryFilter,
  )
    ? (params.filter as BetHistoryFilter)
    : "all";

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: receipts } = await supabase
    .from("receipts")
    .select(
      "id, bet_id, game_id, game_version_id, mode, stake, selection, total_return, balance_after, is_win, created_at, games(key, name)",
    )
    .eq("player_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = filterBetReceipts(receipts ?? [], filter);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← Home
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          Bet history
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Server-settled bet receipts including random / controlled-demo mode.
          Demo credits only.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item}
            href={`/history?filter=${item}`}
            className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm capitalize ${
              filter === item
                ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
                : "border-[var(--brand-border)] text-[var(--brand-muted)]"
            }`}
          >
            {item}
          </Link>
        ))}
      </div>

      {!rows.length ? (
        <EmptyState title="No bet receipts yet" />
      ) : (
        <div className="overflow-x-auto border border-[var(--brand-border)]">
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Game</TH>
                <TH>Bet</TH>
                <TH>Selection</TH>
                <TH>Stake</TH>
                <TH>Return</TH>
                <TH>Balance after</TH>
                <TH>Mode</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => {
                const game = Array.isArray(row.games) ? row.games[0] : row.games;
                return (
                  <TR key={row.id}>
                    <TD>{new Date(row.created_at).toLocaleString()}</TD>
                    <TD>{game?.name ?? game?.key ?? row.game_id.slice(0, 8)}</TD>
                    <TD className="font-mono text-xs">
                      {row.bet_id.slice(0, 8)}…
                    </TD>
                    <TD className="max-w-[12rem] truncate text-xs">
                      {summarizeSelection(row.selection)}
                    </TD>
                    <TD>{row.stake.toLocaleString()}</TD>
                    <TD
                      className={
                        row.is_win ? "text-[var(--brand-accent)]" : ""
                      }
                    >
                      {row.total_return.toLocaleString()}
                    </TD>
                    <TD>{row.balance_after.toLocaleString()}</TD>
                    <TD>{row.mode}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      )}
    </main>
  );
}
