import { describe, expect, it } from "vitest";

import {
  settleFishPrawnCrab,
  validateFpcSelection,
  validateBetRequest,
} from "@/modules/game-engine";
import {
  assertConfigAligned,
  buildFpcSelection,
  parseFpcServerResult,
  parsePlaceBetPayload,
  parseReplayReceipt,
  resolveGraphicsMode,
  totalReturnLabel,
} from "@/modules/games/fish-prawn-crab";
import { FPC_CONFIG } from "@/modules/games/fish-prawn-crab/config";
import { translate } from "@/modules/localization";

describe("Fish–Prawn–Crab configuration and guide", () => {
  it("keeps versioned multipliers aligned", () => {
    expect(assertConfigAligned()).toBe(true);
    expect(FPC_CONFIG.version).toBe(1);
    expect(FPC_CONFIG.singleSymbolMultiplier).toBe(2);
    expect(FPC_CONFIG.specialPairMultiplier).toBe(10);
  });

  it("exposes bilingual guide strings", () => {
    expect(translate("en", "guide.fpcTitle")).toContain("Fish");
    expect(translate("lo", "guide.fpcTitle")).toBeTruthy();
    expect(translate("en", "fpc.kind.singleHelp")).toContain("x2");
    expect(translate("en", "fpc.kind.pairHelp")).toContain("x10");
  });
});

describe("Fish–Prawn–Crab settlement matrix", () => {
  it("wins single symbol when any die matches", () => {
    const win = settleFishPrawnCrab({
      stake: 1000,
      kind: "single_symbol",
      symbols: ["fish"],
      dice: ["deer", "fish", "crab"],
    });
    expect(win.payoutAmount).toBe(2000);
    expect(win.totalReturnMultiplier).toBe(2);
  });

  it("loses single symbol when no die matches", () => {
    const lose = settleFishPrawnCrab({
      stake: 1000,
      kind: "single_symbol",
      symbols: ["gourd"],
      dice: ["fish", "prawn", "crab"],
    });
    expect(lose.payoutAmount).toBe(0);
    expect(lose.isWin).toBe(false);
  });

  it("wins special pair only when both symbols appear", () => {
    const win = settleFishPrawnCrab({
      stake: 500,
      kind: "special_pair",
      symbols: ["fish", "prawn"],
      dice: ["fish", "crab", "prawn"],
    });
    expect(win.payoutAmount).toBe(5000);

    const lose = settleFishPrawnCrab({
      stake: 500,
      kind: "special_pair",
      symbols: ["fish", "prawn"],
      dice: ["fish", "fish", "crab"],
    });
    expect(lose.payoutAmount).toBe(0);
  });

  it("rejects invalid pair selections and insufficient stakes", () => {
    expect(
      validateFpcSelection({
        kind: "special_pair",
        symbols: ["fish", "fish"],
      }),
    ).toMatchObject({ ok: false });

    expect(
      buildFpcSelection("special_pair", "crab", "crab"),
    ).toMatchObject({ error: expect.stringContaining("different") });

    expect(
      validateBetRequest({
        gameId: "fish-prawn-crab",
        stake: 5000,
        balance: 1000,
        selection: { kind: "single_symbol", symbols: ["fish"] },
        idempotencyKey: "idem-key-fpc-1",
        minStake: 500,
        maxStake: 100_000,
      }),
    ).toMatchObject({ ok: false, code: "insufficient_balance" });
  });
});

describe("Fish–Prawn–Crab receipt parse and recovery helpers", () => {
  it("parses server payload into receipt view", () => {
    const selection = buildFpcSelection("single_symbol", "fish", "prawn");
    expect("error" in selection).toBe(false);
    if ("error" in selection) return;

    const receipt = parsePlaceBetPayload(
      {
        bet_id: "b1",
        receipt_id: "r1",
        stake: 500,
        total_return_multiplier: "2",
        payout_amount: "1000",
        is_win: true,
        balance_after: 9000,
        settlement_mode: "random",
        game_version_id: "v1",
        replay: false,
        result: {
          game: "fish-prawn-crab",
          kind: "single_symbol",
          symbols: ["fish"],
          dice: ["fish", "prawn", "crab"],
        },
      },
      selection,
    );

    expect(receipt?.payoutAmount).toBe(1000);
    expect(receipt?.result.dice[0]).toBe("fish");
    expect(totalReturnLabel(receipt!.totalReturnMultiplier)).toBe("x2");
  });

  it("parses idempotent replay receipt for refresh recovery", () => {
    const selection = buildFpcSelection("special_pair", "fish", "deer");
    if ("error" in selection) throw new Error("bad selection");

    const replay = parseReplayReceipt(
      {
        replay: true,
        bet_id: "bet-9",
        receipt: {
          id: "rcpt-9",
          stake: 1000,
          is_win: false,
          payout_amount: 0,
          total_return_multiplier: 0,
          balance_after: 4000,
          settlement_mode: "controlled_demo",
          game_version_id: "gv",
          created_at: "2026-09-04T00:00:00.000Z",
          result_payload: {
            game: "fish-prawn-crab",
            kind: "special_pair",
            symbols: ["fish", "deer"],
            dice: ["fish", "prawn", "crab"],
          },
        },
      },
      selection,
    );

    expect(replay?.replay).toBe(true);
    expect(replay?.settlementMode).toBe("controlled_demo");
    expect(replay?.isWin).toBe(false);
  });

  it("falls back to 2D for reduced motion or missing WebGL path", () => {
    expect(resolveGraphicsMode("3d", true)).toBe("2d");
    expect(resolveGraphicsMode("2d", false)).toBe("2d");
    expect(parseFpcServerResult({ game: "high-low" })).toBeNull();
  });
});
