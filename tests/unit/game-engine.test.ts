import { describe, expect, it, beforeEach } from "vitest";

import {
  GAME_DEFINITIONS,
  GAME_ENGINE_MODULE,
  GAME_IDS,
  SPINNING_PLATE_MULTIPLIERS,
  assertDebitAffordable,
  checkRateLimit,
  getGameDefinition,
  isGameId,
  listGameDefinitions,
  parseControlledFpcDice,
  parseControlledHighLowDice,
  parseControlledPlateSlot,
  randomFpcDice,
  randomHighLowDice,
  randomSpinningPlateSlot,
  resetRateLimits,
  settleFishPrawnCrab,
  settleHighLow,
  settleSpinningPlate,
  validateBetRequest,
  validateFpcSelection,
  validateHighLowSelection,
  validateIdempotencyKey,
  validateSelection,
  validateSpinningPlateSelection,
  validateStake,
} from "@/modules/game-engine";

describe("game-engine module identity", () => {
  it("exposes module id and three staging game keys", () => {
    expect(GAME_ENGINE_MODULE).toBe("game-engine");
    expect(GAME_IDS).toEqual([
      "fish_prawn_crab",
      "high_low",
      "spinning_plate",
    ]);
    expect(isGameId("fish_prawn_crab")).toBe(true);
    expect(isGameId("fish-prawn-crab")).toBe(false);
    expect(listGameDefinitions()).toHaveLength(3);
    expect(getGameDefinition("high_low").minStake).toBe(500);
    expect(GAME_DEFINITIONS.spinning_plate.defaultConfigVersion).toBe(1);
  });
});

