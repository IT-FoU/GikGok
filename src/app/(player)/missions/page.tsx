import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import { MissionClaimButton } from "@/modules/engagement/ui";
import { missionClaimable } from "@/modules/engagement/helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: missions }, { data: progress }] = await Promise.all([
    supabase
      .from("missions")
      .select(
        "id, key, name, description, scope, goal_target, reward_amount, games(key)",
      )
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("mission_progress")
      .select("mission_id, progress, is_completed, reward_ledger_id")
      .eq("player_id", user.id),
  ]);

  const progressMap = new Map(
    (progress ?? []).map((row) => [row.mission_id, row]),
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← Home
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          Missions
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Optional missions — never required to play every game. Rewards are
          demo GIK.
        </p>
      </div>

      {!missions?.length ? (
        <EmptyState title="No missions available" />
      ) : (
        <ul className="space-y-4">
          {missions.map((mission) => {
            const missionProgress = progressMap.get(mission.id);
            const count = missionProgress?.progress ?? 0;
            const claimed = Boolean(missionProgress?.reward_ledger_id);
            const canClaim = missionProgress
              ? missionClaimable(missionProgress)
              : false;
            const game = Array.isArray(mission.games)
              ? mission.games[0]
              : mission.games;

            return (
              <li
                key={mission.id}
                className="border border-[var(--brand-border)] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-medium">{mission.name}</h2>
                    {mission.description ? (
                      <p className="mt-1 text-sm text-[var(--brand-muted)]">
                        {mission.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm">
                      Progress {count}/{mission.goal_target} · Reward{" "}
                      {mission.reward_amount.toLocaleString()} GIK
                      {game?.key ? ` · ${game.key}` : ` · ${mission.scope}`}
                    </p>
                    {claimed ? (
                      <p className="mt-1 text-sm text-[var(--brand-accent)]">
                        Reward claimed
                      </p>
                    ) : null}
                  </div>
                  {canClaim ? (
                    <MissionClaimButton missionId={mission.id} />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
