import Link from "next/link";

import { HighLowGameClient } from "@/modules/games/high-low/high-low-game";
import { loadPlayPageContext } from "@/modules/games/load-play-context";

export const dynamic = "force-dynamic";

export default async function HighLowPlayPage() {
  const ctx = await loadPlayPageContext("high_low");

  return (
    <main className="flex flex-1 flex-col px-4 py-8 md:px-6">
      {!ctx.verified ? (
        <p className="mx-auto mb-6 w-full max-w-3xl rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Verify your contact before placing bets.{" "}
          <Link href="/verify" className="underline underline-offset-4">
            Verify now
          </Link>
        </p>
      ) : null}

      {ctx.guide?.en || ctx.guide?.lo ? (
        <p className="mx-auto mb-4 w-full max-w-3xl text-sm text-[var(--brand-muted)]">
          {ctx.guide.en ?? ctx.guide.lo}
        </p>
      ) : null}

      {ctx.verified ? (
        <HighLowGameClient
          balance={ctx.balance}
          graphicsMode={ctx.graphicsMode}
          graphicsQuality={ctx.graphicsQuality}
          history={ctx.history.map((row) => ({
            id: row.id,
            stake: row.stake,
            is_win: row.is_win,
            payout_amount: row.payout_amount,
            total_return_multiplier: row.total_return_multiplier,
            settlement_mode: row.settlement_mode,
            created_at: row.created_at,
            selection: row.selection as { side?: string },
            result_payload: row.result_payload as {
              dice?: number[];
              total?: number;
              isTriple?: boolean;
            },
          }))}
        />
      ) : null}

      <p className="mx-auto mt-8 max-w-3xl text-xs text-[var(--brand-muted)]">
        <Link
          href="/play/fish_prawn_crab"
          className="underline-offset-4 hover:underline"
        >
          Fish–Prawn–Crab
        </Link>
        {" · "}
        <Link
          href="/play/spinning_plate"
          className="underline-offset-4 hover:underline"
        >
          Spinning Plate
        </Link>
        {" · "}
        Demo credits only — no real money.
      </p>
    </main>
  );
}
