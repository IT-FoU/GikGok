import type { HighLowSide } from "@/modules/game-engine";

import {
  HIGH_LOW_CONFIG,
  HIGH_LOW_SESSION_KEY,
  classifyTotal,
  isTripleDice,
  type HighLowReceiptView,
  type HighLowSelection,
  type HighLowServerResult,
  type HighLowSessionState,
} from "./config";

export function buildHighLowSelection(
  side: string,
): HighLowSelection | { error: string } {
  if (side !== "high" && side !== "low") {
    return { error: "Choose exactly High or Low" };
  }
  return { side };
}

export function parseHighLowServerResult(
  value: unknown,
): HighLowServerResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.game !== "high-low") return null;
  if (raw.side !== "high" && raw.side !== "low") return null;
  if (!Array.isArray(raw.dice) || raw.dice.length !== 3) return null;
  if (
    !raw.dice.every(
      (item) => Number.isInteger(item) && (item as number) >= 1 && (item as number) <= 6,
    )
  ) {
    return null;
  }
  const dice = raw.dice as [number, number, number];
  const total =
    typeof raw.total === "number"
      ? raw.total
      : dice[0] + dice[1] + dice[2];
  const isTriple =
    typeof raw.isTriple === "boolean" ? raw.isTriple : isTripleDice(dice);
  const actualSide =
    raw.actualSide === "high" || raw.actualSide === "low"
      ? (raw.actualSide as HighLowSide)
      : classifyTotal(total);

  return {
    game: "high-low",
    side: raw.side,
    dice,
    total,
    isTriple,
    actualSide,
  };
}

export function parsePlaceBetPayload(
  data: Record<string, unknown> | undefined,
  selection: HighLowSelection,
): HighLowReceiptView | null {
  if (!data) return null;
  const result = parseHighLowServerResult(data.result);
  if (!result) return null;

  return {
    betId: String(data.bet_id ?? ""),
    receiptId: String(data.receipt_id ?? ""),
    stake: Number(data.stake ?? 0),
    selection,
    result,
    totalReturnMultiplier: Number(data.total_return_multiplier ?? 0),
    payoutAmount: Number(data.payout_amount ?? 0),
    isWin: String(data.is_win) === "true" || data.is_win === true,
    balanceAfter: Number(data.balance_after ?? 0),
    settlementMode:
      data.settlement_mode === "controlled_demo"
        ? "controlled_demo"
        : "random",
    gameVersionId: String(data.game_version_id ?? ""),
    replay: Boolean(data.replay),
    createdAt: new Date().toISOString(),
  };
}

export function parseReplayReceipt(
  data: Record<string, unknown> | undefined,
  fallbackSelection: HighLowSelection,
): HighLowReceiptView | null {
  if (!data?.replay) return null;
  const receipt = data.receipt;
  if (!receipt || typeof receipt !== "object") {
    return parsePlaceBetPayload(data, fallbackSelection);
  }
  const row = receipt as Record<string, unknown>;
  const result = parseHighLowServerResult(row.result_payload);
  if (!result) return null;
  return {
    betId: String(data.bet_id ?? row.bet_id ?? ""),
    receiptId: String(row.id ?? ""),
    stake: Number(row.stake ?? 0),
    selection: fallbackSelection,
    result,
    totalReturnMultiplier: Number(row.total_return_multiplier ?? 0),
    payoutAmount: Number(row.payout_amount ?? 0),
    isWin: Boolean(row.is_win),
    balanceAfter: Number(row.balance_after ?? 0),
    settlementMode:
      row.settlement_mode === "controlled_demo"
        ? "controlled_demo"
        : "random",
    gameVersionId: String(row.game_version_id ?? ""),
    replay: true,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `hl-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadHighLowSession(): HighLowSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(HIGH_LOW_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HighLowSessionState;
  } catch {
    return null;
  }
}

export function saveHighLowSession(state: HighLowSessionState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(HIGH_LOW_SESSION_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function clearHighLowPending() {
  const current = loadHighLowSession();
  if (!current) return;
  saveHighLowSession({ ...current, pending: false });
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
  quality: "low" | "medium" | "high" = "medium",
): "2d" | "3d" {
  if (prefersReducedMotion || quality === "low") return "2d";
  if (setting === "2d") return "2d";
  if (setting === "3d") return supportsWebGl() ? "3d" : "2d";
  return supportsWebGl() ? "3d" : "2d";
}

export function formatGik(amount: number): string {
  return `${amount.toLocaleString()} GIK`;
}

export function totalReturnLabel(multiplier: number): string {
  return `x${multiplier}`;
}

export function assertConfigAligned() {
  return (
    HIGH_LOW_CONFIG.multiplier === 2 &&
    HIGH_LOW_CONFIG.triplesLose === true &&
    HIGH_LOW_CONFIG.lowRange[0] === 3 &&
    HIGH_LOW_CONFIG.lowRange[1] === 10 &&
    HIGH_LOW_CONFIG.highRange[0] === 11 &&
    HIGH_LOW_CONFIG.highRange[1] === 18
  );
}

/** Exhaustive totals 3–18 with expected side (before triple override). */
export function expectedSideForTotal(total: number): HighLowSide | null {
  if (total < 3 || total > 18) return null;
  return classifyTotal(total);
}
