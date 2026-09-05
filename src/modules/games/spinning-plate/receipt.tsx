"use client";

import Link from "next/link";

import { useTranslations } from "@/modules/localization/provider";

import { slotIcon, type PlateReceiptView } from "./config";
import { formatGik, totalReturnLabel } from "./session";

export function PlateReceiptPanel({ receipt }: { receipt: PlateReceiptView }) {
  const t = useTranslations();
  const { result } = receipt;

  return (
    <section
      className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--brand-accent)]">
            {receipt.isWin ? t("plate.result.win") : t("plate.result.lose")}
          </h2>
          <p className="text-sm text-[var(--brand-muted)]">
            {t("plate.result.totalReturn")}:{" "}
            {totalReturnLabel(receipt.totalReturnMultiplier)}
          </p>
        </div>
        <span className="rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-muted)]">
          {receipt.settlementMode === "controlled_demo"
            ? t("plate.receipt.controlledDemo")
            : t("plate.receipt.random")}
        </span>
      </div>

      <p className="text-sm">
        {t("plate.result.selected")}: #{result.selectedSlot} (
        {slotIcon(result.selectedSlot)}) · {t("plate.result.landed")}: #
        {result.landedSlot} ({slotIcon(result.landedSlot)}) · x
        {result.multiplier}
      </p>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--brand-muted)]">{t("plate.receipt.stake")}</dt>
          <dd>{formatGik(receipt.stake)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("plate.receipt.payout")}</dt>
          <dd>{formatGik(receipt.payoutAmount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">
            {t("plate.receipt.balanceAfter")}
          </dt>
          <dd>{formatGik(receipt.balanceAfter)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("plate.receipt.betId")}</dt>
          <dd className="break-all font-mono text-xs">{receipt.betId}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("plate.receipt.version")}</dt>
          <dd className="break-all font-mono text-xs">{receipt.gameVersionId}</dd>
        </div>
      </dl>

      {receipt.replay ? (
        <p className="text-xs text-[var(--brand-muted)]">{t("plate.receipt.replay")}</p>
      ) : null}

      <Link
        href="/ledger"
        className="inline-flex text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
      >
        {t("plate.receipt.viewHistory")}
      </Link>
    </section>
  );
}

export function PlateHistoryList({
  rows,
}: {
  rows: Array<{
    id: string;
    stake: number;
    is_win: boolean;
    payout_amount: number;
    total_return_multiplier: number;
    settlement_mode: string;
    created_at: string;
    selection: { slot?: number };
    result_payload: { selectedSlot?: number; landedSlot?: number };
  }>;
}) {
  const t = useTranslations();

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--brand-muted)]">{t("common.empty")}</p>;
  }

  return (
    <ul className="divide-y divide-[var(--brand-border)] rounded-[var(--radius-xl)] border border-[var(--brand-border)]">
      {rows.map((row) => (
        <li key={row.id} className="space-y-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {row.is_win ? t("plate.result.win") : t("plate.result.lose")} ·{" "}
              {totalReturnLabel(Number(row.total_return_multiplier))}
            </span>
            <time className="text-xs text-[var(--brand-muted)]">
              {new Date(row.created_at).toLocaleString()}
            </time>
          </div>
          <p className="text-[var(--brand-muted)]">
            #{row.selection?.slot ?? "—"} → landed #
            {row.result_payload?.landedSlot ?? "—"} · {formatGik(row.stake)} →{" "}
            {formatGik(row.payout_amount)}
            {row.settlement_mode === "controlled_demo"
              ? ` · ${t("plate.receipt.controlledDemo")}`
              : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
