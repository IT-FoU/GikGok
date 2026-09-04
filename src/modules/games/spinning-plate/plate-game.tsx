"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { startTransition, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { placeBetAction } from "@/modules/game-engine/actions";
import { useTranslations } from "@/modules/localization/provider";
import { useSound } from "@/modules/sound/sound-provider";

import {
  PLATE_CONFIG,
  PLATE_GAME_ID,
  type PlateReceiptView,
} from "./config";
import { PlateHistoryList, PlateReceiptPanel } from "./receipt";
import {
  buildPlateSelection,
  clearPlatePending,
  formatGik,
  loadPlateSession,
  newIdempotencyKey,
  parsePlaceBetPayload,
  parseReplayReceipt,
  resolveGraphicsMode,
  savePlateSession,
  watchLowFps,
} from "./session";
import { PlateWheel2D } from "./wheel-2d";

function readInitialSession() {
  const session = loadPlateSession();
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

const PlateReveal3D = dynamic(
  () => import("./wheel-3d").then((mod) => mod.PlateReveal3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-[var(--radius-xl)] border border-[var(--brand-border)] text-sm text-[var(--brand-muted)]">
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
  selection: { slot?: number };
  result_payload: { selectedSlot?: number; landedSlot?: number };
};

export function PlateGameClient({
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
  const [slot, setSlot] = useState(1);
  const [stake, setStake] = useState<number>(PLATE_CONFIG.quickStakes[0]);
  const [locked, setLocked] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PlateReceiptView | null>(
    initialSession.receipt,
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(
    initialSession.idempotencyKey,
  );
  const [sessionPending, setSessionPending] = useState(
    initialSession.sessionPending,
  );
  const [reducedMotion, setReducedMotion] = useState(initialReduced);
  const [force2d, setForce2d] = useState(false);
  const renderer = resolveGraphicsMode(
    graphicsMode,
    reducedMotion,
    graphicsQuality,
    force2d,
  );
  const [pending, startSubmit] = useTransition();
  const [optimisticBalance, setOptimisticBalance] = useState<number | null>(
    null,
  );
  const localBalance = optimisticBalance ?? balance;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      startTransition(() => setReducedMotion(media.matches));
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (renderer !== "3d" || reducedMotion) return;
    return watchLowFps(() => {
      startTransition(() => setForce2d(true));
    });
  }, [renderer, reducedMotion]);

  async function submitBet(reuseKey?: string) {
    const selection = buildPlateSelection(slot);
    if ("error" in selection) {
      setError(t("plate.error.slot"));
      void sound.play("ui_error");
      return;
    }
    if (!Number.isInteger(stake) || stake <= 0) {
      setError(t("plate.error.stake"));
      void sound.play("ui_error");
      return;
    }
    if (stake > localBalance) {
      setError(t("plate.error.insufficient"));
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

    savePlateSession({ idempotencyKey: key, pending: true, receipt: null });
    setSessionPending(true);

    startSubmit(async () => {
      const result = await placeBetAction({
        gameId: PLATE_GAME_ID,
        stake,
        selection,
        idempotencyKey: key,
      });

      if (!result.ok) {
        setError(result.message);
        setLocked(false);
        setRevealing(false);
        setSessionPending(false);
        clearPlatePending();
        void sound.play("ui_error");
        return;
      }

      const payload = result.data as Record<string, unknown> | undefined;
      const view =
        parseReplayReceipt(payload, selection) ??
        parsePlaceBetPayload(payload, selection);

      if (!view) {
        setError(t("plate.error.unexpected"));
        setLocked(false);
        setRevealing(false);
        setSessionPending(false);
        clearPlatePending();
        return;
      }

      const revealDelay = reducedMotion || renderer === "2d" ? 250 : 1450;
      window.setTimeout(() => {
        startTransition(() => {
          setReceipt(view);
          setRevealing(false);
          setLocked(false);
          setSessionPending(false);
          setOptimisticBalance(view.balanceAfter);
          setIdempotencyKey(newIdempotencyKey());
          savePlateSession({
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
            href="/guide#spinning-plate"
            className="underline-offset-4 hover:underline"
          >
            {t("plate.guideLink")}
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)] md:text-4xl">
          {t("plate.name")}
        </h1>
        <p className="text-[var(--brand-muted)]">{t("plate.tagline")}</p>
        <p className="text-sm font-medium">
          {t("plate.balance", { amount: formatGik(localBalance) })}
        </p>
        <p className="text-xs text-[var(--brand-muted)]">
          {t("plate.configVersion", { version: PLATE_CONFIG.version })} ·{" "}
          {renderer.toUpperCase()} · {graphicsQuality}
          {reducedMotion ? ` · ${t("plate.reducedMotion")}` : ""}
          {force2d ? ` · ${t("plate.fpsFallback")}` : ""}
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">
          {t("plate.selectSlot")}
        </h2>
        <PlateWheel2D
          selectedSlot={slot}
          landedSlot={receipt?.result.landedSlot ?? null}
          spinning={revealing && !receipt}
          locked={locked || pending}
          onSelect={(next) => {
            void sound.play("ui_click");
            setSlot(next);
            setError(null);
          }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("plate.stake")}</h2>
        <div className="flex flex-wrap gap-2">
          {PLATE_CONFIG.quickStakes.map((value) => (
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
          {t("plate.stakeManual")}
          <Input
            type="number"
            min={PLATE_CONFIG.minStake}
            max={PLATE_CONFIG.maxStake}
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
          {pending || locked ? t("plate.locking") : t("plate.placeBet")}
        </Button>
        {sessionPending && idempotencyKey ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void submitBet(idempotencyKey)}
          >
            {t("plate.resume")}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-[var(--status-danger)]" role="alert">
          {error}
        </p>
      ) : null}

      {receipt && renderer === "3d" ? (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold">{t("plate.reveal")}</h2>
          <PlateReveal3D
            landedSlot={receipt.result.landedSlot}
            reducedMotion={reducedMotion}
            quality={graphicsQuality}
            onFpsSample={(fps) => {
              if (fps < 28) {
                startTransition(() => setForce2d(true));
              }
            }}
          />
          <p className="text-sm text-[var(--brand-muted)]">
            {t("plate.a11yResult", {
              selected: receipt.result.selectedSlot,
              landed: receipt.result.landedSlot,
              multiplier: receipt.result.multiplier,
            })}
          </p>
        </section>
      ) : null}

      {receipt && renderer === "2d" ? (
        <p className="text-sm text-[var(--brand-muted)]" aria-live="polite">
          {t("plate.a11yResult", {
            selected: receipt.result.selectedSlot,
            landed: receipt.result.landedSlot,
            multiplier: receipt.result.multiplier,
          })}
        </p>
      ) : null}

      {receipt ? <PlateReceiptPanel receipt={receipt} /> : null}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">
          {t("plate.historyTitle")}
        </h2>
        <PlateHistoryList rows={history} />
      </section>
    </div>
  );
}
