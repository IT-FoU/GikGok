import { describe, expect, it } from "vitest";

import {
  assertNoDirectBalanceMutation,
  canClaimDailyReward,
  computeNetCredit,
  computeSimulationFee,
  dailyRewardAmounts,
  DEFAULT_CREDIT_CONFIG,
  formatCountdown,
  nextDailyStreak,
  reconcileLedgerSum,
  requiresSecondApprover,
} from "@/modules/ledger";

describe("ledger domain rules", () => {
  it("computes streak progression and reset", () => {
    expect(
      nextDailyStreak({
        lastClaimDate: null,
        streakDay: 0,
        today: "2026-09-01",
      }),
    ).toBe(1);
    expect(
      nextDailyStreak({
        lastClaimDate: "2026-09-01",
        streakDay: 2,
        today: "2026-09-02",
      }),
    ).toBe(3);
    expect(
      nextDailyStreak({
        lastClaimDate: "2026-09-01",
        streakDay: 4,
        today: "2026-09-03",
      }),
    ).toBe(1);
    expect(
      nextDailyStreak({
        lastClaimDate: "2026-09-01",
        streakDay: 7,
        today: "2026-09-02",
      }),
    ).toBe(1);
  });

  it("applies day 3 and day 7 bonuses", () => {
    expect(dailyRewardAmounts(1).total).toBe(5000);
    expect(dailyRewardAmounts(3)).toEqual({
      base: 5000,
      bonus: 2000,
      total: 7000,
    });
    expect(dailyRewardAmounts(7).total).toBe(15000);
  });

  it("blocks daily reward above max balance or when claimed", () => {
    expect(
      canClaimDailyReward({
        balance: 200_001,
        enabled: true,
        alreadyClaimedToday: false,
      }).ok,
    ).toBe(false);
    expect(
      canClaimDailyReward({
        balance: 10_000,
        enabled: true,
        alreadyClaimedToday: true,
      }).ok,
    ).toBe(false);
    expect(
      canClaimDailyReward({
        balance: 10_000,
        enabled: true,
        alreadyClaimedToday: false,
      }).ok,
    ).toBe(true);
  });

  it("computes simulated fee/net and second-approver threshold", () => {
    const fee = computeSimulationFee({
      gross: 100_000,
      feeMode: "percent",
      feeValue: 2,
    });
    expect(fee).toBe(2000);
    expect(computeNetCredit({ gross: 100_000, fee, bonus: 0 })).toBe(98_000);
    expect(requiresSecondApprover(500_000)).toBe(true);
    expect(
      requiresSecondApprover(10_000, DEFAULT_CREDIT_CONFIG.second_approver_threshold),
    ).toBe(false);
  });

  it("reconciles ledger sums and bans direct mutation helper", () => {
    expect(
      reconcileLedgerSum([{ amount: 50000 }, { amount: -2000 }], 48000),
    ).toEqual({ sum: 48000, matches: true });
    expect(() => assertNoDirectBalanceMutation("update balance")).toThrow(
      /Direct balance mutation is prohibited/,
    );
  });

  it("formats countdown", () => {
    expect(formatCountdown(3661000)).toBe("01:01:01");
  });
});
