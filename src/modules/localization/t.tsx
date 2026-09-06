"use client";

import { useTranslations } from "@/modules/localization/provider";

/** Client text node for server components that need catalog lookups. */
export function T({
  id,
  params,
}: {
  id: string;
  params?: Record<string, string | number>;
}) {
  const t = useTranslations();
  return <>{t(id, params)}</>;
}
