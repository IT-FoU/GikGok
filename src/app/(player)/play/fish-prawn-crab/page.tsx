import Link from "next/link";
import { redirect } from "next/navigation";

import { FpcGameClient } from "@/modules/games/fish-prawn-crab/fpc-game";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function FishPrawnCrabPage() {
  let balance = 0;
  let graphicsMode: "auto" | "2d" | "3d" = "auto";
  let history: Array<{
    id: string;
    stake: number;
    is_win: boolean;
    payout_amount: number;
    total_return_multiplier: number;
    settlement_mode: string;
    created_at: string;
    selection: { kind?: string; symbols?: string[] };
    result_payload: { dice?: string[] };
  }> = [];

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    const [{ data: balanceRow }, { data: settings }, { data: receipts }] =
      await Promise.all([
        supabase
          .from("player_balances")
          .select("balance")
          .eq("player_id", user.id)
          .maybeSingle(),
        supabase
          .from("user_settings")
          .select("graphics_mode")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase
          .from("bet_receipts")
          .select(
            "id, stake, is_win, payout_amount, total_return_multiplier, settlement_mode, created_at, selection, result_payload",
          )
          .eq("player_id", user.id)
          .eq("game_id", "fish-prawn-crab")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    balance = balanceRow?.balance ?? 0;
    graphicsMode = (settings?.graphics_mode as "auto" | "2d" | "3d") ?? "auto";
    history = (receipts ?? []).map((row) => ({
      id: row.id,
      stake: row.stake,
      is_win: row.is_win,
      payout_amount: row.payout_amount,
      total_return_multiplier: row.total_return_multiplier,
      settlement_mode: row.settlement_mode,
      created_at: row.created_at,
      selection: (row.selection ?? {}) as {
        kind?: string;
        symbols?: string[];
      },
      result_payload: (row.result_payload ?? {}) as { dice?: string[] },
    }));
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
    <main className="flex flex-1 flex-col px-4 py-8 md:px-6">
      <FpcGameClient
        balance={balance}
        graphicsMode={graphicsMode}
        history={history}
      />
      <p className="mx-auto mt-8 max-w-3xl text-xs text-[var(--brand-muted)]">
        <Link href="/play/high-low" className="underline-offset-4 hover:underline">
          High–Low
        </Link>
        {" · "}
        <Link
          href="/play/spinning-plate"
          className="underline-offset-4 hover:underline"
        >
          Spinning Plate
        </Link>
      </p>
    </main>
  );
}
