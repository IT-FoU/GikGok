"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Gamepad2,
  History,
  Home,
  ScrollText,
  UserRound,
  Wallet,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslations } from "@/modules/localization/provider";
import { useSound } from "@/modules/sound/sound-provider";

const PLAYER_LINKS = [
  { href: "/home", key: "nav.home", icon: Home },
  { href: "/play/fish_prawn_crab", key: "nav.games", icon: Gamepad2 },
  { href: "/credits", key: "nav.credits", icon: Wallet },
  { href: "/ledger", key: "nav.ledger", icon: ScrollText },
  { href: "/guide", key: "nav.guide", icon: BookOpen },
  { href: "/profile", key: "nav.profile", icon: UserRound },
  { href: "/profile#history", key: "nav.history", icon: History },
] as const;

const AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/verify",
  "/forgot-password",
  "/reset-password",
  "/account-status",
]);

export function PlayerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations();
  const sound = useSound();
  const isAuthRoute = AUTH_PATHS.has(pathname);

  if (isAuthRoute) {
    return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b border-[var(--brand-border)] bg-[color-mix(in_oklab,var(--brand-background)_88%,transparent)] backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 md:h-16 md:px-6">
          <Link
            href="/"
            className="font-display text-lg font-semibold tracking-wide text-[var(--brand-accent)] md:text-xl"
            onClick={() => void sound.play("ui_click")}
          >
            {t("app.name")}
          </Link>

          <nav
            className="hidden items-center gap-1 md:flex lg:hidden"
            aria-label="Player compact navigation"
          >
            {PLAYER_LINKS.map((link) => {
              const base = link.href.split("#")[0]!;
              const active =
                link.key === "nav.games"
                  ? pathname.startsWith("/play")
                  : pathname === base || pathname.startsWith(`${base}/`) || pathname.startsWith(base);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => void sound.play("ui_click")}
                  className={cn(
                    "touch-target inline-flex items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm transition-colors",
                    active
                      ? "bg-[var(--brand-surface)] text-[var(--brand-accent)]"
                      : "text-[var(--brand-muted)] hover:text-[var(--brand-foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{t(link.key)}</span>
                </Link>
              );
            })}
          </nav>

          <p className="hidden text-xs text-[var(--brand-muted)] lg:block">
            {t("app.demoNotice")}
          </p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 md:px-6">
        <aside
          className="hidden w-56 shrink-0 lg:block"
          aria-label="Player sidebar"
        >
          <nav className="surface sticky top-24 space-y-1 p-3">
            {PLAYER_LINKS.map((link) => {
              const base = link.href.split("#")[0]!;
              const active =
                link.key === "nav.games"
                  ? pathname.startsWith("/play")
                  : pathname === base || pathname.startsWith(`${base}/`) || pathname.startsWith(base);
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => void sound.play("ui_click")}
                  className={cn(
                    "touch-target flex items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm transition-colors",
                    active
                      ? "bg-[color-mix(in_oklab,var(--brand-accent)_18%,transparent)] text-[var(--brand-accent)]"
                      : "text-[var(--brand-muted)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand-foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {t(link.key)}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 pb-24 md:pb-8">{children}</div>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--brand-border)] bg-[color-mix(in_oklab,var(--brand-background)_92%,transparent)] backdrop-blur-md md:hidden"
        aria-label="Player bottom navigation"
      >
        <ul className="mx-auto flex max-w-2xl gap-1 overflow-x-auto px-2 py-2">
          {PLAYER_LINKS.map((link) => {
            const base = link.href.split("#")[0]!;
            const active =
              link.key === "nav.games"
                ? pathname.startsWith("/play")
                : pathname === base || pathname.startsWith(base);
            const Icon = link.icon;
            return (
              <li key={link.href} className="min-w-[4.25rem] flex-1">
                <Link
                  href={link.href}
                  onClick={() => void sound.play("ui_click")}
                  className={cn(
                    "touch-target flex flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] text-[0.65rem]",
                    active
                      ? "text-[var(--brand-accent)]"
                      : "text-[var(--brand-muted)]",
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  <span>{t(link.key)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
