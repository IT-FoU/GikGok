import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/modules/player/actions";
import {
  AnnouncementDismissForm,
  PlaySessionTouch,
} from "@/modules/engagement/ui";
import {
  localizeJson,
  parseResponsiblePlayConfig,
} from "@/modules/engagement/helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GAME_CARDS = [
  {
    id: "fish-prawn-crab",
    href: "/play/fish-prawn-crab",
    title: "Fish–Prawn–Crab",
  },
  { id: "high-low", href: "/play/high-low", title: "High–Low" },
  { id: "spinning-plate", href: "/play/spinning-plate", title: "Spinning Plate" },
] as const;

export default async function PlayerHomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: balanceRow },
    { data: rewardState },
    { data: announcements },
    { count: unreadNotifications },
    { data: missionRows },
    { data: leaderboardRows },
    { data: recentAchievement },
    { count: recentBetsCount },
    { data: responsibleRaw },
    { data: settings },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "nickname, email_verified_at, phone_verified_at, status, session_started_at, play_paused_until",
      )
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("player_balances")
      .select("balance")
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("daily_reward_state")
      .select("streak_day, last_claim_date")
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("announcements")
      .select("id, title_i18n, body_i18n, published_at")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("published_at", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("player_id", user.id)
      .is("read_at", null),
    supabase
      .from("missions")
      .select("id, code, title_i18n, target_count, reward_amount")
      .eq("is_enabled", true)
      .is("deleted_at", null)
      .limit(3),
    supabase
      .from("leaderboard_projections")
      .select("player_id, score, rank, profiles(nickname)")
      .eq("metric", "highest_credit")
      .order("score", { ascending: false })
      .limit(3),
    supabase
      .from("player_achievements")
      .select("unlocked_at, achievements(code, title_i18n)")
      .eq("player_id", user.id)
      .order("unlocked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("bet_receipts")
      .select("id", { count: "exact", head: true })
      .eq("player_id", user.id),
    supabase.rpc("get_responsible_play_config"),
    supabase
      .from("user_settings")
      .select("locale")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (!profile) redirect("/register");

  const locale = settings?.locale ?? "lo";
  const balance = balanceRow?.balance ?? 0;
  const verified = Boolean(profile.email_verified_at || profile.phone_verified_at);
  const claimedToday = rewardState?.last_claim_date === today;
  const responsible = parseResponsiblePlayConfig(responsibleRaw);

  const { data: dismissedReads } = await supabase
    .from("announcement_reads")
    .select("announcement_id")
    .eq("player_id", user.id)
    .not("dismissed_at", "is", null);

  const dismissedIds = new Set(
    (dismissedReads ?? []).map((row) => row.announcement_id),
  );
  const visibleAnnouncements = (announcements ?? []).filter(
    (row) => !dismissedIds.has(row.id),
  );

  const { data: missionProgress } = await supabase
    .from("player_mission_progress")
    .select("mission_id, progress_count")
    .eq("player_id", user.id);

  const progressMap = new Map(
    (missionProgress ?? []).map((row) => [row.mission_id, row.progress_count]),
  );

  const achievementTitle =
    recentAchievement?.achievements &&
    typeof recentAchievement.achievements === "object" &&
    !Array.isArray(recentAchievement.achievements)
      ? localizeJson(
          (recentAchievement.achievements as { title_i18n: unknown }).title_i18n as never,
          locale,
        )
      : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-1 py-2 md:px-0">
      <PlaySessionTouch />

      <section className="flex items-start justify-between gap-4 border border-[var(--brand-border)] p-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-[var(--brand-accent)]">
            Welcome, {profile.nickname}
          </h1>
          <p className="mt-1 text-[var(--brand-muted)]">
            Balance: {balance.toLocaleString()} GIK
          </p>
          <p className="mt-2 text-xs text-[var(--brand-muted)]">
            {responsible.demo_notice}
          </p>
          {!verified ? (
            <p className="mt-2 text-sm text-amber-200">
              Verify your contact to unlock play and welcome credit.
            </p>
          ) : null}
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline">Sign out</Button>
        </form>
      </section>

      <section className="border border-[var(--brand-border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-medium">Daily check-in</h2>
            <p className="text-sm text-[var(--brand-muted)]">
              Streak day {rewardState?.streak_day ?? 0}
              {claimedToday ? " · claimed today" : " · not claimed yet"}
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/credits">Open credits</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {GAME_CARDS.map((game) => (
          <Link
            key={game.id}
            href={game.href}
            className="border border-[var(--brand-border)] p-4 transition-colors hover:border-[var(--brand-accent)]"
          >
            <h2 className="font-medium text-[var(--brand-accent)]">{game.title}</h2>
            <p className="mt-1 text-xs text-[var(--brand-muted)]">Play now</p>
          </Link>
        ))}
      </section>

      {visibleAnnouncements.map((announcement) => (
        <section
          key={announcement.id}
          className="flex items-start justify-between gap-4 border border-[var(--brand-border)] p-4"
        >
          <div>
            <h2 className="font-medium">
              {localizeJson(announcement.title_i18n, locale)}
            </h2>
            <p className="mt-1 text-sm text-[var(--brand-muted)]">
              {localizeJson(announcement.body_i18n, locale)}
            </p>
          </div>
          <AnnouncementDismissForm announcementId={announcement.id} />
        </section>
      ))}

      <section className="border border-[var(--brand-border)] p-4">
        <h2 className="font-medium">Activity</h2>
        <p className="mt-1 text-sm text-[var(--brand-muted)]">
          {recentBetsCount ?? 0} bet receipt(s) · {unreadNotifications ?? 0} unread
          notification(s)
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/history">Bet history</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/notifications">Notifications</Link>
          </Button>
        </div>
      </section>

      <section className="border border-[var(--brand-border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Missions</h2>
          <Link href="/missions" className="text-sm underline-offset-4 hover:underline">
            View all
          </Link>
        </div>
        {!missionRows?.length ? (
          <p className="mt-2 text-sm text-[var(--brand-muted)]">No missions yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {missionRows.map((mission) => {
              const count = progressMap.get(mission.id) ?? 0;
              return (
                <li key={mission.id} className="flex justify-between gap-3">
                  <span>{localizeJson(mission.title_i18n, locale)}</span>
                  <span className="text-[var(--brand-muted)]">
                    {count}/{mission.target_count}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="border border-[var(--brand-border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium">Leaderboard</h2>
          <Link href="/leaderboard" className="text-sm underline-offset-4 hover:underline">
            Full board
          </Link>
        </div>
        {!leaderboardRows?.length ? (
          <p className="mt-2 text-sm text-[var(--brand-muted)]">No rankings yet.</p>
        ) : (
          <ol className="mt-3 space-y-2 text-sm">
            {leaderboardRows.map((row, index) => {
              const profileRow = Array.isArray(row.profiles)
                ? row.profiles[0]
                : row.profiles;
              return (
                <li key={row.player_id} className="flex justify-between gap-3">
                  <span>
                    #{index + 1} {profileRow?.nickname ?? "Player"}
                  </span>
                  <span className="text-[var(--brand-muted)]">
                    {row.score.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {achievementTitle ? (
        <section className="border border-[var(--brand-border)] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-medium">Latest achievement</h2>
            <Link href="/achievements" className="text-sm underline-offset-4 hover:underline">
              All badges
            </Link>
          </div>
          <p className="mt-2 text-sm text-[var(--brand-accent)]">{achievementTitle}</p>
        </section>
      ) : null}

      <section className="border border-[var(--brand-border)] p-4">
        <h2 className="font-medium">Shortcuts</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/support">Support</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/notifications">Notifications</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/profile">Settings</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/history">History</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/guide">Game guide</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
