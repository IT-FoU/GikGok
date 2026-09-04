"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useTranslations } from "@/modules/localization/provider";
import { useSound } from "@/modules/sound/sound-provider";

export function WelcomeView({ deleted }: { deleted?: boolean }) {
  const t = useTranslations();
  const sound = useSound();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="animate-fade-up space-y-4">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--brand-muted)]">
          {t("welcome.eyebrow")}
        </p>
        <h1 className="font-display text-5xl font-semibold tracking-tight text-[var(--brand-accent)] md:text-6xl">
          {t("welcome.headline")}
        </h1>
        <p className="max-w-xl text-lg text-[var(--brand-muted)]">
          {t("welcome.body")}
        </p>
        {deleted ? (
          <p className="text-sm text-[var(--brand-accent)]">
            {t("welcome.deleted")}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 animate-fade-up">
        <Button asChild>
          <Link
            href="/register"
            onClick={() => void sound.play("ui_click")}
          >
            {t("nav.createAccount")}
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/login" onClick={() => void sound.play("ui_click")}>
            {t("nav.signIn")}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/guide" onClick={() => void sound.play("ui_click")}>
            {t("nav.guide")}
          </Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/admin" onClick={() => void sound.play("ui_click")}>
            {t("nav.admin")}
          </Link>
        </Button>
      </div>
    </main>
  );
}
