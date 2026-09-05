"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  CreditCard,
  Flag,
  Gamepad2,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
  Ticket,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "@/modules/admin";
import { useTranslations } from "@/modules/localization/provider";

const ICON_BY_HREF: Record<string, typeof LayoutDashboard> = {
  "/admin": LayoutDashboard,
  "/admin/players": Users,
  "/admin/credits": CreditCard,
  "/admin/games": Gamepad2,
  "/admin/games/releases": Gamepad2,
  "/admin/games/config": Gamepad2,
  "/admin/admins": Shield,
  "/admin/announcements": ScrollText,
  "/admin/tickets": Ticket,
  "/admin/missions": Flag,
  "/admin/flags": Flag,
  "/admin/assets": ClipboardList,
  "/admin/qa": Users,
  "/admin/audit": ScrollText,
  "/admin/reports": ClipboardList,
  "/admin/settings": Settings,
};

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
            {ADMIN_NAV.map((link) => {
              const Icon = ICON_BY_HREF[link.href] ?? LayoutDashboard;
              const active =
                link.href === "/admin"
                  ? pathname === "/admin"
                  : pathname === link.href ||
                    pathname.startsWith(`${link.href}/`);
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
                  {t(link.labelKey)}
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
            {ADMIN_NAV.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="touch-target whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--brand-border)] px-3 text-sm text-[var(--brand-muted)]"
              >
                {t(link.labelKey)}
              </Link>
            ))}
          </nav>
        </header>
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
