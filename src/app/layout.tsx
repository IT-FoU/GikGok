import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Noto_Sans_Lao, Sora } from "next/font/google";

import { AppProviders } from "@/components/providers/app-providers";
import { DEFAULT_LOCALE } from "@/modules/localization";
import { sanitizeAccentTheme } from "@/modules/theme/accents";

import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
});

const notoLao = Noto_Sans_Lao({
  variable: "--font-noto-lao",
  subsets: ["lao"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GIKGOK",
  description:
    "Private multi-account demo-credit game platform. GIK credits have no cash value.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const accent = sanitizeAccentTheme("green");

  return (
    <html
      lang={DEFAULT_LOCALE}
      data-color-mode="dark"
      data-accent={accent}
      className={`${sora.variable} ${notoLao.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col font-[family-name:var(--font-body)]">
        <AppProviders
          locale={DEFAULT_LOCALE}
          colorMode="system"
          accent={accent}
        >
          {children}
        </AppProviders>
      </body>
    </html>
  );
}
