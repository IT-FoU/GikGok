"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/modules/localization/provider";
import { useSound } from "@/modules/sound/sound-provider";
import { useTheme } from "@/modules/theme/theme-provider";
import type { AppLocale } from "@/modules/localization";
import type { ColorMode } from "@/modules/theme/accents";
import type { SoundPackId } from "@/modules/sound/sound-manager";

export function AppearanceControls() {
  const { locale, setLocale, t } = useI18n();
  const { colorMode, setColorMode, accent } = useTheme();
  const sound = useSound();

  return (
    <section className="surface space-y-4 p-5">
      <h2 className="font-display text-xl font-semibold">{t("profile.preferences")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 text-sm">
          <span>{t("profile.language")}</span>
          <select
            className="flex h-11 w-full rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3"
            value={locale}
            onChange={(event) => {
              setLocale(event.target.value as AppLocale);
              void sound.play("ui_click");
            }}
          >
            <option value="lo">ລາວ</option>
            <option value="en">English</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span>Color mode</span>
          <select
            className="flex h-11 w-full rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3"
            value={colorMode}
            onChange={(event) => {
              setColorMode(event.target.value as ColorMode);
              void sound.play("ui_click");
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="space-y-2 text-sm">
          <span>{t("profile.soundPack")}</span>
          <select
            className="flex h-11 w-full rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3"
            value={sound.pack}
            onChange={(event) => {
              sound.setPack(event.target.value as SoundPackId);
              void sound.play("ui_success");
            }}
          >
            <option value="classic_casino">{t("sound.classic")}</option>
            <option value="arcade">{t("sound.arcade")}</option>
            <option value="silent">{t("sound.silent")}</option>
          </select>
        </label>

        <div className="space-y-2 text-sm">
          <p>Owner accent (locked)</p>
          <p className="rounded-[var(--radius-lg)] border border-[var(--brand-border)] px-3 py-3 text-[var(--brand-muted)]">
            {accent}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            sound.setMuted(!sound.muted);
            void sound.play("ui_click");
          }}
        >
          {sound.muted ? t("sound.muted") : "Mute toggle"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void sound.play("payout")}
        >
          Test sound
        </Button>
      </div>
    </section>
  );
}
