"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useTranslations } from "@/modules/localization/provider";

export function HomeGreeting({
  nickname,
  balance,
  verifyHint,
  playPausedUntil,
  breakDue,
  demoNotice,
}: {
  nickname: string;
  balance: number;
  verifyHint: boolean;
  playPausedUntil?: string | null;
  breakDue?: boolean;
  demoNotice?: string | null;
}) {
  const t = useTranslations();
  return (
    <div>
      <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
        {t("home.greeting", { name: nickname })}
      </h1>
      <p className="mt-2 text-[var(--brand-muted)]">
        {t("home.balance", { amount: balance.toLocaleString() })}
      </p>
      {demoNotice ? (
        <p className="mt-1 text-sm text-[var(--brand-muted)]">{demoNotice}</p>
      ) : null}
      {verifyHint ? (
        <p className="mt-2 text-sm text-amber-200">{t("home.verifyHint")}</p>
      ) : null}
      {playPausedUntil ? (
        <p className="mt-2 text-sm text-amber-200">
          {t("home.playPausedUntil", {
            until: new Date(playPausedUntil).toLocaleString(),
          })}
        </p>
      ) : null}
      {breakDue ? (
        <p className="mt-2 text-sm text-amber-200">{t("home.breakReminder")}</p>
      ) : null}
    </div>
  );
}

export function HomeSignOutButton() {
  const t = useTranslations();
  return (
    <Button type="submit" variant="outline">
      {t("nav.signOut")}
    </Button>
  );
}

export function HomeDailyReward({
  streak,
  claimedToday,
}: {
  streak: number;
  claimedToday: boolean;
}) {
  const t = useTranslations();
  return (
    <section className="space-y-3" aria-label={t("home.dailyReward")}>
      <h2 className="text-lg font-medium">{t("home.dailyReward")}</h2>
      <p className="text-sm text-[var(--brand-muted)]">
        {t("home.streak", { count: streak })}
        {" · "}
        {claimedToday ? t("home.claimedToday") : t("home.availableOnCredits")}
      </p>
      <Button asChild variant="secondary">
        <Link href="/credits">{t("home.openCredits")}</Link>
      </Button>
    </section>
  );
}

export function HomeSectionTitle({ labelKey }: { labelKey: string }) {
  const t = useTranslations();
  return <h2 className="text-lg font-medium">{t(labelKey)}</h2>;
}

export function HomeText({
  id,
  params,
}: {
  id: string;
  params?: Record<string, string | number>;
}) {
  const t = useTranslations();
  return <>{t(id, params)}</>;
}
