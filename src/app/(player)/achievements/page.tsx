import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: achievements }, { data: unlocked }] = await Promise.all([
    supabase
      .from("achievements")
      .select("id, key, name, description, icon, reward_amount")
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    supabase
      .from("achievement_unlocks")
      .select("achievement_id, unlocked_at")
      .eq("player_id", user.id),
  ]);

  const unlockedMap = new Map(
    (unlocked ?? []).map((row) => [row.achievement_id, row.unlocked_at]),
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
          Achievements
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Data-driven badge collection. Demo rewards only.
        </p>
      </div>

      {!achievements?.length ? (
        <EmptyState title="No achievements yet" />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {achievements.map((achievement) => {
            const unlockedAt = unlockedMap.get(achievement.id);
            return (
              <li
                key={achievement.id}
                className={`border p-4 ${
                  unlockedAt
                    ? "border-[var(--brand-accent)] bg-[color-mix(in_oklab,var(--brand-accent)_8%,transparent)]"
                    : "border-[var(--brand-border)] opacity-70"
                }`}
              >
                <h2 className="font-medium">{achievement.name}</h2>
                {achievement.description ? (
                  <p className="mt-1 text-sm text-[var(--brand-muted)]">
                    {achievement.description}
                  </p>
                ) : null}
                {unlockedAt ? (
                  <p className="mt-2 text-xs text-[var(--brand-accent)]">
                    Unlocked {new Date(unlockedAt).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--brand-muted)]">
                    Locked
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
