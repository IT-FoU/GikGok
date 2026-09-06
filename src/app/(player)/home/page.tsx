import { Button } from "@/components/ui/button";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  HomeGreeting,
  HomeSignOutButton,
  HomeDailyReward,
  HomeSectionTitle,
  HomeText,
} from "@/modules/player/home-chrome";
import { logoutAction } from "@/modules/player/actions";
import {
  AnnouncementDismissForm,
  PlaySessionTouch,
} from "@/modules/engagement/ui";
import {
  parseResponsiblePlayConfig,
  sessionBreakDue,
} from "@/modules/engagement/helpers";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GAME_CARDS = [
  {
    id: "fish_prawn_crab",
    href: "/play/fish_prawn_crab",
    title: "Fish–Prawn–Crab",
  },
  { id: "high_low", href: "/play/high_low", title: "High–Low" },
  {
    id: "spinning_plate",
    href: "/play/spinning_plate",
    title: "Spinning Plate",
  },
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
    { data: streak },
    { data: announcements },
    { count: unreadNotifications },
    { data: missionRows },
    { data: leaderboardRows },
    { data: recentAchievement },
    { count: recentBetsCount },
    { data: responsibleRaw },
    { data: contacts },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("nickname, status, session_started_at, play_paused_until")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("player_balances")
      .select("balance")
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("player_streaks")
      .select("current_streak, last_claimed_on")
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("announcements")
      .select("id, title, body, publish_at")
      .eq("is_published", true)
      .order("publish_at", { ascending: false })
      .limit(5),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("player_id", user.id)
      .eq("is_read", false),
    supabase
      .from("missions")
      .select("id, name, goal_target, reward_amount")
      .eq("is_active", true)
      .limit(3),
    supabase
      .from("leaderboard_entries")
      .select("nickname, metric_value, rank")
      .eq("board", "current_credit")
      .order("rank", { ascending: true })
      .limit(3),
    supabase
      .from("achievement_unlocks")
      .select("unlocked_at, achievements(name)")
      .eq("player_id", user.id)
      .order("unlocked_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("player_id", user.id),
    supabase.rpc("get_responsible_play_config"),
    supabase
      .from("player_contacts")
      .select("is_verified")
      .eq("player_id", user.id),
  ]);

  if (!profile) redirect("/register");

  const balance = balanceRow?.balance ?? 0;
  const verified = Boolean(contacts?.some((row) => row.is_verified));
  const claimedToday = streak?.last_claimed_on === today;
  const responsible = parseResponsiblePlayConfig(responsibleRaw);
  const breakDue = sessionBreakDue(
    profile.session_started_at,
    responsible.session_break_minutes,
  );
  const requestTime = new Date();
  const playPaused =
    profile.play_paused_until != null &&
    new Date(profile.play_paused_until).getTime() > requestTime.getTime();

  const { data: reads } = await supabase
    .from("announcement_reads")
    .select("announcement_id, dismissed_at")
    .eq("player_id", user.id);
  const dismissed = new Set(
    (reads ?? [])
      .filter((row) => row.dismissed_at)
      .map((row) => row.announcement_id),
  );
  const visibleAnnouncements = (announcements ?? []).filter(
    (row) => !dismissed.has(row.id),
  );

  const achievementName = (() => {
    const linked = recentAchievement?.achievements;
    if (!linked) return null;
    if (Array.isArray(linked)) return linked[0]?.name ?? null;
    return linked.name ?? null;
  })();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <PlaySessionTouch />
      <div className="flex items-start justify-between gap-4">
        <HomeGreeting
          nickname={profile.nickname}
          balance={balance}
          verifyHint={!verified}
          playPausedUntil={playPaused ? profile.play_paused_until : null}
          breakDue={breakDue}
          demoNotice={responsible.demo_notice}
        />
        <form action={logoutAction}>
          <HomeSignOutButton />
        </form>
      </div>

      <HomeDailyReward
        streak={streak?.current_streak ?? 0}
        claimedToday={claimedToday}
      />

      <section className="space-y-3" aria-label="Games">
        <HomeSectionTitle labelKey="home.games" />
        <div className="grid gap-3 sm:grid-cols-3">
          {GAME_CARDS.map((game) => (
            <Button
              key={game.id}
              asChild
              variant="secondary"
              className="h-auto justify-start py-3"
            >
              <Link href={game.href}>{game.title}</Link>
            </Button>
          ))}
        </div>
      </section>

      <section className="space-y-3" aria-label="Announcements">
        <div className="flex items-center justify-between gap-3">
          <HomeSectionTitle labelKey="home.announcements" />
          <Link
            href="/notifications"
            className="text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
          >
            <HomeText id="home.unreadCount" params={{ count: unreadNotifications ?? 0 }} />
          </Link>
        </div>
        {!visibleAnnouncements.length ? (
          <p className="text-sm text-[var(--brand-muted)]"><HomeText id="home.noAnnouncements" /></p>
        ) : (
          <ul className="space-y-3">
            {visibleAnnouncements.map((announcement) => (
              <li
                key={announcement.id}
                className="border border-[var(--brand-border)] p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{announcement.title}</p>
                    <p className="mt-1 text-sm text-[var(--brand-muted)]">
                      {announcement.body}
                    </p>
                  </div>
                  <AnnouncementDismissForm announcementId={announcement.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Activity">
        <div className="border border-[var(--brand-border)] p-4">
          <p className="text-sm text-[var(--brand-muted)]"><HomeText id="home.betActivity" /></p>
          <p className="mt-1 text-2xl font-semibold">
            {recentBetsCount ?? 0}
          </p>
          <Link
            href="/history"
            className="mt-2 inline-block text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
          >
            <HomeText id="home.fullHistory" />
          </Link>
        </div>
        <div className="border border-[var(--brand-border)] p-4">
          <p className="text-sm text-[var(--brand-muted)]"><HomeText id="home.missions" /></p>
          <p className="mt-1 text-sm">
            {(missionRows ?? []).map((m) => m.name).slice(0, 2).join(" · ") || (
              <HomeText id="home.none" />
            )}
          </p>
          <Link
            href="/missions"
            className="mt-2 inline-block text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
          >
            <HomeText id="home.viewMissions" />
          </Link>
        </div>
        <div className="border border-[var(--brand-border)] p-4">
          <p className="text-sm text-[var(--brand-muted)]"><HomeText id="home.achievement" /></p>
          <p className="mt-1 text-sm">
            {achievementName ?? <HomeText id="home.noneYet" />}
          </p>
          <Link
            href="/achievements"
            className="mt-2 inline-block text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
          >
            <HomeText id="home.collection" />
          </Link>
        </div>
      </section>

      <section className="space-y-3" aria-label="Leaderboard preview">
        <div className="flex items-center justify-between">
          <HomeSectionTitle labelKey="home.leaderboard" />
          <Link
            href="/leaderboard"
            className="text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
          >
            <HomeText id="home.open" />
          </Link>
        </div>
        <ol className="space-y-2">
          {(leaderboardRows ?? []).map((row) => (
            <li
              key={`${row.rank}-${row.nickname}`}
              className="flex justify-between text-sm"
            >
              <span>
                #{row.rank} {row.nickname}
              </span>
              <span className="text-[var(--brand-accent)]">
                {row.metric_value.toLocaleString()}
              </span>
            </li>
          ))}
          {!leaderboardRows?.length ? (
            <li className="text-sm text-[var(--brand-muted)]"><HomeText id="home.noRankings" /></li>
          ) : null}
        </ol>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/profile"><HomeText id="home.profileSettings" /></Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/support"><HomeText id="home.support" /></Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/friends"><HomeText id="home.friends" /></Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/guide"><HomeText id="home.gameGuide" /></Link>
        </Button>
      </div>
    </main>
  );
}
