import {
  PLATE_CONFIG,
  PLATE_SESSION_KEY,
  slotMultiplier,
  type PlateReceiptView,
  type PlateSelection,
  type PlateServerResult,
  type PlateSessionState,
} from "./config";

export function buildPlateSelection(
  slot: number,
): PlateSelection | { error: string } {
  if (!Number.isInteger(slot) || slot < 1 || slot > PLATE_CONFIG.slotCount) {
    return { error: "Select exactly one slot from 1 to 12" };
  }
  return { slot };
}

export function parsePlateServerResult(value: unknown): PlateServerResult | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.game !== "spinning_plate") return null;
  const selectedSlot = Number(raw.selectedSlot);
  const landedSlot = Number(raw.landedSlot);
  if (
    !Number.isInteger(selectedSlot) ||
    !Number.isInteger(landedSlot) ||
    selectedSlot < 1 ||
    selectedSlot > 12 ||
    landedSlot < 1 ||
    landedSlot > 12
  ) {
    return null;
  }
  const multiplier =
    typeof raw.multiplier === "number"
      ? raw.multiplier
      : slotMultiplier(landedSlot);
  return {
    game: "spinning_plate",
    selectedSlot,
    landedSlot,
    multiplier,
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
  selection: PlateSelection,
): PlateReceiptView | null {
  if (!data) return null;
  const result = parsePlateServerResult(data.result);
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

export function parseReplayReceipt(
  data: Record<string, unknown> | undefined,
  fallbackSelection: PlateSelection,
): PlateReceiptView | null {
  if (!data?.replay) return null;
  const receipt = data.receipt;
  if (!receipt || typeof receipt !== "object") {
    return parsePlaceBetPayload(data, fallbackSelection);
  }
  const row = receipt as Record<string, unknown>;
  const result = parsePlateServerResult(row.result_payload ?? row.result);
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
  return `plate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadPlateSession(): PlateSessionState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PLATE_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlateSessionState;
  } catch {
    return null;
  }
}

export function savePlateSession(state: PlateSessionState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PLATE_SESSION_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function clearPlatePending() {
  const current = loadPlateSession();
  if (!current) return;
  savePlateSession({ ...current, pending: false });
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
  force2d = false,
): "2d" | "3d" {
  if (force2d || prefersReducedMotion || quality === "low") return "2d";
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

/** Simple rAF FPS sampler; returns unsubscribe. */
export function watchLowFps(
  onLowFps: () => void,
  threshold = 28,
  sampleMs = 1500,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  let frames = 0;
  let start = performance.now();
  let raf = 0;
  let stopped = false;

  const tick = (now: number) => {
    if (stopped) return;
    frames += 1;
    const elapsed = now - start;
    if (elapsed >= sampleMs) {
      const fps = (frames / elapsed) * 1000;
      if (fps < threshold) onLowFps();
      frames = 0;
      start = now;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
