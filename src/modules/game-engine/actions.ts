"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireSameOrigin } from "@/lib/security";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { ActionResult } from "@/modules/player/auth-shared";

import {
  GAME_BET_RATE_LIMIT,
  checkRateLimit,
  getGameDefinition,
  isGameId,
  validateBetRequest,
  type GameId,
  type SettlementMode,
} from "@/modules/game-engine";

function asMessage(error: { message: string } | null): string {
  return error?.message ?? "Unexpected error";
}

async function assertMutatingOrigin() {
  requireSameOrigin(
    { headers: await headers() },
    { allowMissingInDev: true },
  );
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
  mode?: SettlementMode;
  controlledResult?: Record<string, unknown> | null;
}): Promise<ActionResult> {
  try {
    await assertMutatingOrigin();
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Origin check failed.",
    };
  }

  if (!isGameId(input.gameId)) {
    return { ok: false, message: "Unknown game." };
  }
  const gameId: GameId = input.gameId;

  const definition = getGameDefinition(gameId);
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, message: "Sign in required." };
  }

  const { error: pauseError } = await supabase.rpc("assert_play_allowed");
  if (pauseError) {
    return { ok: false, message: asMessage(pauseError) };
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

  const mode: SettlementMode = input.mode ?? "random";
  const { data, error } = await supabase.rpc("place_and_settle_bet", {
    p_game_key: gameId,
    p_idempotency_key: input.idempotencyKey,
    p_stake: input.stake,
    p_selection: input.selection as Json,
    p_mode: mode,
    p_controlled_result:
      mode === "controlled_demo"
        ? ((input.controlledResult ?? null) as Json | null)
        : null,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  // Mission/achievement progress is applied inside place_and_settle_bet
  // (apply_settled_bet_engagement). Clients must not call those RPCs.

  revalidatePath("/home");
  revalidatePath("/credits");
  revalidatePath("/ledger");
  revalidatePath("/missions");
  revalidatePath("/achievements");
  revalidatePath(`/play/${gameId}`);

  return {
    ok: true,
    message: "Bet settled.",
    data: data as Record<string, unknown>,
  };
}

export async function openGameRoundAction(
  formData: FormData,
): Promise<ActionResult> {
  await assertMutatingOrigin();
  const gameKey = String(formData.get("gameId") ?? "");
  const mode = String(formData.get("settlementMode") ?? "random") as SettlementMode;
  const payloadRaw = String(formData.get("controlledPayload") ?? "").trim();

  if (!isGameId(gameKey)) {
    return { ok: false, message: "Select a game." };
  }
  if (mode !== "random" && mode !== "controlled_demo") {
    return { ok: false, message: "Invalid settlement mode." };
  }

  let controlledPayload: Record<string, unknown> | null = null;
  if (mode === "controlled_demo") {
    if (!payloadRaw) {
      return {
        ok: false,
        message: "Controlled demo payload required before the round begins.",
      };
    }
    try {
      controlledPayload = JSON.parse(payloadRaw) as Record<string, unknown>;
    } catch {
      return { ok: false, message: "Controlled payload must be valid JSON." };
    }
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("open_game_round", {
    p_game_key: gameKey,
    p_mode: mode,
    p_controlled_result: controlledPayload as Json | null,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin/games");
  return {
    ok: true,
    message: `Opened ${mode} round for ${gameKey}.`,
    data: data as Record<string, unknown>,
  };
}

export async function startSmoothCloseAction(
  formData: FormData,
): Promise<ActionResult> {
  await assertMutatingOrigin();
  const gameKey = String(formData.get("gameId") ?? "");
  if (!isGameId(gameKey)) {
    return { ok: false, message: "Select a game." };
  }

  const message = String(formData.get("message") ?? "").trim();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("start_smooth_maintenance_close", {
    p_game_key: gameKey,
    p_message: message || "Game entering maintenance. New bets are closed.",
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin/games");
  revalidatePath("/home");
  return {
    ok: true,
    message: `Smooth maintenance close started for ${gameKey}.`,
  };
}

export async function setGameAvailabilityAction(
  formData: FormData,
): Promise<ActionResult> {
  await assertMutatingOrigin();
  const gameKey = String(formData.get("gameId") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";
  const message = String(formData.get("message") ?? "").trim();

  if (!isGameId(gameKey)) {
    return { ok: false, message: "Select a game." };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("set_game_availability", {
    p_game_key: gameKey,
    p_enabled: enabled,
    p_message: message || null,
  });

  if (error) {
    return { ok: false, message: asMessage(error) };
  }

  revalidatePath("/admin/games");
  revalidatePath("/home");
  return {
    ok: true,
    message: `${gameKey} is now ${enabled ? "enabled" : "disabled"}.`,
  };
}
