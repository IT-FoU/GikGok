import type { FpcSymbol } from "@/modules/game-engine";

import {
  FPC_CONFIG,
  FPC_SESSION_KEY,
  type FpcReceiptView,
  type FpcSelection,
  type FpcServerResult,
  type FpcSessionState,
} from "./config";

export function buildFpcSelection(
  kind: "single_symbol" | "special_pair",
  primary: FpcSymbol,
  secondary: FpcSymbol,
): FpcSelection | { error: string } {
  if (kind === "single_symbol") {
    return { kind, symbols: [primary] };
  }
  if (primary === secondary) {
    return { error: "Special Pair symbols must be different" };
  }
  return { kind, symbols: [primary, secondary] };
}

export function parseFpcServerResult(value: unknown): FpcServerResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.game !== "fish_prawn_crab") return null;
  if (raw.kind !== "single_symbol" && raw.kind !== "special_pair") return null;
  if (!Array.isArray(raw.symbols) || !Array.isArray(raw.dice)) return null;
  if (raw.dice.length !== 3) return null;
  return {
    game: "fish_prawn_crab",
    kind: raw.kind,
    symbols: raw.symbols as FpcSymbol[],
    dice: raw.dice as [FpcSymbol, FpcSymbol, FpcSymbol],
  };
}

function settlementModeOf(
  row: Record<string, unknown>,
): "random" | "controlled_demo" {
  const mode = row.settlement_mode ?? row.mode;
  return mode === "controlled_demo" ? "controlled_demo" : "random";
}

function payoutFields(row: Record<string, unknown>, stake: number) {
  const payoutAmount = Number(row.payout_amount ?? row.total_return ?? 0);
  const totalReturnMultiplier = Number(
    row.total_return_multiplier ??
      (stake > 0 && payoutAmount > 0 ? payoutAmount / stake : 0),
  );
  return { payoutAmount, totalReturnMultiplier };
}

export function parsePlaceBetPayload(
  data: Record<string, unknown> | undefined,
  selection: FpcSelection,
): FpcReceiptView | null {
  if (!data) return null;
  const result = parseFpcServerResult(data.result);
  if (!result) return null;

  const stake = Number(data.stake ?? 0);
  const { payoutAmount, totalReturnMultiplier } = payoutFields(data, stake);

  return {
    betId: String(data.bet_id ?? ""),
    receiptId: String(data.receipt_id ?? ""),
    stake,
    selection,
    result,
    totalReturnMultiplier,
    payoutAmount,
    isWin: String(data.is_win) === "true" || data.is_win === true,
    balanceAfter: Number(data.balance_after ?? 0),
    settlementMode: settlementModeOf(data),
    gameVersionId: String(data.game_version_id ?? ""),
    replay: Boolean(data.replay),
    createdAt: new Date().toISOString(),
  };
}

/** When RPC returns a replay with nested receipt row (staging `receipts`). */
export function parseReplayReceipt(
  data: Record<string, unknown> | undefined,
  fallbackSelection: FpcSelection,
): FpcReceiptView | null {
  if (!data?.replay) return null;
  const receipt = data.receipt;
  if (!receipt || typeof receipt !== "object") {
    return parsePlaceBetPayload(data, fallbackSelection);
  }
  const row = receipt as Record<string, unknown>;
  const result = parseFpcServerResult(row.result_payload ?? row.result);
  if (!result) return null;
  const stake = Number(row.stake ?? 0);
  const { payoutAmount, totalReturnMultiplier } = payoutFields(row, stake);
  return {
    betId: String(data.bet_id ?? row.bet_id ?? ""),
    receiptId: String(row.id ?? ""),
    stake,
    selection: fallbackSelection,
    result,
    totalReturnMultiplier,
    payoutAmount,
    isWin: Boolean(row.is_win),
    balanceAfter: Number(row.balance_after ?? 0),
    settlementMode: settlementModeOf(row),
    gameVersionId: String(row.game_version_id ?? ""),
    replay: true,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fpc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadFpcSession(): FpcSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(FPC_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as FpcSessionState;
  } catch {
    return null;
  }
}

export function saveFpcSession(state: FpcSessionState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(FPC_SESSION_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function clearFpcPending() {
  const current = loadFpcSession();
  if (!current) return;
  saveFpcSession({ ...current, pending: false });
}

export function supportsWebGl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}

export function resolveGraphicsMode(
  setting: "auto" | "2d" | "3d",
  prefersReducedMotion: boolean,
): "2d" | "3d" {
  if (prefersReducedMotion) return "2d";
  if (setting === "2d") return "2d";
  if (setting === "3d") return supportsWebGl() ? "3d" : "2d";
  return supportsWebGl() ? "3d" : "2d";
}

export function totalReturnLabel(multiplier: number): string {
  return `x${multiplier}`;
}

export function formatGik(amount: number): string {
  return `${amount.toLocaleString()} GIK`;
}

export function assertConfigAligned() {
  return (
    FPC_CONFIG.singleSymbolMultiplier === 2 &&
    FPC_CONFIG.specialPairMultiplier === 10 &&
    FPC_CONFIG.symbols.length === 6
  );
}
