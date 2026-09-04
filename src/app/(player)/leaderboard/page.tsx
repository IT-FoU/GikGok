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
  highest_credit: "Highest credit",
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

  try {
    await supabase.rpc("refresh_leaderboard_projections");
  } catch {
    // Best-effort refresh.
  }

  const { data: rows } = await supabase
    .from("leaderboard_projections")
    .select("player_id, metric, score, rank, profiles(nickname, avatar_preset_id)")
    .eq("metric", metric)
    .order("score", { ascending: false })
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
          {rows.map((row, index) => {
            const profile = Array.isArray(row.profiles)
              ? row.profiles[0]
              : row.profiles;
            return (
              <li
                key={row.player_id}
                className="flex items-center justify-between gap-3 border border-[var(--brand-border)] p-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 text-sm text-[var(--brand-muted)]">
                    #{row.rank ?? index + 1}
                  </span>
                  <span className="font-medium">
                    {profile?.nickname ?? "Player"}
                  </span>
                  {profile?.avatar_preset_id ? (
                    <span className="text-xs text-[var(--brand-muted)]">
                      {profile.avatar_preset_id}
                    </span>
                  ) : null}
                </div>
                <span className="text-[var(--brand-accent)]">
                  {row.score.toLocaleString()}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
