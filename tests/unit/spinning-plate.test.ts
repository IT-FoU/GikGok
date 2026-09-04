import { describe, expect, it } from "vitest";

import {
  settleSpinningPlate,
  validateBetRequest,
  validateSpinningPlateSelection,
  SPINNING_PLATE_MULTIPLIERS,
} from "@/modules/game-engine";
import {
  assertConfigAligned,
  buildPlateSelection,
  parsePlaceBetPayload,
  parsePlateServerResult,
  parseReplayReceipt,
  resolveGraphicsMode,
  rotationForSlot,
  slotMultiplier,
} from "@/modules/games/spinning-plate";
import { PLATE_CONFIG } from "@/modules/games/spinning-plate/config";
import { translate } from "@/modules/localization";

describe("Spinning Plate configuration and guide", () => {
  it("keeps twelve slots and published multipliers", () => {
    expect(assertConfigAligned()).toBe(true);
    expect(PLATE_CONFIG.slotCount).toBe(12);
    expect(PLATE_CONFIG.icons).toHaveLength(12);
    expect(slotMultiplier(12)).toBe(10);
    expect(SPINNING_PLATE_MULTIPLIERS[11]).toBe(7);
  });

  it("exposes bilingual guide strings", () => {
    expect(translate("en", "guide.plateTitle")).toContain("Spinning");
    expect(translate("lo", "guide.plateTitle")).toBeTruthy();
    expect(translate("en", "plate.a11yResult", {
      selected: 1,
      landed: 12,
      multiplier: 10,
    })).toContain("12");
  });
});

describe("Spinning Plate settlement matrix", () => {
  it("pays exact-match multipliers for every slot", () => {
    for (let slot = 1; slot <= 12; slot += 1) {
      const win = settleSpinningPlate({
        stake: 1000,
        selectedSlot: slot,
        landedSlot: slot,
      });
      expect(win.totalReturnMultiplier).toBe(SPINNING_PLATE_MULTIPLIERS[slot]);
      expect(win.payoutAmount).toBe(1000 * SPINNING_PLATE_MULTIPLIERS[slot]!);
    }
  });

  it("loses when landed slot differs", () => {
    const lose = settleSpinningPlate({
      stake: 1000,
      selectedSlot: 1,
      landedSlot: 12,
    });
    expect(lose.payoutAmount).toBe(0);
    expect(lose.isWin).toBe(false);
  });

  it("rejects invalid slots and insufficient balance", () => {
    expect(validateSpinningPlateSelection({ slot: 0 })).toMatchObject({
      ok: false,
    });
    expect(buildPlateSelection(13)).toMatchObject({ error: expect.any(String) });
    expect(
      validateBetRequest({
        gameId: "spinning-plate",
        stake: 5000,
        balance: 100,
        selection: { slot: 5 },
        idempotencyKey: "idem-plate-1",
        minStake: 500,
        maxStake: 100_000,
      }),
    ).toMatchObject({ ok: false, code: "insufficient_balance" });
  });
});

describe("Spinning Plate receipt, graphics, recovery", () => {
  it("parses payload and replay for refresh recovery", () => {
    const selection = buildPlateSelection(12);
    if ("error" in selection) throw new Error("bad");

    const receipt = parsePlaceBetPayload(
      {
        bet_id: "b1",
        receipt_id: "r1",
        stake: 1000,
        total_return_multiplier: "10",
        payout_amount: "10000",
        is_win: true,
        balance_after: 19000,
        settlement_mode: "random",
        game_version_id: "v1",
        result: {
          game: "spinning-plate",
          selectedSlot: 12,
          landedSlot: 12,
          multiplier: 10,
        },
      },
      selection,
    );
    expect(receipt?.payoutAmount).toBe(10_000);

    const replay = parseReplayReceipt(
      {
        replay: true,
        bet_id: "b2",
        receipt: {
          id: "r2",
          stake: 500,
          is_win: false,
          payout_amount: 0,
          total_return_multiplier: 0,
          balance_after: 4500,
          settlement_mode: "controlled_demo",
          game_version_id: "gv",
          created_at: "2026-09-04T00:00:00.000Z",
          result_payload: {
            game: "spinning-plate",
            selectedSlot: 3,
            landedSlot: 9,
            multiplier: 4,
          },
        },
      },
      buildPlateSelection(3) as { slot: number },
    );
    expect(replay?.replay).toBe(true);
    expect(replay?.result.landedSlot).toBe(9);
    expect(parsePlateServerResult({ game: "high-low" })).toBeNull();
  });

  it("falls back to 2D for reduced motion, low quality, or force2d", () => {
    expect(resolveGraphicsMode("3d", true, "high")).toBe("2d");
    expect(resolveGraphicsMode("auto", false, "low")).toBe("2d");
    expect(resolveGraphicsMode("3d", false, "high", true)).toBe("2d");
    expect(rotationForSlot(1)).toBeCloseTo(0);
    expect(rotationForSlot(2)).toBe(-30);
  });
});
