"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  startTransition,
  useEffect,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { placeBetAction } from "@/modules/game-engine/actions";
import type { FpcSymbol } from "@/modules/game-engine";
import { useTranslations } from "@/modules/localization/provider";
import { useSound } from "@/modules/sound/sound-provider";

import {
  FPC_CONFIG,
  FPC_GAME_ID,
  type FpcReceiptView,
  type FpcSelection,
} from "./config";
import { DiceReveal2D, SymbolDie, SymbolPicker } from "./dice-2d";
import { FpcHistoryList, FpcReceiptPanel } from "./receipt";
import {
  buildFpcSelection,
  clearFpcPending,
  formatGik,
  loadFpcSession,
  newIdempotencyKey,
  parsePlaceBetPayload,
  parseReplayReceipt,
  resolveGraphicsMode,
  saveFpcSession,
} from "./session";

function readInitialSession() {
  const session = loadFpcSession();
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
  selection: { kind?: string; symbols?: string[] };
  result_payload: { dice?: string[] };
};

export function FpcGameClient({
  balance,
  graphicsMode = "auto",
  history,
}: {
  balance: number;
  graphicsMode?: "auto" | "2d" | "3d";
  history: HistoryRow[];
}) {
  const t = useTranslations();
  const sound = useSound();
  const [initialSession] = useState(readInitialSession);
  const [initialReduced] = useState(readPrefersReducedMotion);
  const [kind, setKind] = useState<"single_symbol" | "special_pair">(
    "single_symbol",
  );
  const [selected, setSelected] = useState<FpcSymbol[]>(["fish"]);
  const [stake, setStake] = useState<number>(FPC_CONFIG.quickStakes[0]);
  const [locked, setLocked] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<FpcReceiptView | null>(
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
    resolveGraphicsMode(graphicsMode, initialReduced),
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
        setRenderer(resolveGraphicsMode(graphicsMode, media.matches));
      });
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [graphicsMode]);

  function toggleSymbol(symbol: FpcSymbol) {
    if (locked || pending) return;
    void sound.play("ui_click");
    setError(null);
    setSelected((current) => {
      if (kind === "single_symbol") {
        return [symbol];
      }
      if (current.includes(symbol)) {
        return current.filter((item) => item !== symbol);
      }
      if (current.length >= 2) {
        return [current[1]!, symbol];
      }
      return [...current, symbol];
    });
  }

  function currentSelection(): FpcSelection | null {
    const primary = selected[0];
    if (!primary) return null;
    const built = buildFpcSelection(kind, primary, selected[1] ?? primary);
    if ("error" in built) {
      setError(t("fpc.error.pairDistinct"));
      return null;
    }
    return built;
  }

  async function submitBet(reuseKey?: string) {
    const selection = currentSelection();
    if (!selection) {
      void sound.play("ui_error");
      return;
    }
    if (!Number.isInteger(stake) || stake <= 0) {
      setError(t("fpc.error.stake"));
      void sound.play("ui_error");
      return;
    }
    if (stake > localBalance) {
      setError(t("fpc.error.insufficient"));
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

    saveFpcSession({
      idempotencyKey: key,
      pending: true,
      receipt: null,
    });
    setSessionPending(true);

    startSubmit(async () => {
      const result = await placeBetAction({
        gameId: FPC_GAME_ID,
        stake,
        selection,
        idempotencyKey: key,
      });

      if (!result.ok) {
        setError(result.message);
        setLocked(false);
        setRevealing(false);
        setSessionPending(false);
        clearFpcPending();
        void sound.play("ui_error");
        return;
      }

      const payload = result.data as Record<string, unknown> | undefined;
      const view =
        parseReplayReceipt(payload, selection) ??
        parsePlaceBetPayload(payload, selection);

      if (!view) {
        setError(t("fpc.error.unexpected"));
        setLocked(false);
        setRevealing(false);
        setSessionPending(false);
        clearFpcPending();
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
          saveFpcSession({
            idempotencyKey: key,
            pending: false,
            receipt: view,
          });
          void sound.play(view.isWin ? "payout" : "ui_error");
        });
      }, revealDelay);
    });
  }

  const maxSelectable = kind === "single_symbol" ? 1 : 2;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <header className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← {t("common.back")}
          </Link>
          {" · "}
          <Link href="/guide#fpc" className="underline-offset-4 hover:underline">
            {t("fpc.guideLink")}
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)] md:text-4xl">
          {t("fpc.name")}
        </h1>
        <p className="text-[var(--brand-muted)]">{t("fpc.tagline")}</p>
        <p className="text-sm font-medium">
          {t("fpc.balance", { amount: formatGik(localBalance) })}
        </p>
        <p className="text-xs text-[var(--brand-muted)]">
          {t("fpc.configVersion", { version: FPC_CONFIG.version })} ·{" "}
          {renderer.toUpperCase()}
          {reducedMotion ? ` · ${t("fpc.reducedMotion")}` : ""}
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="font-display text-lg font-semibold">{t("fpc.betType")}</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={kind === "single_symbol" ? "default" : "outline"}
            disabled={locked || pending}
            onClick={() => {
              void sound.play("ui_click");
              setKind("single_symbol");
              setSelected((current) => (current[0] ? [current[0]] : ["fish"]));
            }}
          >
            {t("fpc.kind.single")} (x{FPC_CONFIG.singleSymbolMultiplier})
          </Button>
          <Button
            type="button"
            variant={kind === "special_pair" ? "default" : "outline"}
            disabled={locked || pending}
            onClick={() => {
              void sound.play("ui_click");
              setKind("special_pair");
              setSelected((current) =>
                current.length >= 2
                  ? [current[0]!, current[1]!]
                  : [current[0] ?? "fish", "prawn"],
              );
            }}
          >
            {t("fpc.kind.pair")} (x{FPC_CONFIG.specialPairMultiplier})
          </Button>
        </div>
        <p className="text-sm text-[var(--brand-muted)]">
          {kind === "single_symbol"
            ? t("fpc.kind.singleHelp")
            : t("fpc.kind.pairHelp")}
        </p>
        <SymbolPicker
          selected={selected.slice(0, maxSelectable)}
          disabled={locked || pending}
          multi={kind === "special_pair"}
          onToggle={toggleSymbol}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">{t("fpc.stake")}</h2>
        <div className="flex flex-wrap gap-2">
          {FPC_CONFIG.quickStakes.map((value) => (
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
          {t("fpc.stakeManual")}
          <Input
            type="number"
            min={FPC_CONFIG.minStake}
            max={FPC_CONFIG.maxStake}
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
          {pending || locked ? t("fpc.locking") : t("fpc.placeBet")}
        </Button>
        {sessionPending && idempotencyKey ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => void submitBet(idempotencyKey)}
          >
            {t("fpc.resume")}
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
            {t("fpc.reveal")}
          </h2>
          {receipt && renderer === "3d" ? (
            <DiceReveal3D
              dice={receipt.result.dice}
              reducedMotion={reducedMotion}
            />
          ) : (
            <DiceReveal2D
              dice={receipt?.result.dice ?? null}
              revealing={revealing}
            />
          )}
          {receipt ? (
            <div className="flex flex-wrap gap-2">
              {receipt.selection.symbols.map((symbol) => (
                <SymbolDie key={symbol} symbol={symbol} size="sm" highlighted />
              ))}
            </div>
          ) : null}
        </section>
      )}

      {receipt ? <FpcReceiptPanel receipt={receipt} /> : null}

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">
          {t("fpc.historyTitle")}
        </h2>
        <FpcHistoryList rows={history} />
      </section>
    </div>
  );
}
