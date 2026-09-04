"use client";

import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslations } from "@/modules/localization/provider";

export default function GuidePage() {
  const t = useTranslations();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <p className="text-sm text-[var(--brand-muted)]">
        <Link href="/" className="underline-offset-4 hover:underline">
          ← {t("welcome.headline")}
        </Link>
      </p>
      <div className="space-y-3">
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          {t("guide.title")}
        </h1>
        <p className="text-[var(--brand-muted)]">{t("guide.body")}</p>
      </div>

      <section id="fpc" className="scroll-mt-24 space-y-3">
        <Card>
          <CardHeader>
            <CardTitle>{t("guide.fpcTitle")}</CardTitle>
            <CardDescription>{t("guide.fpcBody")}</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            <Link
              href="/play/fish-prawn-crab"
              className="text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
            >
              {t("fpc.name")} →
            </Link>
          </div>
        </Card>
      </section>

      <div id="games" className="grid gap-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("guide.highlow").split(" — ")[0]}</CardTitle>
            <CardDescription>{t("guide.highlow")}</CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("guide.plate").split(" — ")[0]}</CardTitle>
            <CardDescription>{t("guide.plate")}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </main>
  );
}
