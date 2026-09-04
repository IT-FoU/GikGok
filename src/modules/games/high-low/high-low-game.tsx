"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { startTransition, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { placeBetAction } from "@/modules/game-engine/actions";
import type { HighLowSide } from "@/modules/game-engine";
import { useTranslations } from "@/modules/localization/provider";
import { useSound } from "@/modules/sound/sound-provider";

import {
  HIGH_LOW_CONFIG,
  HIGH_LOW_GAME_ID,
  type HighLowReceiptView,
} from "./config";
import { DiceReveal2D, SidePicker } from "./dice-2d";
import { HighLowHistoryList, HighLowReceiptPanel } from "./receipt";
import {
  buildHighLowSelection,
  clearHighLowPending,
  formatGik,
  loadHighLowSession,
  newIdempotencyKey,
  parsePlaceBetPayload,
  parseReplayReceipt,
  resolveGraphicsMode,
  saveHighLowSession,
} from "./session";

function readInitialSession() {
  const session = loadHighLowSession();
  return {
    receipt: session?.receipt ?? null,
    idempotencyKey: session?.idempotencyKey ?? null,
    sessionPending: Boolean(session?.pending),
  };
}

function readPrefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const DiceReveal3D = dynamic(
  () => import("./dice-3d").then((mod) => mod.DiceReveal3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 items-center justify-center rounded-[var(--radius-xl)] border border-[var(--brand-border)] text-sm text-[var(--brand-muted)]">
        …
      </div>
    ),
  },
);

type HistoryRow = {
  id: string;
  stake: number;
  is_win: boolean;
  payout_amount: number;
  total_return_multiplier: number;
  settlement_mode: string;
  created_at: string;
  selection: { side?: string };
  result_payload: { dice?: number[]; total?: number; isTriple?: boolean };
};

