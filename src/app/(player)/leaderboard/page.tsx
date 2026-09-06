import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import {
  LEADERBOARD_METRICS,
  parseLeaderboardMetric,
  type LeaderboardMetric,
} from "@/modules/engagement/helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const METRIC_LABELS: Record<LeaderboardMetric, string> = {
  current_credit: "Highest credit",
  cumulative_winnings: "Cumulative winnings",
  most_wins: "Most wins",
};

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ metric?: string }>;
}) {
  const params = await searchParams;
  const metric = parseLeaderboardMetric(params.metric);

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Leaderboard snapshots are rebuilt by privileged admin/system.settings jobs.
  // Ordinary player sessions only read the cached board.
  const { data: rows } = await supabase
    .from("leaderboard_entries")
    .select("player_id, nickname, avatar_url, metric_value, rank")
    .eq("board", metric)
    .order("rank", { ascending: true })
    .limit(20);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← Home
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          Leaderboard
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Nickname and avatar only — no contact or ledger details.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {LEADERBOARD_METRICS.map((item) => (
          <Link
            key={item}
            href={`/leaderboard?metric=${item}`}
            className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
              metric === item
                ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
                : "border-[var(--brand-border)] text-[var(--brand-muted)]"
            }`}
          >
            {METRIC_LABELS[item]}
          </Link>
        ))}
      </div>

      {!rows?.length ? (
        <EmptyState title="No leaderboard entries yet" />
      ) : (
        <ol className="space-y-2">
          {rows.map((row, index) => (
            <li
              key={row.player_id}
              className="flex items-center justify-between gap-3 border border-[var(--brand-border)] p-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-8 text-sm text-[var(--brand-muted)]">
                  #{row.rank || index + 1}
                </span>
                <span className="font-medium">{row.nickname}</span>
              </div>
              <span className="text-[var(--brand-accent)]">
                {row.metric_value.toLocaleString()}
              </span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
