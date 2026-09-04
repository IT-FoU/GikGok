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
      <div id="games" className="grid gap-3">
        {[t("guide.fpc"), t("guide.highlow"), t("guide.plate")].map((item) => (
          <Card key={item}>
            <CardHeader>
              <CardTitle className="text-base">{item.split(" — ")[0]}</CardTitle>
              <CardDescription>{item}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </main>
  );
}
