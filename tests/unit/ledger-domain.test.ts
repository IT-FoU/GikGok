import { describe, expect, it } from "vitest";

import {
  assertNoDirectBalanceMutation,
  canClaimDailyReward,
  computeNetCredit,
  computeSimulationFee,
  dailyRewardAmounts,
  DEFAULT_CREDIT_CONFIG,
  feeValueToPercent,
  formatCountdown,
  nextDailyStreak,
  reconcileLedgerSum,
  requiresSecondApprover,
  streakCycleDay,
} from "@/modules/ledger";

describe("ledger domain rules", () => {
  it("computes streak progression without wrapping at day 7", () => {
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
    ).toBe(8);
    expect(() =>
      nextDailyStreak({
        lastClaimDate: "2026-09-02",
        streakDay: 3,
        today: "2026-09-02",
      }),
    ).toThrow(/already claimed/);
  });

  it("applies %7 streak bonuses (day3 / day7 cycles)", () => {
    expect(dailyRewardAmounts(1).total).toBe(5000);
    expect(dailyRewardAmounts(3)).toEqual({
      base: 5000,
      bonus: 2000,
      total: 7000,
    });
    expect(dailyRewardAmounts(7).total).toBe(15000);
    expect(dailyRewardAmounts(10)).toEqual({
      base: 5000,
      bonus: 2000,
      total: 7000,
    });
    expect(dailyRewardAmounts(14).total).toBe(15000);
    expect(streakCycleDay(8)).toBe(1);
    expect(streakCycleDay(14)).toBe(7);
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

  it("computes simulated fee/net and strict second-approver threshold", () => {
    const fee = computeSimulationFee({
      gross: 100_000,
      feeMode: "percent",
      feeValue: 2,
    });
    expect(fee).toBe(2000);
    expect(computeNetCredit({ gross: 100_000, fee, bonus: 0 })).toBe(98_000);
    // Staging: v_net > v_threshold (not >=)
    expect(requiresSecondApprover(500_000)).toBe(false);
    expect(requiresSecondApprover(500_001)).toBe(true);
    expect(
      requiresSecondApprover(
        10_000,
        DEFAULT_CREDIT_CONFIG.second_approver_threshold,
      ),
    ).toBe(false);
    expect(feeValueToPercent(100_000, "amount", 2500)).toBe(2.5);
    expect(feeValueToPercent(100_000, "percent", 150)).toBe(100);
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
