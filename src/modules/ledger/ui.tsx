"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatCountdown,
  msUntilUtcMidnight,
  type CreditConfig,
} from "@/modules/ledger";
import {
  cancelCreditRequestAction,
  claimDailyRewardAction,
  createCreditRequestAction,
  reviewCreditRequestAction,
  secondApproveCreditRequestAction,
} from "@/modules/ledger/actions";
import type { ActionResult } from "@/modules/player/auth-shared";

function ResultMessage({ state }: { state: ActionResult | null }) {
  if (!state?.message) return null;
  return (
    <p
      className={
        state.ok ? "text-sm text-[var(--brand-accent)]" : "text-sm text-red-300"
      }
      role={state.ok ? "status" : "alert"}
    >
      {state.message}
    </p>
  );
}

export function DailyCheckInCard({
  config,
  streakDay,
  lastClaimDate,
  balance,
  claimedToday,
}: {
  config: CreditConfig;
  streakDay: number;
  lastClaimDate: string | null;
  balance: number;
  claimedToday: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [countdown, setCountdown] = useState(() =>
    formatCountdown(msUntilUtcMidnight()),
  );
  const blockedByBalance = balance > config.daily_reward_max_balance;

  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdown(formatCountdown(msUntilUtcMidnight()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => i + 1), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily check-in</CardTitle>
        <CardDescription>
          Base {config.daily_base_amount.toLocaleString()} GIK · Day 3 +
          {config.daily_streak_day3_bonus.toLocaleString()} · Day 7 +
          {config.daily_streak_day7_bonus.toLocaleString()}
        </CardDescription>
      </CardHeader>

      <div className="mb-4 grid grid-cols-7 gap-2">
        {days.map((day) => (
          <div
            key={day}
            className={`rounded-[var(--radius-md)] border px-2 py-3 text-center text-xs ${
              day <= streakDay
                ? "border-[var(--brand-accent)] text-[var(--brand-accent)]"
                : "border-[var(--brand-border)] text-[var(--brand-muted)]"
            }`}
          >
            D{day}
          </div>
        ))}
      </div>

      <p className="mb-3 text-sm text-[var(--brand-muted)]">
        {claimedToday
          ? `Next check-in in ${countdown} (UTC)`
          : blockedByBalance
            ? `Unavailable while balance is above ${config.daily_reward_max_balance.toLocaleString()} GIK`
            : `Ready to claim · streak day would advance from ${streakDay}`}
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
        {pending ? "Claiming…" : claimedToday ? "Claimed today" : "Claim daily reward"}
      </Button>
    </Card>
  );
}

export function CreditRequestForm() {
  const [state, action, pending] = useActionState(
    createCreditRequestAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Request demo credits</CardTitle>
        <CardDescription>
          Simulated ledger request only — not a payment or cash-out.
        </CardDescription>
      </CardHeader>
      <form action={action} className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="amount">Amount (GIK)</Label>
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
          <Label htmlFor="note">Note (optional)</Label>
          <Input id="note" name="note" maxLength={200} />
        </div>
        <ResultMessage state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? "Submitting…" : "Submit request"}
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
    player_note: string | null;
    created_at: string;
  }>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<ActionResult | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your credit requests</CardTitle>
      </CardHeader>
      <ResultMessage state={message} />
      <ul className="space-y-3">
        {requests.length === 0 ? (
          <li className="text-sm text-[var(--brand-muted)]">No requests yet.</li>
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
                  {request.player_note ? ` · ${request.player_note}` : ""}
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
                  Cancel
                </Button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

export function AdminCreditReviewForm({
  requestId,
  requestedAmount,
}: {
  requestId: string;
  requestedAmount: number;
}) {
  const [state, action, pending] = useActionState(
    reviewCreditRequestAction,
    null,
  );
  const [gross, setGross] = useState(requestedAmount);
  const [feeMode, setFeeMode] = useState<"percent" | "amount" | "">("percent");
  const [feeValue, setFeeValue] = useState(2);
  const [bonus, setBonus] = useState(0);

  const fee =
    feeMode === "percent"
      ? Math.floor((gross * feeValue) / 100)
      : feeMode === "amount"
        ? Math.floor(feeValue)
        : 0;
  const net = gross - fee + bonus;

  return (
    <form action={action} className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--brand-border)] p-4">
      <input type="hidden" name="requestId" value={requestId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`gross-${requestId}`}>Gross GIK</Label>
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
          <Label htmlFor={`bonus-${requestId}`}>Bonus GIK</Label>
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
          <Label htmlFor={`fee-mode-${requestId}`}>Simulation fee mode</Label>
          <select
            id={`fee-mode-${requestId}`}
            name="feeMode"
            value={feeMode}
            onChange={(event) =>
              setFeeMode(event.target.value as "percent" | "amount" | "")
            }
            className="flex h-11 w-full rounded-[var(--radius-lg)] border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 text-sm"
          >
            <option value="">None</option>
            <option value="percent">Percent</option>
            <option value="amount">Amount</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`fee-value-${requestId}`}>Fee value</Label>
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
        Fee {fee.toLocaleString()} · Net {net.toLocaleString()} GIK (simulated)
      </p>
      <div className="space-y-2">
        <Label htmlFor={`reason-${requestId}`}>Reason</Label>
        <Input id={`reason-${requestId}`} name="reason" required minLength={3} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          name="decision"
          value="approved"
          disabled={pending}
        >
          Approve
        </Button>
        <Button
          type="submit"
          name="decision"
          value="rejected"
          variant="outline"
          disabled={pending}
        >
          Reject
        </Button>
      </div>
      <ResultMessage state={state} />
    </form>
  );
}

export function SecondApproveButton({ reviewId }: { reviewId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setMessage(await secondApproveCreditRequestAction(reviewId));
          });
        }}
      >
        {pending ? "Approving…" : "Second approve"}
      </Button>
      <ResultMessage state={message} />
    </div>
  );
}
