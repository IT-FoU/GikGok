"use client";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/states";
import { useTranslations } from "@/modules/localization/provider";

export default function AdminHomePage() {
  const t = useTranslations();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("admin.title")}</CardTitle>
          <CardDescription>{t("admin.body")}</CardDescription>
        </CardHeader>
        <p className="text-sm text-[var(--brand-muted)]">{t("admin.desktopHint")}</p>
      </Card>

      <section id="players" className="space-y-3">
        <h2 className="font-display text-xl font-semibold">{t("nav.players")}</h2>
        <Table>
          <THead>
            <TR>
              <TH>ID</TH>
              <TH>{t("auth.nickname")}</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            <TR>
              <TD colSpan={3}>
                <EmptyState title={t("common.empty")} description={t("common.noResults")} />
              </TD>
            </TR>
          </TBody>
        </Table>
      </section>

      <section id="credits" className="space-y-3">
        <h2 className="font-display text-xl font-semibold">{t("nav.credits")}</h2>
        <EmptyState title={t("common.empty")} />
      </section>

      <section id="tickets" className="space-y-3">
        <h2 className="font-display text-xl font-semibold">{t("nav.tickets")}</h2>
        <EmptyState title={t("common.empty")} />
      </section>

      <section id="settings" className="space-y-3">
        <h2 className="font-display text-xl font-semibold">{t("nav.settings")}</h2>
        <Card>
          <CardDescription>
            Owner accent theme is system-wide and not player-editable. Configure
            in later admin settings modules.
          </CardDescription>
        </Card>
      </section>
    </div>
  );
}