export function HighLowGameClient({
  balance,
  graphicsMode = "auto",
  graphicsQuality = "medium",
  history,
}: {
  balance: number;
  graphicsMode?: "auto" | "2d" | "3d";
  graphicsQuality?: "low" | "medium" | "high";
  history: HistoryRow[];
}) {
  const t = useTranslations();
  const sound = useSound();
  const [initialSession] = useState(readInitialSession);
  const [initialReduced] = useState(readPrefersReducedMotion);
  const [side, setSide] = useState<HighLowSide>("high");
  const [stake, setStake] = useState<number>(HIGH_LOW_CONFIG.quickStakes[0]);
  const [locked, setLocked] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<HighLowReceiptView | null>(
    initialSession.receipt,
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(
    initialSession.idempotencyKey,
  );
  const [sessionPending, setSessionPending] = useState(
    initialSession.sessionPending,
  );
  const [reducedMotion, setReducedMotion] = useState(initialReduced);
  const [renderer, setRenderer] = useState<"2d" | "3d">(() =>
    resolveGraphicsMode(graphicsMode, initialReduced, graphicsQuality),
  );
  const [pending, startSubmit] = useTransition();
  const [optimisticBalance, setOptimisticBalance] = useState<number | null>(
    null,
  );
  const localBalance = optimisticBalance ?? balance;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      startTransition(() => {
        setReducedMotion(media.matches);
        setRenderer(
          resolveGraphicsMode(graphicsMode, media.matches, graphicsQuality),
        );
      });
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [graphicsMode, graphicsQuality]);

  async function submitBet(reuseKey?: string) {
    const selection = buildHighLowSelection(side);
    if ("error" in selection) {
      setError(t("highlow.error.side"));
      void sound.play("ui_error");
      return;
    }
    if (!Number.isInteger(stake) || stake <= 0) {
      setError(t("highlow.error.stake"));
      void sound.play("ui_error");
      return;
    }
    if (stake > localBalance) {
      setError(t("highlow.error.insufficient"));
      void sound.play("ui_error");
      return;
    }

    const key = reuseKey ?? idempotencyKey ?? newIdempotencyKey();
    setIdempotencyKey(key);
    setLocked(true);
    setRevealing(true);
    setError(null);
    setReceipt(null);
    void sound.play("bet_lock");
    void sound.play("dice_roll");

    saveHighLowSession({ idempotencyKey: key, pending: true, receipt: null });
    setSessionPending(true);

    startSubmit(async () => {
      const result = await placeBetAction({
        gameId: HIGH_LOW_GAME_ID,
        stake,
        selection,
        idempotencyKey: key,
      });

      if (!result.ok) {
        setError(result.message);
        setLocked(false);
        setRevealing(false);
        setSessionPending(false);
        clearHighLowPending();
        void sound.play("ui_error");
        return;
      }

      const payload = result.data as Record<string, unknown> | undefined;
      const view =
        parseReplayReceipt(payload, selection) ??
        parsePlaceBetPayload(payload, selection);

      if (!view) {
        setError(t("highlow.error.unexpected"));
        setLocked(false);
        setRevealing(false);
        setSessionPending(false);
        clearHighLowPending();
        return;
      }

      const revealDelay = reducedMotion || renderer === "2d" ? 200 : 1100;
      window.setTimeout(() => {
        startTransition(() => {
          setReceipt(view);
          setRevealing(false);
          setLocked(false);
          setSessionPending(false);
          setOptimisticBalance(view.balanceAfter);
          setIdempotencyKey(newIdempotencyKey());
          saveHighLowSession({
            idempotencyKey: key,
            pending: false,
            receipt: view,
          });
          void sound.play(view.isWin ? "payout" : "ui_error");
        });
      }, revealDelay);
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← {t("common.back")}
          </Link>
          {" · "}
          <Link
            href="/guide#high-low"
            className="underline-offset-4 hover:underline"
          >
            {t("highlow.guideLink")}
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)] md:text-4xl">
          {t("highlow.name")}
        </h1>
        <p className="text-[var(--brand-muted)]">{t("highlow.tagline")}</p>
        <p className="text-sm font-medium">
          {t("highlow.balance", { amount: formatGik(localBalance) })}
        </p>
        <p className="text-xs text-[var(--brand-muted)]">
          {t("highlow.configVersion", { version: HIGH_LOW_CONFIG.version })} ·{" "}
          {renderer.toUpperCase()} · {graphicsQuality}
          {reducedMotion ? ` · ${t("highlow.reducedMotion")}` : ""}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("highlow.side")}</h2>
        <SidePicker
          side={side}
          disabled={locked || pending}
          onChange={(next) => {
            void sound.play("ui_click");
            setSide(next);
            setError(null);
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("highlow.stake")}</h2>
        <div className="flex flex-wrap gap-2">
          {HIGH_LOW_CONFIG.quickStakes.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={stake === value ? "default" : "outline"}
              disabled={locked || pending}
              onClick={() => {
                void sound.play("ui_click");
                setStake(value);
              }}
            >
              {value.toLocaleString()}
            </Button>
          ))}
        </div>
        <label className="block text-sm">
          {t("highlow.stakeManual")}
          <Input
            type="number"
            min={HIGH_LOW_CONFIG.minStake}
            max={HIGH_LOW_CONFIG.maxStake}
            step={1}
            value={stake}
            disabled={locked || pending}
            onChange={(event) => setStake(Number(event.target.value))}
            className="mt-1 max-w-xs"
          />
        </label>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          disabled={locked || pending}
          onClick={() => void submitBet()}
        >
          {pending || locked ? t("highlow.locking") : t("highlow.placeBet")}
        </Button>
        {sessionPending && idempotencyKey ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void submitBet(idempotencyKey)}
          >
            {t("highlow.resume")}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-[var(--status-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {(revealing || receipt) && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-semibold">
            {t("highlow.reveal")}
          </h2>
          {receipt && renderer === "3d" ? (
            <DiceReveal3D
              dice={receipt.result.dice}
              reducedMotion={reducedMotion}
              quality={graphicsQuality}
            />
          ) : (
            <DiceReveal2D
              dice={receipt?.result.dice ?? null}
              total={receipt?.result.total}
              isTriple={receipt?.result.isTriple}
              revealing={revealing}
            />
          )}
          {receipt && renderer === "3d" ? (
            <DiceReveal2D
              dice={receipt.result.dice}
              total={receipt.result.total}
              isTriple={receipt.result.isTriple}
            />
          ) : null}
        </section>
      )}

      {receipt ? <HighLowReceiptPanel receipt={receipt} /> : null}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">
          {t("highlow.historyTitle")}
        </h2>
        <HighLowHistoryList rows={history} />
      </section>
    </div>
  );
}
