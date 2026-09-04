import Link from "next/link";
import { redirect } from "next/navigation";

import { EmptyState } from "@/components/ui/states";
import { localizeJson } from "@/modules/engagement/helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AchievementsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: achievements }, { data: unlocked }, { data: settings }] =
    await Promise.all([
      supabase
        .from("achievements")
        .select("id, code, title_i18n, description_i18n, badge_asset_key")
        .eq("is_enabled", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("player_achievements")
        .select("achievement_id, unlocked_at")
        .eq("player_id", user.id),
      supabase
        .from("user_settings")
        .select("locale")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  const locale = settings?.locale ?? "lo";
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
                <h2 className="font-medium">
                  {localizeJson(achievement.title_i18n, locale)}
                </h2>
                <p className="mt-1 text-sm text-[var(--brand-muted)]">
                  {localizeJson(achievement.description_i18n, locale)}
                </p>
                {unlockedAt ? (
                  <p className="mt-2 text-xs text-[var(--brand-accent)]">
                    Unlocked {new Date(unlockedAt).toLocaleDateString()}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--brand-muted)]">Locked</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
