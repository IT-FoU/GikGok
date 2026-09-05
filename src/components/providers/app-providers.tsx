"use client";

import { AppErrorBoundary } from "@/components/error-boundary";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { ToastProvider } from "@/components/ui/toast";
import { I18nProvider } from "@/modules/localization/provider";
import type { AppLocale } from "@/modules/localization";
import { SoundProvider } from "@/modules/sound/sound-provider";
import { ThemeProvider } from "@/modules/theme/theme-provider";
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
          <ToastProvider>
            <AppErrorBoundary>
              {children}
              <ServiceWorkerRegister />
            </AppErrorBoundary>
          </ToastProvider>
        </SoundProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
