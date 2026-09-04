/**
 * Game engine contracts.
 * Browser renderers reveal server-authoritative results only — never compute outcomes.
 */

export type GameId = "fish-prawn-crab" | "high-low" | "spinning-plate";

export type SettlementMode = "random" | "controlled_demo";

export type GameLifecycleStatus =
  | "draft"
  | "qa"
  | "owner_approved"
  | "scheduled"
  | "live"
  | "disabled";

export type FpcSymbol =
  | "fish"
  | "prawn"
  | "crab"
  | "gourd"
  | "rooster"
  | "deer";

export type FpcBetKind = "single_symbol" | "special_pair";

export type HighLowSide = "high" | "low";

export interface GameDefinition {
  id: GameId;
  displayNameKey: string;
  descriptionKey: string;
  guideKey: string;
  minStake: number;
  maxStake: number;
  quickStakes: number[];
  defaultConfigVersion: number;
}

export interface BetValidationInput {
  gameId: GameId;
  stake: number;
  balance: number;
  selection: unknown;
  idempotencyKey: string;
  minStake: number;
  maxStake: number;
}

export type BetValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export interface SettlementResult {
  resultPayload: Record<string, unknown>;
  totalReturnMultiplier: number;
  payoutAmount: number;
  isWin: boolean;
}

export interface PlaceBetRequest {
  gameId: GameId;
  stake: number;
  selection: Record<string, unknown>;
  idempotencyKey: string;
}

export const GAME_ENGINE_MODULE = "game-engine" as const;

export const FPC_SYMBOLS: readonly FpcSymbol[] = [
  "fish",
  "prawn",
  "crab",
  "gourd",
  "rooster",
  "deer",
] as const;

export const SPINNING_PLATE_MULTIPLIERS: Record<number, number> = {
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

export const SPINNING_PLATE_ICONS = [
  "Clover",
  "Diamond",
  "Heart",
  "Spade",
  "Bell",
  "Cherry",
  "Lucky Clover",
  "Star",
  "Lucky 7",
  "Crown",
  "Diamond King",
  "Jackpot",
] as const;
