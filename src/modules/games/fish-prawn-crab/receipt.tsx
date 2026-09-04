"use client";

import Link from "next/link";

import { useTranslations } from "@/modules/localization/provider";

import type { FpcReceiptView } from "./config";
import { SymbolDie } from "./dice-2d";
import { formatGik, totalReturnLabel } from "./session";

export function FpcReceiptPanel({ receipt }: { receipt: FpcReceiptView }) {
  const t = useTranslations();

  return (
    <section
      className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--brand-accent)]">
            {receipt.isWin ? t("fpc.result.win") : t("fpc.result.lose")}
          </h2>
          <p className="text-sm text-[var(--brand-muted)]">
            {t("fpc.result.totalReturn")}:{" "}
            {totalReturnLabel(receipt.totalReturnMultiplier)}
          </p>
        </div>
        {receipt.settlementMode === "controlled_demo" ? (
          <span className="rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-muted)]">
            {t("fpc.receipt.controlledDemo")}
          </span>
        ) : (
          <span className="rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-muted)]">
            {t("fpc.receipt.random")}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {receipt.result.dice.map((symbol, index) => (
          <SymbolDie key={`${symbol}-${index}`} symbol={symbol} size="md" highlighted />
        ))}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--brand-muted)]">{t("fpc.receipt.stake")}</dt>
          <dd>{formatGik(receipt.stake)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("fpc.receipt.payout")}</dt>
          <dd>{formatGik(receipt.payoutAmount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("fpc.receipt.balanceAfter")}</dt>
          <dd>{formatGik(receipt.balanceAfter)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("fpc.receipt.betId")}</dt>
          <dd className="break-all font-mono text-xs">{receipt.betId}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("fpc.receipt.selection")}</dt>
          <dd>
            {receipt.selection.kind === "single_symbol"
              ? t("fpc.kind.single")
              : t("fpc.kind.pair")}
            : {receipt.selection.symbols.join(", ")}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("fpc.receipt.version")}</dt>
          <dd className="break-all font-mono text-xs">{receipt.gameVersionId}</dd>
        </div>
      </dl>

      {receipt.replay ? (
        <p className="text-xs text-[var(--brand-muted)]">{t("fpc.receipt.replay")}</p>
      ) : null}

      <Link
        href="/ledger"
        className="inline-flex text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
      >
        {t("fpc.receipt.viewHistory")}
      </Link>
    </section>
  );
}

export function FpcHistoryList({
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
    selection: { kind?: string; symbols?: string[] };
    result_payload: { dice?: string[] };
  }>;
}) {
  const t = useTranslations();

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--brand-muted)]">{t("common.empty")}</p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--brand-border)] rounded-[var(--radius-xl)] border border-[var(--brand-border)]">
      {rows.map((row) => (
        <li key={row.id} className="space-y-1 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium">
              {row.is_win ? t("fpc.result.win") : t("fpc.result.lose")} ·{" "}
              {totalReturnLabel(Number(row.total_return_multiplier))}
            </span>
            <time className="text-xs text-[var(--brand-muted)]">
              {new Date(row.created_at).toLocaleString()}
            </time>
          </div>
          <p className="text-[var(--brand-muted)]">
            {row.selection?.kind ?? "—"} · {formatGik(row.stake)} →{" "}
            {formatGik(row.payout_amount)}
            {row.settlement_mode === "controlled_demo"
              ? ` · ${t("fpc.receipt.controlledDemo")}`
              : ""}
          </p>
          <p className="font-mono text-xs text-[var(--brand-muted)]">
            {(row.result_payload?.dice ?? []).join(" · ") || "—"}
          </p>
        </li>
      ))}
    </ul>
  );
}
