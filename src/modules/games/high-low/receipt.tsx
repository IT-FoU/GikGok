"use client";

import Link from "next/link";

import { useTranslations } from "@/modules/localization/provider";

import type { HighLowReceiptView } from "./config";
import { NumberDie } from "./dice-2d";
import { formatGik, totalReturnLabel } from "./session";

export function HighLowReceiptPanel({ receipt }: { receipt: HighLowReceiptView }) {
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
            {receipt.isWin ? t("highlow.result.win") : t("highlow.result.lose")}
          </h2>
          <p className="text-sm text-[var(--brand-muted)]">
            {t("highlow.result.totalReturn")}:{" "}
            {totalReturnLabel(receipt.totalReturnMultiplier)}
          </p>
        </div>
        <span className="rounded-[var(--radius-md)] border border-[var(--brand-border)] px-2 py-1 text-xs text-[var(--brand-muted)]">
          {receipt.settlementMode === "controlled_demo"
            ? t("highlow.receipt.controlledDemo")
            : t("highlow.receipt.random")}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {result.dice.map((value, index) => (
          <NumberDie
            key={`${value}-${index}`}
            value={value}
            size="md"
            highlighted
            triple={result.isTriple}
          />
        ))}
        <div className="text-sm">
          <p>
            {t("highlow.result.total")}:{" "}
            <strong className="font-display text-lg">{result.total}</strong>
          </p>
          <p className="text-[var(--brand-muted)]">
            {result.isTriple
              ? t("highlow.result.triple")
              : `${t("highlow.result.actualSide")}: ${
                  result.actualSide === "high"
                    ? t("highlow.sideHigh")
                    : t("highlow.sideLow")
                }`}
          </p>
        </div>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[var(--brand-muted)]">{t("highlow.receipt.selection")}</dt>
          <dd>
            {receipt.selection.side === "high"
              ? t("highlow.sideHigh")
              : t("highlow.sideLow")}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("highlow.receipt.stake")}</dt>
          <dd>{formatGik(receipt.stake)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("highlow.receipt.payout")}</dt>
          <dd>{formatGik(receipt.payoutAmount)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("highlow.receipt.balanceAfter")}</dt>
          <dd>{formatGik(receipt.balanceAfter)}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("highlow.receipt.betId")}</dt>
          <dd className="break-all font-mono text-xs">{receipt.betId}</dd>
        </div>
        <div>
          <dt className="text-[var(--brand-muted)]">{t("highlow.receipt.version")}</dt>
          <dd className="break-all font-mono text-xs">{receipt.gameVersionId}</dd>
        </div>
      </dl>

      {receipt.replay ? (
        <p className="text-xs text-[var(--brand-muted)]">{t("highlow.receipt.replay")}</p>
      ) : null}

      <Link
        href="/ledger"
        className="inline-flex text-sm text-[var(--brand-accent)] underline-offset-4 hover:underline"
      >
        {t("highlow.receipt.viewHistory")}
      </Link>
    </section>
  );
}

export function HighLowHistoryList({
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
    selection: { side?: string };
    result_payload: {
      dice?: number[];
      total?: number;
      isTriple?: boolean;
    };
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
              {row.is_win ? t("highlow.result.win") : t("highlow.result.lose")} ·{" "}
              {totalReturnLabel(Number(row.total_return_multiplier))}
            </span>
            <time className="text-xs text-[var(--brand-muted)]">
              {new Date(row.created_at).toLocaleString()}
            </time>
          </div>
          <p className="text-[var(--brand-muted)]">
            {row.selection?.side ?? "—"} · {formatGik(row.stake)} →{" "}
            {formatGik(row.payout_amount)}
            {row.result_payload?.isTriple ? ` · ${t("highlow.result.triple")}` : ""}
            {row.settlement_mode === "controlled_demo"
              ? ` · ${t("highlow.receipt.controlledDemo")}`
              : ""}
          </p>
          <p className="font-mono text-xs text-[var(--brand-muted)]">
            {(row.result_payload?.dice ?? []).join(" + ")}
            {row.result_payload?.total != null
              ? ` = ${row.result_payload.total}`
              : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}
