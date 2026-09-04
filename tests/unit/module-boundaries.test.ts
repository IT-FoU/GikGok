import { describe, expect, it } from "vitest";

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
} from "@/modules/localization";
import { LEDGER_MODULE, type LedgerEntryType } from "@/modules/ledger";
import { GAME_ENGINE_MODULE, type GameId } from "@/modules/game-engine";

describe("Phase 0 module boundaries", () => {
  it("exposes localization defaults", () => {
    expect(DEFAULT_LOCALE).toBe("lo");
    expect(SUPPORTED_LOCALES).toContain("en");
    expect(SUPPORTED_LOCALES).toContain("lo");
  });

  it("keeps ledger module identity and entry types", () => {
    expect(LEDGER_MODULE).toBe("ledger");
    const types: LedgerEntryType[] = [
      "welcome_credit",
      "daily_reward",
      "bet_debit",
      "game_payout",
    ];
    expect(types).toHaveLength(4);
  });

  it("keeps game-engine module identity and game ids", () => {
    expect(GAME_ENGINE_MODULE).toBe("game-engine");
    const games: GameId[] = [
      "fish-prawn-crab",
      "high-low",
      "spinning-plate",
    ];
    expect(games).toHaveLength(3);
  });
});
