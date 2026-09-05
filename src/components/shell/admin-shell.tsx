"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  Gamepad2,
  LayoutDashboard,
  Settings,
  Ticket,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useTranslations } from "@/modules/localization/provider";

const ADMIN_LINKS = [
  { href: "/admin", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/admin#players", key: "nav.players", icon: Users },
  { href: "/admin/credits", key: "nav.credits", icon: CreditCard },
  { href: "/admin/games", key: "nav.games", icon: Gamepad2 },
  { href: "/admin#tickets", key: "nav.tickets", icon: Ticket },
  { href: "/admin#settings", key: "nav.settings", icon: Settings },
] as const;

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations();

  return (
    <div className="flex min-h-full flex-1 bg-[color-mix(in_oklab,var(--brand-background)_96%,black)]">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--brand-border)] lg:block">
        <div className="sticky top-0 space-y-4 p-5">
          <div>
            <p className="font-display text-xl font-semibold text-[var(--brand-accent)]">
              {t("app.name")}
            </p>
            <p className="text-xs text-[var(--brand-muted)]">{t("admin.title")}</p>
          </div>
          <nav className="space-y-1" aria-label="Admin navigation">
            {ADMIN_LINKS.map((link) => {
              const Icon = link.icon;
              const base = link.href.split("#")[0]!;
              const active =
                link.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === base || pathname.startsWith(`${base}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "touch-target flex items-center gap-3 rounded-[var(--radius-md)] px-3 text-sm",
                    active
                      ? "bg-[var(--brand-surface)] text-[var(--brand-accent)]"
                      : "text-[var(--brand-muted)] hover:bg-[var(--brand-surface)] hover:text-[var(--brand-foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  {t(link.key)}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--brand-border)] px-4 py-4 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-xl font-semibold md:text-2xl">
              {t("admin.title")}
            </h1>
            <Link
              href="/"
              className="text-sm text-[var(--brand-muted)] underline-offset-4 hover:underline"
            >
              {t("common.back")}
            </Link>
          </div>
          <nav
            className="mt-3 flex gap-2 overflow-x-auto lg:hidden"
            aria-label="Admin compact navigation"
          >
            {ADMIN_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="touch-target whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--brand-border)] px-3 text-sm text-[var(--brand-muted)]"
              >
                {t(link.key)}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
