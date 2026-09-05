import Link from "next/link";

import { FpcGameClient } from "@/modules/games/fish-prawn-crab/fpc-game";
import { loadPlayPageContext } from "@/modules/games/load-play-context";

export const dynamic = "force-dynamic";

export default async function FishPrawnCrabPlayPage() {
  const ctx = await loadPlayPageContext("fish_prawn_crab");

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
        <FpcGameClient
          balance={ctx.balance}
          graphicsMode={ctx.graphicsMode}
          history={ctx.history.map((row) => ({
            id: row.id,
            stake: row.stake,
            is_win: row.is_win,
            payout_amount: row.payout_amount,
            total_return_multiplier: row.total_return_multiplier,
            settlement_mode: row.settlement_mode,
            created_at: row.created_at,
            selection: row.selection as { kind?: string; symbols?: string[] },
            result_payload: row.result_payload as { dice?: string[] },
          }))}
        />
      ) : null}

      <p className="mx-auto mt-8 max-w-3xl text-xs text-[var(--brand-muted)]">
        <Link href="/play/high_low" className="underline-offset-4 hover:underline">
          High–Low
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
