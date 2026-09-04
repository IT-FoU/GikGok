/**
 * Versioned Fish–Prawn–Crab configuration.
 * Must stay aligned with `game_versions` config for game_id = fish-prawn-crab.
 */

import {
  FPC_SYMBOLS,
  type FpcBetKind,
  type FpcSymbol,
} from "@/modules/game-engine";

export const FPC_GAME_ID = "fish-prawn-crab" as const;

export const FPC_CONFIG_VERSION = 1 as const;

export const FPC_CONFIG = {
  version: FPC_CONFIG_VERSION,
  gameId: FPC_GAME_ID,
  symbols: FPC_SYMBOLS,
  singleSymbolMultiplier: 2,
  specialPairMultiplier: 10,
  minStake: 500,
  maxStake: 100_000,
  quickStakes: [500, 1_000, 5_000, 10_000] as const,
  diceCount: 3 as const,
} as const;

export type FpcSelection =
  | { kind: "single_symbol"; symbols: [FpcSymbol] }
  | { kind: "special_pair"; symbols: [FpcSymbol, FpcSymbol] };

export type FpcServerResult = {
  game: "fish-prawn-crab";
  kind: FpcBetKind;
  symbols: FpcSymbol[];
  dice: [FpcSymbol, FpcSymbol, FpcSymbol];
};

export type FpcReceiptView = {
  betId: string;
  receiptId: string;
  stake: number;
  selection: FpcSelection;
  result: FpcServerResult;
  totalReturnMultiplier: number;
  payoutAmount: number;
  isWin: boolean;
  balanceAfter: number;
  settlementMode: "random" | "controlled_demo";
  gameVersionId: string;
  replay: boolean;
  createdAt: string;
};

export const FPC_SYMBOL_META: Record<
  FpcSymbol,
  { labelKey: string; color: string; glyph: string }
> = {
  fish: { labelKey: "fpc.symbol.fish", color: "#1f8a70", glyph: "Fi" },
  prawn: { labelKey: "fpc.symbol.prawn", color: "#d9684a", glyph: "Pr" },
  crab: { labelKey: "fpc.symbol.crab", color: "#c45c26", glyph: "Cr" },
  gourd: { labelKey: "fpc.symbol.gourd", color: "#c9a227", glyph: "Go" },
  rooster: { labelKey: "fpc.symbol.rooster", color: "#b33b3b", glyph: "Ro" },
  deer: { labelKey: "fpc.symbol.deer", color: "#8b5e3c", glyph: "De" },
};

export const FPC_SESSION_KEY = "gikgok.fpc.lastSession";

export type FpcSessionState = {
  idempotencyKey: string;
  pending: boolean;
  receipt: FpcReceiptView | null;
};
