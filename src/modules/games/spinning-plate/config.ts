/**
 * Versioned Spinning Plate configuration.
 * Aligned with `game_versions` for game_id = spinning_plate.
 */

import {
  SPINNING_PLATE_ICONS,
  SPINNING_PLATE_MULTIPLIERS,
} from "@/modules/game-engine";

export const PLATE_GAME_ID = "spinning_plate" as const;
export const PLATE_CONFIG_VERSION = 1 as const;

export const PLATE_SLOT_COUNT = 12 as const;

export const PLATE_CONFIG = {
  version: PLATE_CONFIG_VERSION,
  gameId: PLATE_GAME_ID,
  slotCount: PLATE_SLOT_COUNT,
  multipliers: SPINNING_PLATE_MULTIPLIERS,
  icons: SPINNING_PLATE_ICONS,
  minStake: 500,
  maxStake: 1_000_000,
  quickStakes: [500, 1_000, 5_000, 10_000] as const,
  /** Degrees per slot; slot 1 centered under the fixed top pointer at rest. */
  degreesPerSlot: 360 / PLATE_SLOT_COUNT,
} as const;

export type PlateSelection = { slot: number };

export type PlateServerResult = {
  game: "spinning_plate";
  selectedSlot: number;
  landedSlot: number;
  multiplier: number;
};

export type PlateReceiptView = {
  betId: string;
  receiptId: string;
  stake: number;
  selection: PlateSelection;
  result: PlateServerResult;
  totalReturnMultiplier: number;
  payoutAmount: number;
  isWin: boolean;
  balanceAfter: number;
  settlementMode: "random" | "controlled_demo";
  gameVersionId: string;
  replay: boolean;
  createdAt: string;
};

export const PLATE_SESSION_KEY = "gikgok.plate.lastSession";

export type PlateSessionState = {
  idempotencyKey: string;
  pending: boolean;
  receipt: PlateReceiptView | null;
};

export function slotIcon(slot: number): string {
  return PLATE_CONFIG.icons[slot - 1] ?? `Slot ${slot}`;
}

export function slotMultiplier(slot: number): number {
  return PLATE_CONFIG.multipliers[slot] ?? 0;
}

/** Wheel rotation (deg) so `slot` sits under the fixed top pointer. */
export function rotationForSlot(slot: number): number {
  const index = ((slot - 1) % PLATE_SLOT_COUNT + PLATE_SLOT_COUNT) % PLATE_SLOT_COUNT;
  const degrees = -index * PLATE_CONFIG.degreesPerSlot;
  return Object.is(degrees, -0) ? 0 : degrees;
}

export function assertConfigAligned() {
  const expected: Record<number, number> = {
    1: 2,
    2: 2,
    3: 2,
    4: 2,
    5: 3,
    6: 3,
    7: 3,
    8: 4,
    9: 4,
    10: 5,
    11: 7,
    12: 10,
  };
  return (
    PLATE_CONFIG.icons.length === 12 &&
    Object.entries(expected).every(
      ([slot, mult]) => PLATE_CONFIG.multipliers[Number(slot)] === mult,
    )
  );
}
