"use client";

import { CardDescription, CardTitle } from "@/components/ui/card";
import {
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { useTranslations } from "@/modules/localization/provider";

export function AdminTicketsHeader() {
  const t = useTranslations();
  return (
    <>
      <CardTitle>{t("admin.tickets.title")}</CardTitle>
      <CardDescription>{t("admin.tickets.description")}</CardDescription>
    </>
  );
}

export function AdminTicketsTableHead() {
  const t = useTranslations();
  return (
    <THead>
      <TR>
        <TH>{t("admin.tickets.subject")}</TH>
        <TH>{t("admin.tickets.category")}</TH>
        <TH>{t("admin.tickets.status")}</TH>
        <TH>{t("admin.tickets.created")}</TH>
        <TH>{t("admin.tickets.attachments")}</TH>
      </TR>
    </THead>
  );
}
