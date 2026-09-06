"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatCountdown,
  msUntilUtcMidnight,
  streakCycleDay,
  type CreditConfig,
} from "@/modules/ledger";
import {
  cancelCreditRequestAction,
  claimDailyRewardAction,
  createCreditRequestAction,
  reviewCreditRequestAction,
  secondApproveCreditRequestAction,
} from "@/modules/ledger/actions";
import { resolveActionMessage } from "@/modules/localization/action-result";
import { useTranslations } from "@/modules/localization/provider";
import type { ActionResult } from "@/modules/player/auth-shared";

function ResultMessage({ state }: { state: ActionResult | null }) {
  const t = useTranslations();
  if (!state?.message && !state?.code) return null;
  const text = resolveActionMessage(t, state);
  if (!text) return null;
  return (
    <p
      className={
        state.ok
          ? "text-sm text-[var(--brand-accent)]"
          : "text-sm text-red-400"
      }
      role="status"
    >
      {text}
    </p>
  );
}

export function DailyCheckInCard({
  config,
  streakDay,
  balance,
  claimedToday,
}: {
  config: CreditConfig;
  streakDay: number;
  lastClaimDate?: string | null;
  balance: number;
  claimedToday: boolean;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(msUntilUtcMidnight()),
  );
  const blockedByBalance = balance > config.daily_reward_max_balance;
  const cycleDay = streakCycleDay(streakDay);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdown(formatCountdown(msUntilUtcMidnight()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => i + 1), []);

  const streakSuffix = claimedToday
    ? ` · ${t("credits.nextCheckIn", { countdown })}`
    : blockedByBalance
      ? ` · ${t("credits.unavailableBalance", {
          max: config.daily_reward_max_balance.toLocaleString(),
        })}`
      : ` · ${t("credits.readyToClaim")}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("credits.dailyTitle")}</CardTitle>
        <CardDescription>
          {t("credits.dailyDescription", {
            base: config.daily_base_amount.toLocaleString(),
            day3: config.daily_streak_day3_bonus.toLocaleString(),
            day7: config.daily_streak_day7_bonus.toLocaleString(),
          })}
        </CardDescription>
      </CardHeader>

      <div className="mb-4 grid grid-cols-7 gap-2">
        {days.map((day) => (
          <div
            key={day}
            className={`rounded-[var(--radius-md)] border px-2 py-3 text-center text-xs ${
              day <= cycleDay
                ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
                : "border-[var(--brand-border)] text-[var(--brand-muted)]"
            }`}
          >
            D{day}
          </div>
        ))}
      </div>

      <p className="mb-3 text-sm text-[var(--brand-muted)]">
        {t("credits.currentStreak", { days: streakDay })}
        {streakSuffix}
      </p>

      <ResultMessage state={message} />

      <Button
        type="button"
        disabled={
          pending ||
          claimedToday ||
          blockedByBalance ||
          !config.daily_rewards_enabled
        }
        onClick={() => {
          startTransition(async () => {
            const result = await claimDailyRewardAction();
            setMessage(result);
          });
        }}
      >
        {pending
          ? t("credits.claiming")
          : claimedToday
            ? t("credits.claimedToday")
            : t("credits.claimDaily")}
      </Button>
    </Card>
  );
}

export function CreditRequestForm() {
  const t = useTranslations();
  const [state, action, pending] = useActionState(
    createCreditRequestAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("credits.requestTitle")}</CardTitle>
        <CardDescription>{t("credits.requestBody")}</CardDescription>
      </CardHeader>
      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="amount">{t("credits.amount")}</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min={1}
            step={1}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="note">{t("credits.noteOptional")}</Label>
          <Input id="note" name="note" maxLength={200} />
        </div>
        <ResultMessage state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? t("credits.submitting") : t("credits.submitRequest")}
        </Button>
      </form>
    </Card>
  );
}

export function CreditRequestList({
  requests,
}: {
  requests: Array<{
    id: string;
    requested_amount: number;
    status: string;
    note: string | null;
    created_at: string;
  }>;
}) {
  const t = useTranslations();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionResult | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("credits.yourRequests")}</CardTitle>
      </CardHeader>
      <ResultMessage state={message} />
      <ul className="space-y-3">
        {requests.length === 0 ? (
          <li className="text-sm text-[var(--brand-muted)]">
            {t("credits.noRequests")}
          </li>
        ) : (
          requests.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--brand-border)] px-3 py-3"
            >
              <div className="text-sm">
                <p className="font-medium">
                  {request.requested_amount.toLocaleString()} GIK · {request.status}
                </p>
                <p className="text-[var(--brand-muted)]">
                  {new Date(request.created_at).toLocaleString()}
                  {request.note ? ` · ${request.note}` : ""}
                </p>
              </div>
              {request.status === "pending" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingId === request.id}
                  onClick={async () => {
                    setPendingId(request.id);
                    const result = await cancelCreditRequestAction(request.id);
                    setMessage(result);
                    setPendingId(null);
                  }}
                >
                  {t("credits.cancel")}
                </Button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

/** Admin review form — fee percent is primary; amount mode converts to percent. */
export function AdminReviewForm({
  requestId,
  requestedAmount,
  defaults,
}: {
  requestId: string;
  requestedAmount: number;
  defaults?: {
    gross?: number;
    feePercent?: number;
    bonus?: number;
    reason?: string;
  };
}) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(
    reviewCreditRequestAction,
    null,
  );
  const [gross, setGross] = useState(defaults?.gross ?? requestedAmount);
  const [feeMode, setFeeMode] = useState<"percent" | "amount" | "">(
    "percent",
  );
  const [feeValue, setFeeValue] = useState(defaults?.feePercent ?? 2);
  const [bonus, setBonus] = useState(defaults?.bonus ?? 0);

  const fee =
    feeMode === "percent"
      ? Math.floor((gross * feeValue) / 100)
      : feeMode === "amount"
        ? Math.floor(feeValue)
        : 0;
  const net = gross - fee + bonus;

  return (
    <form
      action={action}
      className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--brand-border)] p-4"
    >
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`gross-${requestId}`}>{t("credits.grossGik")}</Label>
          <Input
            id={`gross-${requestId}`}
            name="grossAmount"
            type="number"
            min={1}
            value={gross}
            onChange={(event) => setGross(Number(event.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`bonus-${requestId}`}>{t("credits.bonusGik")}</Label>
          <Input
            id={`bonus-${requestId}`}
            name="bonusAmount"
            type="number"
            min={0}
            value={bonus}
            onChange={(event) => setBonus(Number(event.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`fee-mode-${requestId}`}>{t("credits.feeMode")}</Label>
          <select
            id={`fee-mode-${requestId}`}
            name="feeMode"
            value={feeMode}
            onChange={(event) =>
              setFeeMode(event.target.value as "percent" | "amount" | "")
            }
            className="flex h-11 w-full rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
          >
            <option value="">{t("credits.feeNone")}</option>
            <option value="percent">{t("credits.feePercent")}</option>
            <option value="amount">{t("credits.feeAmountOption")}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`fee-value-${requestId}`}>
            {feeMode === "amount" ? t("credits.feeAmountGik") : t("credits.feePercentLabel")}
          </Label>
          <Input
            id={`fee-value-${requestId}`}
            name="feeValue"
            type="number"
            min={0}
            step="0.01"
            value={feeValue}
            onChange={(event) => setFeeValue(Number(event.target.value))}
          />
        </div>
      </div>
      <p className="text-sm text-[var(--brand-muted)]">
        {t("credits.feeNetSimulated", { fee: fee.toLocaleString(), net: net.toLocaleString() })}
      </p>
      <div className="space-y-2">
        <Label htmlFor={`reason-${requestId}`}>{t("common.reason")}</Label>
        <Input
          id={`reason-${requestId}`}
          name="reason"
          required
          minLength={1}
          defaultValue={defaults?.reason ?? ""}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approved" disabled={pending}>
          {t("credits.approve")}
        </Button>
        <Button
          type="submit"
          name="decision"
          value="rejected"
          variant="outline"
          disabled={pending}
        >
          {t("credits.reject")}
        </Button>
      </div>
      <ResultMessage state={state} />
    </form>
  );
}

/** @deprecated Prefer AdminReviewForm — alias kept for call-site clarity. */
export const AdminCreditReviewForm = AdminReviewForm;

/** Second approval reuses review_credit_request with first-review amounts. */
export function SecondApproveForm({
  requestId,
  gross,
  feePercent,
  bonus,
  reason,
}: {
  requestId: string;
  gross: number;
  feePercent: number;
  bonus: number;
  reason: string;
}) {
  const t = useTranslations();
  const [state, action, pending] = useActionState(
    secondApproveCreditRequestAction,
    null,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="grossAmount" value={gross} />
      <input type="hidden" name="feeMode" value="percent" />
      <input type="hidden" name="feeValue" value={feePercent} />
      <input type="hidden" name="bonusAmount" value={bonus} />
      <input type="hidden" name="reason" value={reason} />
      <p className="text-sm text-[var(--brand-muted)]">
        {t("credits.secondApproveSummary", { gross: gross.toLocaleString(), feePercent, bonus: bonus.toLocaleString() })}
        {feePercent}% · bonus {bonus.toLocaleString()}
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? t("common.approving") : t("credits.secondApprove")}
      </Button>
      <ResultMessage state={state} />
    </form>
  );
}

export function LedgerFilters({
  active,
}: {
  active: "all" | "credit" | "debit";
}) {
  const t = useTranslations();
  const filters = [
    { value: "all", label: t("credits.filterAll") },
    { value: "credit", label: t("credits.filterCredits") },
    { value: "debit", label: t("credits.filterDebits") },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2" role="navigation" aria-label={t("credits.filtersAria")}>
      {filters.map((item) => (
        <Link
          key={item.value}
          href={`/ledger?filter=${item.value}`}
          className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
            active === item.value
              ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
              : "border-[var(--brand-border)] text-[var(--brand-muted)]"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
