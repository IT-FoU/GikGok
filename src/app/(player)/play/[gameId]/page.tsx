import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EngineBetForm } from "@/modules/game-engine/bet-form";
import {
  getGameDefinition,
  type GameId,
} from "@/modules/game-engine";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const GAME_IDS: GameId[] = ["fish-prawn-crab", "high-low", "spinning-plate"];

export default async function PlayGamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId: raw } = await params;
  if (!GAME_IDS.includes(raw as GameId)) {
    notFound();
  }
  const gameId = raw as GameId;
  const definition = getGameDefinition(gameId);

  let balance = 0;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      redirect("/login");
    }
    const { data: balanceRow } = await supabase
      .from("player_balances")
      .select("balance")
      .eq("player_id", user.id)
      .maybeSingle();
    balance = balanceRow?.balance ?? 0;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← Home
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          {gameId}
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Engine stub for {definition.displayNameKey}. Full game UIs arrive in
          later phases. Settlement is server-only.
        </p>
      </div>
      <EngineBetForm gameId={gameId} balance={balance} />
    </main>
  );
}
