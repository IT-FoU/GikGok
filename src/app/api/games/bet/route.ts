import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  GAME_BET_RATE_LIMIT,
  checkRateLimit,
  getGameDefinition,
  validateBetRequest,
  type GameId,
} from "@/modules/game-engine";

const GAME_IDS: GameId[] = ["fish-prawn-crab", "high-low", "spinning-plate"];

/**
 * POST /api/games/bet — server-authoritative place+settle.
 * Body never includes client-computed outcomes or payouts.
 */
export async function POST(request: Request) {
  let body: {
    gameId?: string;
    stake?: number;
    selection?: Record<string, unknown>;
    idempotencyKey?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gameId = GAME_IDS.includes(body.gameId as GameId)
    ? (body.gameId as GameId)
    : null;
  if (
    !gameId ||
    typeof body.stake !== "number" ||
    !body.selection ||
    !body.idempotencyKey
  ) {
    return NextResponse.json({ error: "Invalid bet payload" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rate = checkRateLimit({
    key: `api-bet:${user.id}:${gameId}`,
    limit: GAME_BET_RATE_LIMIT.limit,
    windowMs: GAME_BET_RATE_LIMIT.windowMs,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rate.retryAfterMs },
      { status: 429 },
    );
  }

  const definition = getGameDefinition(gameId);
  const { data: balanceRow } = await supabase
    .from("player_balances")
    .select("balance")
    .eq("player_id", user.id)
    .maybeSingle();

  const validation = validateBetRequest({
    gameId,
    stake: body.stake,
    balance: balanceRow?.balance ?? 0,
    selection: body.selection,
    idempotencyKey: body.idempotencyKey,
    minStake: definition.minStake,
    maxStake: definition.maxStake,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.message, code: validation.code },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc("place_and_settle_bet", {
    p_game_id: gameId,
    p_stake: body.stake,
    p_selection: body.selection as Json,
    p_idempotency_key: body.idempotencyKey,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, result: data });
}
