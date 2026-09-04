/**
 * Ledger domain: append-only credit entries and balance projection.
 * Clients must never mutate balances directly.
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

export interface LedgerEntryDraft {
  playerId: string;
  type: LedgerEntryType;
  amount: number;
  sourceId?: string;
  reason?: string;
}

export const LEDGER_MODULE = "ledger" as const;
