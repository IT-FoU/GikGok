import { afterEach, describe, expect, it } from "vitest";

import {
  GAME_DEFINITIONS,
  checkRateLimit,
  getGameDefinition,
  listGameDefinitions,
  parseControlledFpcDice,
  parseControlledHighLowDice,
  parseControlledPlateSlot,
  resetRateLimits,
  settleFishPrawnCrab,
  settleHighLow,
  settleSpinningPlate,
  validateBetRequest,
  validateFpcSelection,
  validateHighLowSelection,
  validateIdempotencyKey,
  validateSpinningPlateSelection,
  validateStake,
} from "@/modules/game-engine";

describe("game definitions", () => {
  it("registers all three launch games with stake bounds", () => {
    expect(listGameDefinitions()).toHaveLength(3);
    expect(getGameDefinition("fish-prawn-crab").minStake).toBe(500);
    expect(GAME_DEFINITIONS["high-low"].maxStake).toBe(100_000);
    expect(GAME_DEFINITIONS["spinning-plate"].quickStakes).toContain(1000);
  });
});

describe("bet validation", () => {
  it("rejects non-integer, out-of-range, and over-balance stakes", () => {
    expect(
      validateStake({ stake: 1.5, balance: 1000, minStake: 500, maxStake: 1000 }),
    ).toMatchObject({ ok: false, code: "invalid_stake" });
    expect(
      validateStake({ stake: 100, balance: 1000, minStake: 500, maxStake: 1000 }),
    ).toMatchObject({ ok: false, code: "stake_out_of_range" });
    expect(
      validateStake({
        stake: 800,
        balance: 700,
        minStake: 500,
        maxStake: 1000,
      }),
    ).toMatchObject({ ok: false, code: "insufficient_balance" });
    expect(
      validateStake({
        stake: 500,
        balance: 500,
        minStake: 500,
        maxStake: 1000,
      }),
    ).toEqual({ ok: true });
  });

  it("requires a usable idempotency key", () => {
    expect(validateIdempotencyKey("short")).toMatchObject({ ok: false });
    expect(validateIdempotencyKey("idem-key-01")).toEqual({ ok: true });
  });

  it("validates Fish–Prawn–Crab selections", () => {
    expect(
      validateFpcSelection({ kind: "single_symbol", symbols: ["fish"] }),
    ).toEqual({ ok: true });
    expect(
      validateFpcSelection({
        kind: "special_pair",
        symbols: ["fish", "fish"],
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateFpcSelection({
        kind: "special_pair",
        symbols: ["fish", "prawn"],
      }),
    ).toEqual({ ok: true });
    expect(validateFpcSelection({ kind: "single_symbol", symbols: [] })).toMatchObject({
      ok: false,
    });
  });

  it("validates High–Low and Spinning Plate selections", () => {
    expect(validateHighLowSelection({ side: "high" })).toEqual({ ok: true });
    expect(validateHighLowSelection({ side: "both" })).toMatchObject({
      ok: false,
    });
    expect(validateSpinningPlateSelection({ slot: 12 })).toEqual({ ok: true });
    expect(validateSpinningPlateSelection({ slot: 0 })).toMatchObject({
      ok: false,
    });
  });

  it("composes full bet request validation", () => {
    const ok = validateBetRequest({
      gameId: "high-low",
      stake: 500,
      balance: 5000,
      selection: { side: "low" },
      idempotencyKey: "request-abc-1",
      minStake: 500,
      maxStake: 100_000,
    });
    expect(ok).toEqual({ ok: true });

    const bad = validateBetRequest({
      gameId: "spinning-plate",
      stake: 500,
      balance: 5000,
      selection: { slot: 99 },
      idempotencyKey: "request-abc-2",
      minStake: 500,
      maxStake: 100_000,
    });
    expect(bad).toMatchObject({ ok: false, code: "invalid_selection" });
  });
});

describe("settlement rules", () => {
  it("settles Fish–Prawn–Crab single and pair", () => {
    const winSingle = settleFishPrawnCrab({
      stake: 1000,
      kind: "single_symbol",
      symbols: ["fish"],
      dice: ["fish", "prawn", "crab"],
    });
    expect(winSingle.totalReturnMultiplier).toBe(2);
    expect(winSingle.payoutAmount).toBe(2000);
    expect(winSingle.isWin).toBe(true);

    const loseSingle = settleFishPrawnCrab({
      stake: 1000,
      kind: "single_symbol",
      symbols: ["deer"],
      dice: ["fish", "prawn", "crab"],
    });
    expect(loseSingle.payoutAmount).toBe(0);

    const winPair = settleFishPrawnCrab({
      stake: 500,
      kind: "special_pair",
      symbols: ["fish", "prawn"],
      dice: ["fish", "prawn", "crab"],
    });
    expect(winPair.totalReturnMultiplier).toBe(10);
    expect(winPair.payoutAmount).toBe(5000);
  });

  it("settles High–Low with triple lose", () => {
    const highWin = settleHighLow({
      stake: 1000,
      side: "high",
      dice: [6, 6, 5],
    });
    expect(highWin.payoutAmount).toBe(2000);
    expect(highWin.resultPayload.total).toBe(17);

    const tripleLose = settleHighLow({
      stake: 1000,
      side: "high",
      dice: [4, 4, 4],
    });
    expect(tripleLose.payoutAmount).toBe(0);
    expect(tripleLose.resultPayload.isTriple).toBe(true);

    const lowWin = settleHighLow({
      stake: 500,
      side: "low",
      dice: [1, 2, 3],
    });
    expect(lowWin.payoutAmount).toBe(1000);
  });

  it("settles Spinning Plate exact land only", () => {
    const win = settleSpinningPlate({
      stake: 1000,
      selectedSlot: 12,
      landedSlot: 12,
    });
    expect(win.totalReturnMultiplier).toBe(10);
    expect(win.payoutAmount).toBe(10_000);

    const miss = settleSpinningPlate({
      stake: 1000,
      selectedSlot: 1,
      landedSlot: 12,
    });
    expect(miss.payoutAmount).toBe(0);
  });

  it("parses controlled demo payloads", () => {
    expect(
      parseControlledFpcDice({ dice: ["fish", "prawn", "crab"] }),
    ).toEqual(["fish", "prawn", "crab"]);
    expect(parseControlledFpcDice({ dice: ["fish"] })).toBeNull();
    expect(parseControlledHighLowDice({ dice: [1, 2, 3] })).toEqual([1, 2, 3]);
    expect(parseControlledHighLowDice({ dice: [1, 2, 7] })).toBeNull();
    expect(parseControlledPlateSlot({ landedSlot: 7 })).toBe(7);
    expect(parseControlledPlateSlot({ landedSlot: 0 })).toBeNull();
  });
});

describe("rate limiting", () => {
  afterEach(() => {
    resetRateLimits();
  });

  it("allows up to the limit then blocks", () => {
    const key = "player-a:bet";
    for (let i = 0; i < 30; i += 1) {
      expect(
        checkRateLimit({ key, limit: 30, windowMs: 60_000, now: 1000 + i }),
      ).toMatchObject({ allowed: true });
    }
    const blocked = checkRateLimit({
      key,
      limit: 30,
      windowMs: 60_000,
      now: 1031,
    });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    }
  });
});
