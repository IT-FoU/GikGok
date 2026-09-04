import { FPC_SYMBOLS, type BetValidationInput, type BetValidationResult, type FpcSymbol, type GameId, type HighLowSide } from "./types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string, message: string): BetValidationResult {
  return { ok: false, code, message };
}

export function validateStake(args: {
  stake: number;
  balance: number;
  minStake: number;
  maxStake: number;
}): BetValidationResult {
  if (!Number.isInteger(args.stake) || args.stake <= 0) {
    return fail("invalid_stake", "Stake must be a positive whole number");
  }
  if (args.stake < args.minStake || args.stake > args.maxStake) {
    return fail(
      "stake_out_of_range",
      `Stake must be between ${args.minStake} and ${args.maxStake}`,
    );
  }
  if (args.stake > args.balance) {
    return fail("insufficient_balance", "Stake exceeds settled balance");
  }
  return { ok: true };
}

export function validateIdempotencyKey(key: string): BetValidationResult {
  if (!key || typeof key !== "string" || key.trim().length < 8) {
    return fail("invalid_idempotency_key", "Idempotency key is required");
  }
  if (key.length > 128) {
    return fail("invalid_idempotency_key", "Idempotency key is too long");
  }
  return { ok: true };
}

export function validateFpcSelection(selection: unknown): BetValidationResult {
  if (!selection || typeof selection !== "object") {
    return fail("invalid_selection", "Selection is required");
  }
  const value = selection as { kind?: string; symbols?: unknown };
  if (value.kind === "single_symbol") {
    if (!Array.isArray(value.symbols) || value.symbols.length !== 1) {
      return fail("invalid_selection", "Single Symbol requires exactly one symbol");
    }
    if (!FPC_SYMBOLS.includes(value.symbols[0] as FpcSymbol)) {
      return fail("invalid_selection", "Unknown Fish–Prawn–Crab symbol");
    }
    return { ok: true };
  }
  if (value.kind === "special_pair") {
    if (!Array.isArray(value.symbols) || value.symbols.length !== 2) {
      return fail("invalid_selection", "Special Pair requires exactly two symbols");
    }
    const [a, b] = value.symbols as string[];
    if (a === b) {
      return fail("invalid_selection", "Special Pair symbols must be different");
    }
    if (!FPC_SYMBOLS.includes(a as FpcSymbol) || !FPC_SYMBOLS.includes(b as FpcSymbol)) {
      return fail("invalid_selection", "Unknown Fish–Prawn–Crab symbol");
    }
    return { ok: true };
  }
  return fail("invalid_selection", "Unknown Fish–Prawn–Crab bet kind");
}

export function validateHighLowSelection(selection: unknown): BetValidationResult {
  if (!selection || typeof selection !== "object") {
    return fail("invalid_selection", "Selection is required");
  }
  const side = (selection as { side?: string }).side;
  if (side !== "high" && side !== "low") {
    return fail("invalid_selection", "Choose exactly High or Low");
  }
  return { ok: true };
}

export function validateSpinningPlateSelection(
  selection: unknown,
): BetValidationResult {
  if (!selection || typeof selection !== "object") {
    return fail("invalid_selection", "Selection is required");
  }
  const slot = (selection as { slot?: unknown }).slot;
  if (!Number.isInteger(slot) || (slot as number) < 1 || (slot as number) > 12) {
    return fail("invalid_selection", "Select exactly one slot from 1 to 12");
  }
  return { ok: true };
}

export function validateSelection(
  gameId: GameId,
  selection: unknown,
): BetValidationResult {
  switch (gameId) {
    case "fish-prawn-crab":
      return validateFpcSelection(selection);
    case "high-low":
      return validateHighLowSelection(selection);
    case "spinning-plate":
      return validateSpinningPlateSelection(selection);
  }
}

export function validateBetRequest(
  input: BetValidationInput,
): BetValidationResult {
  const stakeResult = validateStake(input);
  if (!stakeResult.ok) return stakeResult;

  const keyResult = validateIdempotencyKey(input.idempotencyKey);
  if (!keyResult.ok) return keyResult;

  return validateSelection(input.gameId, input.selection);
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function asFpcSymbols(selection: {
  kind: string;
  symbols: string[];
}): { kind: "single_symbol" | "special_pair"; symbols: FpcSymbol[] } {
  return {
    kind: selection.kind as "single_symbol" | "special_pair",
    symbols: selection.symbols as FpcSymbol[],
  };
}

export function asHighLowSide(selection: { side: string }): HighLowSide {
  return selection.side as HighLowSide;
}
