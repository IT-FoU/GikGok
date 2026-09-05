import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EngineBetForm } from "@/modules/game-engine/bet-form";
import { getGameDefinition, isGameId } from "@/modules/game-engine";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DISPLAY_NAMES: Record<string, string> = {
  fish_prawn_crab: "Fish–Prawn–Crab",
  high_low: "High–Low Dice",
  spinning_plate: "Spinning Plate",
};

export default async function PlayGamePage({
  params,
}: {
  params: Promise<{ gameKey: string }>;
}) {
  const { gameKey } = await params;
  if (!isGameId(gameKey)) {
    notFound();
  }

  const definition = getGameDefinition(gameKey);
  let balance = 0;
  let verified = false;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(`/login?next=/play/${gameKey}`);
    }

    const [{ data: balanceRow }, { data: contacts }] = await Promise.all([
      supabase
        .from("player_balances")
        .select("balance")
        .eq("player_id", user.id)
        .maybeSingle(),
      supabase
        .from("player_contacts")
        .select("is_verified")
        .eq("player_id", user.id),
    ]);

    balance = balanceRow?.balance ?? 0;
    verified = Boolean(contacts?.some((row) => row.is_verified));
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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← Home
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-[var(--brand-accent)]">
          {DISPLAY_NAMES[gameKey] ?? gameKey}
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Min stake {definition.minStake.toLocaleString()} · Max{" "}
          {definition.maxStake.toLocaleString()} GIK · Server settlement only
        </p>
      </div>

      {!verified ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          Verify your contact before placing bets.{" "}
          <Link href="/verify" className="underline underline-offset-4">
            Verify now
          </Link>
        </p>
      ) : (
        <EngineBetForm gameId={gameKey} balance={balance} />
      )}
    </main>
  );
}
