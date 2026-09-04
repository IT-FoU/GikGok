/**
 * Versioned High–Low Dice configuration.
 * Aligned with `game_versions` for game_id = high-low.
 */

import type { HighLowSide } from "@/modules/game-engine";

export const HIGH_LOW_GAME_ID = "high-low" as const;
export const HIGH_LOW_CONFIG_VERSION = 1 as const;

export const HIGH_LOW_CONFIG = {
  version: HIGH_LOW_CONFIG_VERSION,
  gameId: HIGH_LOW_GAME_ID,
  lowRange: [3, 10] as const,
  highRange: [11, 18] as const,
  multiplier: 2,
  triplesLose: true,
  minStake: 500,
  maxStake: 100_000,
  quickStakes: [500, 1_000, 5_000, 10_000] as const,
  diceCount: 3 as const,
  dieFaces: 6 as const,
} as const;

export type HighLowSelection = { side: HighLowSide };

export type HighLowServerResult = {
  game: "high-low";
  side: HighLowSide;
  dice: [number, number, number];
  total: number;
  isTriple: boolean;
  actualSide: HighLowSide;
};

export type HighLowReceiptView = {
  betId: string;
  receiptId: string;
  stake: number;
  selection: HighLowSelection;
  result: HighLowServerResult;
  totalReturnMultiplier: number;
  payoutAmount: number;
  isWin: boolean;
  balanceAfter: number;
  settlementMode: "random" | "controlled_demo";
  gameVersionId: string;
  replay: boolean;
  createdAt: string;
};

export const HIGH_LOW_SESSION_KEY = "gikgok.highlow.lastSession";

export type HighLowSessionState = {
  idempotencyKey: string;
  pending: boolean;
  receipt: HighLowReceiptView | null;
};

export function classifyTotal(total: number): HighLowSide {
  return total <= HIGH_LOW_CONFIG.lowRange[1] ? "low" : "high";
}

export function isTripleDice(dice: [number, number, number]): boolean {
  return dice[0] === dice[1] && dice[1] === dice[2];
}
