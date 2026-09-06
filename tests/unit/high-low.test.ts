import { describe, expect, it } from "vitest";

import {
  settleHighLow,
  validateBetRequest,
  validateHighLowSelection,
} from "@/modules/game-engine";
import {
  assertConfigAligned,
  buildHighLowSelection,
  expectedSideForTotal,
  parseHighLowServerResult,
  parsePlaceBetPayload,
  parseReplayReceipt,
  resolveGraphicsMode,
} from "@/modules/games/high-low";
import { HIGH_LOW_CONFIG } from "@/modules/games/high-low/config";
import { translate } from "@/modules/localization";

describe("High–Low configuration and guide", () => {
  it("keeps versioned ranges and multipliers aligned", () => {
    expect(assertConfigAligned()).toBe(true);
    expect(HIGH_LOW_CONFIG.version).toBe(1);
    expect(HIGH_LOW_CONFIG.gameId).toBe("high_low");
    expect(HIGH_LOW_CONFIG.multiplier).toBe(2);
  });

  it("exposes bilingual guide strings", () => {
    expect(translate("en", "guide.highlowTitle")).toContain("High");
    expect(translate("lo", "guide.highlowTitle")).toBeTruthy();
    expect(translate("en", "highlow.result.triple")).toMatch(/triple/i);
  });
});

describe("High–Low settlement matrix", () => {
  it("maps all totals 3–18 to Low/High before triple override", () => {
    for (let total = 3; total <= 18; total += 1) {
      const side = expectedSideForTotal(total);
      expect(side).toBe(total <= 10 ? "low" : "high");
    }
  });

  it("pays x2 for correct non-triple Low and High", () => {
    const low = settleHighLow({
      stake: 1000,
      side: "low",
      dice: [1, 2, 3],
    });
    expect(low.payoutAmount).toBe(2000);
    expect(low.resultPayload.total).toBe(6);

    const high = settleHighLow({
      stake: 500,
      side: "high",
      dice: [6, 6, 5],
    });
    expect(high.payoutAmount).toBe(1000);
    expect(high.resultPayload.total).toBe(17);
  });

  it("forces loss on every triple 1–6 for both sides", () => {
    for (let face = 1; face <= 6; face += 1) {
      const dice: [number, number, number] = [face, face, face];
      for (const side of ["high", "low"] as const) {
        const settled = settleHighLow({ stake: 1000, side, dice });
        expect(settled.payoutAmount).toBe(0);
        expect(settled.resultPayload.isTriple).toBe(true);
      }
    }
  });

  it("rejects invalid side and insufficient balance", () => {
    expect(validateHighLowSelection({ side: "mid" })).toMatchObject({
      ok: false,
    });
    expect(buildHighLowSelection("both")).toMatchObject({
      error: expect.any(String),
    });
    expect(
      validateBetRequest({
        gameId: "high_low",
        stake: 5000,
        balance: 100,
        selection: { side: "high" },
        idempotencyKey: "idem-hl-1",
        minStake: 500,
        maxStake: 1_000_000,
      }),
    ).toMatchObject({ ok: false, code: "insufficient_balance" });
  });
});

describe("High–Low receipt parse and recovery", () => {
  it("parses server payload and staging replay for refresh recovery", () => {
    const selection = buildHighLowSelection("high");
    if ("error" in selection) throw new Error("bad");

    const receipt = parsePlaceBetPayload(
      {
        bet_id: "b1",
        receipt_id: "r1",
        stake: 500,
        total_return_multiplier: "0",
        payout_amount: "0",
        is_win: false,
        balance_after: 4500,
        mode: "random",
        game_version_id: "v1",
        result: {
          game: "high_low",
          side: "high",
          dice: [2, 2, 2],
          total: 6,
          isTriple: true,
          actualSide: "low",
        },
      },
      selection,
    );
    expect(receipt?.result.isTriple).toBe(true);
    expect(receipt?.isWin).toBe(false);

    const replay = parseReplayReceipt(
      {
        replay: true,
        bet_id: "b2",
        receipt: {
          id: "r2",
          stake: 1000,
          is_win: true,
          total_return: 2000,
          balance_after: 7000,
          mode: "controlled_demo",
          game_version_id: "gv",
          created_at: "2026-09-04T00:00:00.000Z",
          result: {
            game: "high_low",
            side: "high",
            dice: [6, 5, 4],
            total: 15,
            isTriple: false,
            actualSide: "high",
          },
        },
      },
      selection,
    );
    expect(replay?.replay).toBe(true);
    expect(replay?.payoutAmount).toBe(2000);
    expect(replay?.totalReturnMultiplier).toBe(2);
    expect(parseHighLowServerResult({ game: "fish_prawn_crab" })).toBeNull();
  });

  it("falls back to 2D for reduced motion or low quality", () => {
    expect(resolveGraphicsMode("3d", true, "high")).toBe("2d");
    expect(resolveGraphicsMode("auto", false, "low")).toBe("2d");
    expect(resolveGraphicsMode("2d", false, "high")).toBe("2d");
  });
});
