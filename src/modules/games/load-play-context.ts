import { redirect } from "next/navigation";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { GameId } from "@/modules/game-engine";
import type { Json } from "@/lib/supabase/types";

export type PlayGraphicsMode = "auto" | "2d" | "3d";
export type PlayGraphicsQuality = "low" | "medium" | "high";

export type PlayHistoryRow = {
  id: string;
  stake: number;
  is_win: boolean;
  payout_amount: number;
  total_return_multiplier: number;
  settlement_mode: string;
  created_at: string;
  selection: Record<string, unknown>;
  result_payload: Record<string, unknown>;
};

export type PlayPageContext = {
  balance: number;
  verified: boolean;
  graphicsMode: PlayGraphicsMode;
  graphicsQuality: PlayGraphicsQuality;
  history: PlayHistoryRow[];
  guide: { en?: string; lo?: string } | null;
};

function asObject(value: Json | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function multiplierFrom(row: {
  stake: number;
  total_return: number;
  result: Record<string, unknown>;
}): number {
  if (typeof row.result.multiplier === "number") {
    return row.result.multiplier;
  }
  if (row.stake > 0 && row.total_return > 0) {
    return row.total_return / row.stake;
  }
  return 0;
}

/**
 * Loads balance, prefs, verification, and recent receipts for a play page.
 * Looks up game UUID by staging key (`fish_prawn_crab` | `high_low` | `spinning_plate`).
 */
export async function loadPlayPageContext(
  gameKey: GameId,
): Promise<PlayPageContext> {
  const empty: PlayPageContext = {
    balance: 0,
    verified: false,
    graphicsMode: "auto",
    graphicsQuality: "medium",
    history: [],
    guide: null,
  };

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect(`/login?next=/play/${gameKey}`);
    }

    const { data: gameRow } = await supabase
      .from("games")
      .select("id, active_version_id")
      .eq("key", gameKey)
      .maybeSingle();

    const [
      { data: balanceRow },
      { data: contacts },
      { data: settings },
      { data: versionRow },
      { data: receipts },
    ] = await Promise.all([
      supabase
        .from("player_balances")
        .select("balance")
        .eq("player_id", user.id)
        .maybeSingle(),
      supabase
        .from("player_contacts")
        .select("is_verified")
        .eq("player_id", user.id),
      supabase
        .from("player_settings")
        .select("graphics_mode, graphics_quality")
        .eq("player_id", user.id)
        .maybeSingle(),
      gameRow?.active_version_id
        ? supabase
            .from("game_versions")
            .select("config")
            .eq("id", gameRow.active_version_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      gameRow
        ? supabase
            .from("receipts")
            .select(
              "id, stake, is_win, total_return, mode, created_at, selection, result",
            )
            .eq("player_id", user.id)
            .eq("game_id", gameRow.id)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] }),
    ]);

    const config = asObject(versionRow?.config ?? null);
    const guideRaw = config.guide;
    const guide =
      guideRaw && typeof guideRaw === "object" && !Array.isArray(guideRaw)
        ? (guideRaw as { en?: string; lo?: string })
        : null;

    const history: PlayHistoryRow[] = (receipts ?? []).map((row) => {
      const result = asObject(row.result);
      const stake = row.stake;
      const payout = row.total_return;
      return {
        id: row.id,
        stake,
        is_win: row.is_win,
        payout_amount: payout,
        total_return_multiplier: multiplierFrom({
          stake,
          total_return: payout,
          result,
        }),
        settlement_mode: row.mode,
        created_at: row.created_at,
        selection: asObject(row.selection),
        result_payload: result,
      };
    });

    return {
      balance: balanceRow?.balance ?? 0,
      verified: Boolean(contacts?.some((row) => row.is_verified)),
      graphicsMode:
        (settings?.graphics_mode as PlayGraphicsMode | undefined) ?? "auto",
      graphicsQuality:
        (settings?.graphics_quality as PlayGraphicsQuality | undefined) ??
        "medium",
      history,
      guide,
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    return empty;
  }
}
