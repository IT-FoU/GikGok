import {
  FPC_SYMBOLS,
  SPINNING_PLATE_MULTIPLIERS,
  type FpcSymbol,
  type HighLowSide,
  type SettlementResult,
} from "./types";

function payout(stake: number, multiplier: number): SettlementResult {
  const payoutAmount = stake * multiplier;
  return {
    resultPayload: {},
    totalReturnMultiplier: multiplier,
    payoutAmount,
    isWin: multiplier > 0,
  };
}

export function settleFishPrawnCrab(args: {
  stake: number;
  kind: "single_symbol" | "special_pair";
  symbols: FpcSymbol[];
  dice: [FpcSymbol, FpcSymbol, FpcSymbol];
}): SettlementResult {
  const { stake, kind, symbols, dice } = args;
  const present = new Set(dice);

  let multiplier = 0;
  if (kind === "single_symbol") {
    multiplier = present.has(symbols[0]!) ? 2 : 0;
  } else {
    const [a, b] = symbols;
    multiplier = present.has(a!) && present.has(b!) ? 10 : 0;
  }

  const result = payout(stake, multiplier);
  result.resultPayload = {
    game: "fish_prawn_crab",
    kind,
    symbols,
    dice,
  };
  return result;
}

export function settleHighLow(args: {
  stake: number;
  side: HighLowSide;
  dice: [number, number, number];
}): SettlementResult {
  const total = args.dice[0] + args.dice[1] + args.dice[2];
  const isTriple =
    args.dice[0] === args.dice[1] && args.dice[1] === args.dice[2];
  const actualSide: HighLowSide = total <= 10 ? "low" : "high";
  const multiplier = !isTriple && actualSide === args.side ? 2 : 0;
  const result = payout(args.stake, multiplier);
  result.resultPayload = {
    game: "high_low",
    side: args.side,
    dice: args.dice,
    total,
    isTriple,
    actualSide,
  };
  return result;
}

export function settleSpinningPlate(args: {
  stake: number;
  selectedSlot: number;
  landedSlot: number;
}): SettlementResult {
  const multiplier =
    args.selectedSlot === args.landedSlot
      ? (SPINNING_PLATE_MULTIPLIERS[args.landedSlot] ?? 0)
      : 0;
  const result = payout(args.stake, multiplier);
  result.resultPayload = {
    game: "spinning_plate",
    selectedSlot: args.selectedSlot,
    landedSlot: args.landedSlot,
    multiplier: SPINNING_PLATE_MULTIPLIERS[args.landedSlot] ?? 0,
  };
  return result;
}

export function randomFpcDice(
  random: () => number = Math.random,
): [FpcSymbol, FpcSymbol, FpcSymbol] {
  const pick = () =>
    FPC_SYMBOLS[Math.floor(random() * FPC_SYMBOLS.length)] as FpcSymbol;
  return [pick(), pick(), pick()];
}

export function randomHighLowDice(
  random: () => number = Math.random,
): [number, number, number] {
  const pick = () => Math.floor(random() * 6) + 1;
  return [pick(), pick(), pick()];
}

export function randomSpinningPlateSlot(
  random: () => number = Math.random,
): number {
  return Math.floor(random() * 12) + 1;
}

export function parseControlledFpcDice(
  payload: unknown,
): [FpcSymbol, FpcSymbol, FpcSymbol] | null {
  if (!payload || typeof payload !== "object") return null;
  const dice = (payload as { dice?: unknown }).dice;
  if (!Array.isArray(dice) || dice.length !== 3) return null;
  if (!dice.every((item) => FPC_SYMBOLS.includes(item as FpcSymbol))) {
    return null;
  }
  return dice as [FpcSymbol, FpcSymbol, FpcSymbol];
}

export function parseControlledHighLowDice(
  payload: unknown,
): [number, number, number] | null {
  if (!payload || typeof payload !== "object") return null;
  const dice = (payload as { dice?: unknown }).dice;
  if (!Array.isArray(dice) || dice.length !== 3) return null;
  if (
    !dice.every(
      (item) => Number.isInteger(item) && (item as number) >= 1 && (item as number) <= 6,
    )
  ) {
    return null;
  }
  return dice as [number, number, number];
}

export function parseControlledPlateSlot(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const slot = (payload as { landedSlot?: unknown }).landedSlot;
  if (!Number.isInteger(slot) || (slot as number) < 1 || (slot as number) > 12) {
    return null;
  }
  return slot as number;
}

/** Pure helper: projected balance after debit must never go negative. */
export function assertDebitAffordable(balance: number, stake: number): void {
  if (!Number.isInteger(stake) || stake <= 0) {
    throw new Error("Stake must be a positive whole number");
  }
  if (balance - stake < 0) {
    throw new Error("Insufficient balance for stake");
  }
}
