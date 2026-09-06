"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/modules/player/auth-shared";

import { placeBetAction } from "./actions";
import {
  FPC_SYMBOLS,
  getGameDefinition,
  type FpcSymbol,
  type GameId,
  type HighLowSide,
} from "./index";

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `bet-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function EngineBetForm({
  gameId,
  balance,
}: {
  gameId: GameId;
  balance: number;
}) {
  const definition = getGameDefinition(gameId);
  const stakeId = useId();
  const [stake, setStake] = useState(
    definition.quickStakes[0] ?? definition.minStake,
  );
  const [symbol, setSymbol] = useState<FpcSymbol>("fish");
  const [pairB, setPairB] = useState<FpcSymbol>("prawn");
  const [kind, setKind] = useState<"single_symbol" | "special_pair">(
    "single_symbol",
  );
  const [side, setSide] = useState<HighLowSide>("high");
  const [slot, setSlot] = useState(1);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function selection(): Record<string, unknown> {
    if (gameId === "fish_prawn_crab") {
      return {
        kind,
        symbols: kind === "single_symbol" ? [symbol] : [symbol, pairB],
      };
    }
    if (gameId === "high_low") {
      return { side };
    }
    return { slot };
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--brand-muted)]">
        Outcomes and payouts are computed only on the server. Balance:{" "}
        {balance.toLocaleString()} GIK (demo credits).
      </p>

      <div className="flex flex-wrap gap-2">
        {definition.quickStakes.map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={stake === value ? "default" : "outline"}
            onClick={() => setStake(value)}
          >
            {value.toLocaleString()}
          </Button>
        ))}
      </div>

      <label className="block text-sm" htmlFor={stakeId}>
        Stake
        <Input
          id={stakeId}
          type="number"
          min={definition.minStake}
          max={definition.maxStake}
          value={stake}
          onChange={(event) => setStake(Number(event.target.value))}
          className="mt-1"
        />
      </label>

      {gameId === "fish_prawn_crab" ? (
        <div className="space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={kind === "single_symbol"}
              onChange={() => setKind("single_symbol")}
            />
            Single Symbol (x2)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={kind === "special_pair"}
              onChange={() => setKind("special_pair")}
            />
            Special Pair (x10)
          </label>
          <select
            className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1"
            value={symbol}
            onChange={(event) => setSymbol(event.target.value as FpcSymbol)}
          >
            {FPC_SYMBOLS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          {kind === "special_pair" ? (
            <select
              className="ml-2 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1"
              value={pairB}
              onChange={(event) => setPairB(event.target.value as FpcSymbol)}
            >
              {FPC_SYMBOLS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}

      {gameId === "high_low" ? (
        <div className="flex gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={side === "high"}
              onChange={() => setSide("high")}
            />
            High
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={side === "low"}
              onChange={() => setSide("low")}
            />
            Low
          </label>
        </div>
      ) : null}

      {gameId === "spinning_plate" ? (
        <label className="block text-sm">
          Slot (1–12)
          <Input
            type="number"
            min={1}
            max={12}
            value={slot}
            onChange={(event) => setSlot(Number(event.target.value))}
            className="mt-1"
          />
        </label>
      ) : null}

      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setResult(
              await placeBetAction({
                gameId,
                stake,
                selection: selection(),
                idempotencyKey: newIdempotencyKey(),
              }),
            );
          });
        }}
      >
        Place & settle (server)
      </Button>

      {result ? (
        <pre className="overflow-x-auto rounded-md bg-[var(--brand-surface)] p-3 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}
