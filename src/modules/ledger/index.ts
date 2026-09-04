/**
 * Ledger domain: append-only credit entries and balance projection.
 * Clients must never mutate balances directly — only call server RPCs.
 */
export type LedgerEntryType =
  | "welcome_credit"
  | "daily_reward"
  | "mission_reward"
  | "achievement_reward"
  | "demo_credit_grant"
  | "simulation_fee"
  | "bet_debit"
  | "game_payout"
  | "admin_adjustment"
  | "reset_demo_data";

export type CreditRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type FeeMode = "percent" | "amount";

export interface LedgerEntryDraft {
  playerId: string;
  type: LedgerEntryType;
  amount: number;
  sourceId?: string;
  reason?: string;
}

export interface CreditConfig {
  welcome_amount: number;
  daily_base_amount: number;
  daily_streak_day3_bonus: number;
  daily_streak_day7_bonus: number;
  daily_reward_max_balance: number;
  daily_rewards_enabled: boolean;
  second_approver_threshold: number;
}

export const LEDGER_MODULE = "ledger" as const;

export const DEFAULT_CREDIT_CONFIG: CreditConfig = {
  welcome_amount: 50_000,
  daily_base_amount: 5_000,
  daily_streak_day3_bonus: 2_000,
  daily_streak_day7_bonus: 10_000,
  daily_reward_max_balance: 200_000,
  daily_rewards_enabled: true,
  second_approver_threshold: 500_000,
};

/** Pure streak helper mirrored by SQL claim_daily_reward. */
export function nextDailyStreak(args: {
  lastClaimDate: string | null;
  streakDay: number;
  today: string;
}): number {
  const { lastClaimDate, streakDay, today } = args;
  if (!lastClaimDate) return 1;

  const last = new Date(`${lastClaimDate}T00:00:00.000Z`);
  const current = new Date(`${today}T00:00:00.000Z`);
  const diffDays = Math.round(
    (current.getTime() - last.getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) {
    throw new Error("daily reward already claimed today");
  }
  if (diffDays === 1) {
    if (streakDay >= 7) return 1;
    return Math.min(streakDay + 1, 7);
  }
  return 1;
}

export function dailyRewardAmounts(
  streakDay: number,
  config: CreditConfig = DEFAULT_CREDIT_CONFIG,
): { base: number; bonus: number; total: number } {
  let bonus = 0;
  if (streakDay === 3) bonus = config.daily_streak_day3_bonus;
  if (streakDay === 7) bonus = config.daily_streak_day7_bonus;
  const base = config.daily_base_amount;
  return { base, bonus, total: base + bonus };
}

export function canClaimDailyReward(args: {
  balance: number;
  enabled: boolean;
  alreadyClaimedToday: boolean;
  config?: CreditConfig;
}): { ok: true } | { ok: false; reason: string } {
  const config = args.config ?? DEFAULT_CREDIT_CONFIG;
  if (!args.enabled || !config.daily_rewards_enabled) {
    return { ok: false, reason: "daily_rewards_disabled" };
  }
  if (args.alreadyClaimedToday) {
    return { ok: false, reason: "already_claimed" };
  }
  if (args.balance > config.daily_reward_max_balance) {
    return { ok: false, reason: "above_max_balance" };
  }
  return { ok: true };
}

export function computeSimulationFee(args: {
  gross: number;
  feeMode: FeeMode | null;
  feeValue: number | null;
}): number {
  if (!args.feeMode || args.feeValue == null) return 0;
  if (args.feeMode === "percent") {
    return Math.floor((args.gross * args.feeValue) / 100);
  }
  return Math.floor(args.feeValue);
}

export function computeNetCredit(args: {
  gross: number;
  fee: number;
  bonus: number;
}): number {
  return args.gross - args.fee + args.bonus;
}

export function requiresSecondApprover(
  netAmount: number,
  threshold: number = DEFAULT_CREDIT_CONFIG.second_approver_threshold,
): boolean {
  return netAmount >= threshold;
}

/** Clients must never call balance updates — enforce at the domain boundary. */
export function assertNoDirectBalanceMutation(operation: string): never {
  throw new Error(
    `Direct balance mutation is prohibited (${operation}). Use ledger RPCs only.`,
  );
}

export function msUntilUtcMidnight(now: Date = new Date()): number {
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    ),
  );
  return Math.max(0, next.getTime() - now.getTime());
}

export function formatCountdown(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function reconcileLedgerSum(
  entries: Array<{ amount: number }>,
  storedBalance: number,
): { sum: number; matches: boolean } {
  const sum = entries.reduce((acc, entry) => acc + entry.amount, 0);
  return { sum, matches: sum === storedBalance };
}
