import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
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
  applicationName: "GIKGOK",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GIKGOK",
  },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon.svg" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b3d2e" },
    { media: "(prefers-color-scheme: dark)", color: "#071912" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const accent = sanitizeAccentTheme("green");
  // Proxy sets CSP + x-nonce on the request. Next 16 reads the CSP nonce for
  // framework scripts automatically; we also surface it for any future Script tags.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang={DEFAULT_LOCALE}
      data-nonce={nonce}
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
