"use client";

import { I18nProvider } from "@/modules/localization/provider";
import { SoundProvider } from "@/modules/sound/sound-provider";
import { ThemeProvider } from "@/modules/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";
import type { AppLocale } from "@/modules/localization";
import type { AccentTheme, ColorMode } from "@/modules/theme/accents";

export function AppProviders({
  children,
  locale,
  colorMode,
  accent,
}: {
  children: React.ReactNode;
  locale: AppLocale;
  colorMode: ColorMode;
  accent: AccentTheme;
}) {
  return (
    <ThemeProvider initialColorMode={colorMode} initialAccent={accent}>
      <I18nProvider initialLocale={locale}>
        <SoundProvider>
          <ToastProvider>{children}</ToastProvider>
        </SoundProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
