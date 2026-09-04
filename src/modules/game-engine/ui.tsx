"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/modules/player/auth-shared";

import {
  openGameRoundAction,
  setGameAvailabilityAction,
  startSmoothCloseAction,
} from "./actions";
import { listGameDefinitions, type GameId } from "./index";

function ResultBanner({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={
        result.ok
          ? "text-sm text-[var(--brand-accent)]"
          : "text-sm text-red-400"
      }
      role="status"
    >
      {result.message}
    </p>
  );
}

export function AdminGameControls() {
  const games = listGameDefinitions();
  const [gameId, setGameId] = useState<GameId>("fish-prawn-crab");
  const [mode, setMode] = useState<"random" | "controlled_demo">("random");
  const [payload, setPayload] = useState(
    '{"dice":["fish","prawn","crab"]}',
  );
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function defaultPayload(id: GameId): string {
    if (id === "high-low") return '{"dice":[1,2,3]}';
    if (id === "spinning-plate") return '{"landedSlot":12}';
    return '{"dice":["fish","prawn","crab"]}';
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          Game
          <select
            className="ml-2 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-2 py-1"
            value={gameId}
            onChange={(event) => {
              const next = event.target.value as GameId;
              setGameId(next);
              setPayload(defaultPayload(next));
            }}
          >
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          startTransition(async () => {
            setResult(await openGameRoundAction(formData));
          });
        }}
      >
        <input type="hidden" name="gameId" value={gameId} />
        <fieldset className="space-y-2">
          <legend className="font-medium">Open next round</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="settlementMode"
              value="random"
              checked={mode === "random"}
              onChange={() => setMode("random")}
            />
            Random (default)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="settlementMode"
              value="controlled_demo"
              checked={mode === "controlled_demo"}
              onChange={() => setMode("controlled_demo")}
            />
            Controlled Demo (must be set before round begins)
          </label>
          {mode === "controlled_demo" ? (
            <Input
              name="controlledPayload"
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              aria-label="Controlled demo JSON payload"
            />
          ) : (
            <input type="hidden" name="controlledPayload" value="" />
          )}
        </fieldset>
        <Button type="submit" disabled={pending}>
          Open round
        </Button>
      </form>

      <div className="flex flex-wrap gap-3">
        <form
          action={(formData) => {
            startTransition(async () => {
              setResult(await setGameAvailabilityAction(formData));
            });
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="enabled" value="true" />
          <input type="hidden" name="lifecycle" value="live" />
          <Button type="submit" variant="secondary" disabled={pending}>
            Enable / live
          </Button>
        </form>
        <form
          action={(formData) => {
            startTransition(async () => {
              setResult(await setGameAvailabilityAction(formData));
            });
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <input type="hidden" name="enabled" value="false" />
          <input type="hidden" name="lifecycle" value="disabled" />
          <Button type="submit" variant="outline" disabled={pending}>
            Disable
          </Button>
        </form>
        <form
          action={(formData) => {
            startTransition(async () => {
              setResult(await startSmoothCloseAction(formData));
            });
          }}
        >
          <input type="hidden" name="gameId" value={gameId} />
          <Button type="submit" variant="ghost" disabled={pending}>
            Smooth maintenance close
          </Button>
        </form>
      </div>

      <ResultBanner result={result} />
    </div>
  );
}
