"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { ActionResult } from "@/modules/player/auth-shared";

import {
  GAME_BET_RATE_LIMIT,
  checkRateLimit,
  getGameDefinition,
  validateBetRequest,
  type GameId,
  type SettlementMode,
} from "@/modules/game-engine";

const GAME_IDS: GameId[] = ["fish-prawn-crab", "high-low", "spinning-plate"];

function asMessage(error: { message: string } | null): string {
  return error?.message ?? "Unexpected error";
}

function parseGameId(value: string): GameId | null {
  return GAME_IDS.includes(value as GameId) ? (value as GameId) : null;
}

/**
 * Places a bet and settles it server-side via RPC.
 * Browser never computes outcomes, balances, or payouts.
 */
export async function placeBetAction(input: {
  gameId: string;
  stake: number;
  selection: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<ActionResult> {
  const gameId = parseGameId(input.gameId);
  if (!gameId) {
    return { ok: false, message: "Unknown game." };
  }

  const definition = getGameDefinition(gameId);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in required." };
  }

  const rate = checkRateLimit({
    key: `bet:${user.id}:${gameId}`,
    limit: GAME_BET_RATE_LIMIT.limit,
    windowMs: GAME_BET_RATE_LIMIT.windowMs,
  });
  if (!rate.allowed) {
    return {
      ok: false,
      message: `Rate limit exceeded. Retry in ${Math.ceil(rate.retryAfterMs / 1000)}s.`,
    };
  }

  const { data: balanceRow } = await supabase
    .from("player_balances")
    .select("balance")
    .eq("player_id", user.id)
    .maybeSingle();

  const validation = validateBetRequest({
    gameId,
    stake: input.stake,
    balance: balanceRow?.balance ?? 0,
    selection: input.selection,
    idempotencyKey: input.idempotencyKey,
    minStake: definition.minStake,
    maxStake: definition.maxStake,
  });

  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const { error: playError } = await supabase.rpc("assert_play_allowed");
  if (playError) {
    return { ok: false, message: asMessage(playError) };
  }

  const { data, error } = await supabase.rpc("place_and_settle_bet", {
    p_game_id: gameId,
    p_stake: input.stake,
    p_selection: input.selection as Json,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  const payload = (data ?? {}) as { replay?: boolean };
  if (!payload.replay) {
    try {
      await supabase.rpc("record_mission_progress", { p_game_id: gameId });
      await supabase.rpc("unlock_achievement", { p_code: "first_bet" });
    } catch {
      // Mission/achievement side effects must not fail the bet.
    }
  }

  revalidatePath("/home");
  revalidatePath("/credits");
  revalidatePath("/ledger");
  revalidatePath("/history");
  revalidatePath("/missions");
  revalidatePath("/achievements");
  revalidatePath(`/play/${gameId}`);

  return {
    ok: true,
    message: "Bet settled.",
    data: data as Record<string, unknown>,
  };
}

export async function openGameRoundAction(formData: FormData): Promise<ActionResult> {
  const gameId = parseGameId(String(formData.get("gameId") ?? ""));
  const mode = String(formData.get("settlementMode") ?? "random") as SettlementMode;
  const payloadRaw = String(formData.get("controlledPayload") ?? "").trim();

  if (!gameId) {
    return { ok: false, message: "Select a game." };
  }
  if (mode !== "random" && mode !== "controlled_demo") {
    return { ok: false, message: "Invalid settlement mode." };
  }

  let controlledPayload: Record<string, unknown> | null = null;
  if (mode === "controlled_demo") {
    if (!payloadRaw) {
      return { ok: false, message: "Controlled demo payload required before the round begins." };
    }
    try {
      controlledPayload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      return { ok: false, message: "Controlled payload must be valid JSON." };
    }
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("open_game_round", {
    p_game_id: gameId,
    p_settlement_mode: mode,
    p_controlled_demo_payload: controlledPayload as Json | null,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin/games");
  return {
    ok: true,
    message: `Opened ${mode} round for ${gameId}.`,
    data: data as Record<string, unknown>,
  };
}

export async function startSmoothCloseAction(formData: FormData): Promise<ActionResult> {
  const gameId = parseGameId(String(formData.get("gameId") ?? ""));
  if (!gameId) {
    return { ok: false, message: "Select a game." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("start_smooth_maintenance_close", {
    p_game_id: gameId,
    p_announcement_key: "games.maintenance",
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin/games");
  return { ok: true, message: `Smooth maintenance close started for ${gameId}.` };
}

export async function setGameAvailabilityAction(formData: FormData): Promise<ActionResult> {
  const gameId = parseGameId(String(formData.get("gameId") ?? ""));
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const lifecycle = String(formData.get("lifecycle") ?? "") || null;

  if (!gameId) {
    return { ok: false, message: "Select a game." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_game_availability", {
    p_game_id: gameId,
    p_enabled: enabled,
    p_lifecycle: lifecycle,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin/games");
  revalidatePath("/home");
  return {
    ok: true,
    message: `${gameId} is now ${enabled ? "enabled" : "disabled"}.`,
  };
}
