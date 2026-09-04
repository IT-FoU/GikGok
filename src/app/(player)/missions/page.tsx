import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import { MissionClaimButton } from "@/modules/engagement/ui";
import { localizeJson } from "@/modules/engagement/helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function MissionsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: missions }, { data: progress }, { data: settings }] =
    await Promise.all([
      supabase
        .from("missions")
        .select(
          "id, code, title_i18n, description_i18n, game_id, target_count, reward_amount",
        )
        .eq("is_enabled", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("player_mission_progress")
        .select("mission_id, progress_count, completed_at, claimed_at")
        .eq("player_id", user.id),
      supabase
        .from("user_settings")
        .select("locale")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const locale = settings?.locale ?? "lo";
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
          Optional daily missions. Rewards are demo GIK credits.
        </p>
      </div>

      {!missions?.length ? (
        <EmptyState title="No missions available" />
      ) : (
        <ul className="space-y-4">
          {missions.map((mission) => {
            const missionProgress = progressMap.get(mission.id);
            const count = missionProgress?.progress_count ?? 0;
            const completed = Boolean(missionProgress?.completed_at);
            const claimed = Boolean(missionProgress?.claimed_at);
            const canClaim = completed && !claimed;

            return (
              <li
                key={mission.id}
                className="border border-[var(--brand-border)] p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-medium">
                      {localizeJson(mission.title_i18n, locale)}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--brand-muted)]">
                      {localizeJson(mission.description_i18n, locale)}
                    </p>
                    <p className="mt-2 text-sm">
                      Progress {count}/{mission.target_count} · Reward{" "}
                      {mission.reward_amount.toLocaleString()} GIK
                      {mission.game_id ? ` · ${mission.game_id}` : ""}
                    </p>
                    {claimed ? (
                      <p className="mt-1 text-sm text-[var(--brand-accent)]">
                        Reward claimed
                      </p>
                    ) : null}
                  </div>
                  {canClaim ? <MissionClaimButton missionId={mission.id} /> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