describe("stake and idempotency validation", () => {
  it("accepts in-range integer stakes within balance", () => {
    expect(
      validateStake({
        stake: 1000,
        balance: 5000,
        minStake: 500,
        maxStake: 10_000,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects non-integer, out-of-range, and over-balance stakes", () => {
    expect(
      validateStake({
        stake: 1.5,
        balance: 5000,
        minStake: 500,
        maxStake: 10_000,
      }).ok,
    ).toBe(false);
    expect(
      validateStake({
        stake: 100,
        balance: 5000,
        minStake: 500,
        maxStake: 10_000,
      }).ok,
    ).toBe(false);
    expect(
      validateStake({
        stake: 20_000,
        balance: 50_000,
        minStake: 500,
        maxStake: 10_000,
      }).ok,
    ).toBe(false);
    expect(
      validateStake({
        stake: 2000,
        balance: 1000,
        minStake: 500,
        maxStake: 10_000,
      }),
    ).toMatchObject({ ok: false, code: "insufficient_balance" });
  });

  it("enforces idempotency key length bounds", () => {
    expect(validateIdempotencyKey("short").ok).toBe(false);
    expect(validateIdempotencyKey("long-enough-key").ok).toBe(true);
    expect(validateIdempotencyKey("x".repeat(129)).ok).toBe(false);
  });

  it("blocks negative projected balance after debit", () => {
    expect(() => assertDebitAffordable(500, 501)).toThrow(/Insufficient/);
    expect(() => assertDebitAffordable(500, 500)).not.toThrow();
  });
});

describe("selection validation", () => {
  it("validates fish_prawn_crab single and special pair", () => {
    expect(
      validateFpcSelection({ kind: "single_symbol", symbols: ["fish"] }),
    ).toEqual({ ok: true });
    expect(
      validateFpcSelection({
        kind: "special_pair",
        symbols: ["fish", "prawn"],
      }),
    ).toEqual({ ok: true });
    expect(
      validateFpcSelection({
        kind: "special_pair",
        symbols: ["fish", "fish"],
      }).ok,
    ).toBe(false);
    expect(
      validateFpcSelection({ kind: "single_symbol", symbols: ["whale"] }).ok,
    ).toBe(false);
    expect(validateFpcSelection({ kind: "triple" }).ok).toBe(false);
  });

  it("validates high_low and spinning_plate selections", () => {
    expect(validateHighLowSelection({ side: "high" })).toEqual({ ok: true });
    expect(validateHighLowSelection({ side: "mid" }).ok).toBe(false);
    expect(validateSpinningPlateSelection({ slot: 12 })).toEqual({ ok: true });
    expect(validateSpinningPlateSelection({ slot: 0 }).ok).toBe(false);
    expect(validateSpinningPlateSelection({ slot: 1.5 }).ok).toBe(false);
  });

  it("routes validateSelection by game id", () => {
    expect(
      validateSelection("fish_prawn_crab", {
        kind: "single_symbol",
        symbols: ["crab"],
      }).ok,
    ).toBe(true);
    expect(validateSelection("high_low", { side: "low" }).ok).toBe(true);
    expect(validateSelection("spinning_plate", { slot: 7 }).ok).toBe(true);
  });

  it("composes full bet request validation", () => {
    const ok = validateBetRequest({
      gameId: "high_low",
      stake: 500,
      balance: 5000,
      selection: { side: "high" },
      idempotencyKey: "idem-key-01",
      minStake: 500,
      maxStake: 100_000,
    });
    expect(ok).toEqual({ ok: true });

    const bad = validateBetRequest({
      gameId: "spinning_plate",
      stake: 500,
      balance: 5000,
      selection: { slot: 99 },
      idempotencyKey: "idem-key-01",
      minStake: 500,
      maxStake: 100_000,
    });
    expect(bad.ok).toBe(false);
  });
});

describe("settlement rules (server-mirror)", () => {
  it("settles FPC single symbol x2 and special pair x10", () => {
    const singleWin = settleFishPrawnCrab({
      stake: 1000,
      kind: "single_symbol",
      symbols: ["fish"],
      dice: ["fish", "crab", "deer"],
    });
    expect(singleWin).toMatchObject({
      totalReturnMultiplier: 2,
      payoutAmount: 2000,
      isWin: true,
    });
    expect(singleWin.resultPayload.game).toBe("fish_prawn_crab");

    const singleLose = settleFishPrawnCrab({
      stake: 1000,
      kind: "single_symbol",
      symbols: ["gourd"],
      dice: ["fish", "crab", "deer"],
    });
    expect(singleLose.isWin).toBe(false);
    expect(singleLose.payoutAmount).toBe(0);

    const pairWin = settleFishPrawnCrab({
      stake: 500,
      kind: "special_pair",
      symbols: ["fish", "crab"],
      dice: ["fish", "crab", "deer"],
    });
    expect(pairWin.totalReturnMultiplier).toBe(10);
    expect(pairWin.payoutAmount).toBe(5000);

    const pairLose = settleFishPrawnCrab({
      stake: 500,
      kind: "special_pair",
      symbols: ["fish", "gourd"],
      dice: ["fish", "crab", "deer"],
    });
    expect(pairLose.isWin).toBe(false);
  });

  it("settles high_low with triple override", () => {
    const highWin = settleHighLow({
      stake: 1000,
      side: "high",
      dice: [6, 5, 4],
    });
    expect(highWin.payoutAmount).toBe(2000);
    expect(highWin.resultPayload.total).toBe(15);

    const lowWin = settleHighLow({
      stake: 1000,
      side: "low",
      dice: [1, 2, 3],
    });
    expect(lowWin.isWin).toBe(true);

    const tripleLose = settleHighLow({
      stake: 1000,
      side: "high",
      dice: [6, 6, 6],
    });
    expect(tripleLose.isWin).toBe(false);
    expect(tripleLose.resultPayload.isTriple).toBe(true);

    const wrongSide = settleHighLow({
      stake: 1000,
      side: "low",
      dice: [6, 5, 4],
    });
    expect(wrongSide.isWin).toBe(false);
  });

  it("settles spinning_plate exact-match multipliers for all slots", () => {
    for (let slot = 1; slot <= 12; slot += 1) {
      const win = settleSpinningPlate({
        stake: 1000,
        selectedSlot: slot,
        landedSlot: slot,
      });
      expect(win.totalReturnMultiplier).toBe(SPINNING_PLATE_MULTIPLIERS[slot]);
      expect(win.payoutAmount).toBe(1000 * (SPINNING_PLATE_MULTIPLIERS[slot] ?? 0));
    }

    const miss = settleSpinningPlate({
      stake: 1000,
      selectedSlot: 1,
      landedSlot: 12,
    });
    expect(miss.isWin).toBe(false);
    expect(miss.payoutAmount).toBe(0);
    expect(miss.resultPayload.multiplier).toBe(10);
  });

  it("parses controlled demo payloads and rejects invalid ones", () => {
    expect(
      parseControlledFpcDice({ dice: ["fish", "prawn", "crab"] }),
    ).toEqual(["fish", "prawn", "crab"]);
    expect(parseControlledFpcDice({ dice: ["fish", "fish"] })).toBeNull();
    expect(parseControlledHighLowDice({ dice: [1, 2, 3] })).toEqual([1, 2, 3]);
    expect(parseControlledHighLowDice({ dice: [1, 2, 7] })).toBeNull();
    expect(parseControlledPlateSlot({ landedSlot: 12 })).toBe(12);
    expect(parseControlledPlateSlot({ landedSlot: 0 })).toBeNull();
  });

  it("produces deterministic random helpers with seeded rng", () => {
    let i = 0;
    const seq = [0, 0.5, 0.99, 0.1, 0.2, 0.3];
    const rng = () => seq[i++] ?? 0;
    expect(randomFpcDice(rng)).toEqual(["fish", "gourd", "deer"]);
    expect(randomHighLowDice(rng)).toEqual([1, 2, 2]);
    expect(randomSpinningPlateSlot(() => 0.99)).toBe(12);
  });
});

describe("rate limiting and config retention", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows up to limit then rejects within the window", () => {
    const key = "bet:player:fish_prawn_crab";
    for (let n = 0; n < 30; n += 1) {
      const result = checkRateLimit({
        key,
        limit: 30,
        windowMs: 60_000,
        now: 1_000,
      });
      expect(result.allowed).toBe(true);
    }
    const blocked = checkRateLimit({
      key,
      limit: 30,
      windowMs: 60_000,
      now: 1_000,
    });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it("retains per-game default config version independently", () => {
    for (const id of GAME_IDS) {
      expect(getGameDefinition(id).defaultConfigVersion).toBe(1);
    }
    // Mutating one definition object must not invent a new game id.
    expect(Object.keys(GAME_DEFINITIONS).sort()).toEqual([...GAME_IDS].sort());
  });

  it("treats duplicate idempotency validation as client-safe replay gate", () => {
    const first = validateIdempotencyKey("same-idempotency-key");
    const second = validateIdempotencyKey("same-idempotency-key");
    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
  });
});
