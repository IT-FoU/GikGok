import type { Json } from "@/lib/supabase/types";

export type BetHistoryFilter = "all" | "wins" | "losses";

export type BetReceiptRow = {
  id: string;
  bet_id: string;
  game_id: string;
  game_version_id: string;
  settlement_mode: string;
  stake: number;
  selection: Json;
  total_return_multiplier: number;
  payout_amount: number;
  balance_after: number;
  is_win: boolean;
  created_at: string;
};

export function filterBetReceipts<T extends { is_win: boolean }>(
  rows: T[],
  filter: BetHistoryFilter,
): T[] {
  if (filter === "wins") return rows.filter((row) => row.is_win);
  if (filter === "losses") return rows.filter((row) => !row.is_win);
  return rows;
}

export function sessionBreakDue(
  startedAt: string | null | undefined,
  breakMinutes: number,
  now: Date = new Date(),
): boolean {
  if (!startedAt || breakMinutes <= 0) return false;
  const elapsedMs = now.getTime() - new Date(startedAt).getTime();
  return elapsedMs >= breakMinutes * 60 * 1000;
}

export function formatSessionDuration(
  startedAt: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!startedAt) return "0m";
  const totalMinutes = Math.floor(
    (now.getTime() - new Date(startedAt).getTime()) / 60_000,
  );
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export function localizeJson(
  i18n: Json | Record<string, string> | null | undefined,
  locale: string,
): string {
  if (!i18n || typeof i18n !== "object" || Array.isArray(i18n)) return "";
  const record = i18n as Record<string, string>;
  return (
    record[locale] ??
    record.en ??
    record.lo ??
    Object.values(record).find((value) => typeof value === "string") ??
    ""
  );
}

export function summarizeSelection(selection: Json): string {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    return "—";
  }
  const record = selection as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.kind === "string") parts.push(record.kind);
  if (typeof record.side === "string") parts.push(record.side);
  if (typeof record.slot === "number") parts.push(`slot ${record.slot}`);
  if (Array.isArray(record.symbols)) {
    parts.push(record.symbols.map(String).join(", "));
  }
  if (parts.length > 0) return parts.join(" · ");
  return JSON.stringify(selection);
}

export type ResponsiblePlayConfig = {
  session_break_minutes: number;
  daily_bet_limit: number;
  pause_days_options: number[];
  demo_notice: string;
};

export const DEFAULT_RESPONSIBLE_PLAY_CONFIG: ResponsiblePlayConfig = {
  session_break_minutes: 45,
  daily_bet_limit: 500_000,
  pause_days_options: [1, 3, 7],
  demo_notice:
    "GIK credits are demo credits only and have no cash value.",
};

export function parseResponsiblePlayConfig(
  raw: Json | null | undefined,
): ResponsiblePlayConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_RESPONSIBLE_PLAY_CONFIG;
  }
  const value = raw as Record<string, unknown>;
  const pauseRaw = value.pause_days_options;
  let pauseDays = DEFAULT_RESPONSIBLE_PLAY_CONFIG.pause_days_options;
  if (Array.isArray(pauseRaw)) {
    pauseDays = pauseRaw
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0);
  }
  return {
    session_break_minutes: Number(value.session_break_minutes) || 45,
    daily_bet_limit: Number(value.daily_bet_limit) || 500_000,
    pause_days_options:
      pauseDays.length > 0
        ? pauseDays
        : DEFAULT_RESPONSIBLE_PLAY_CONFIG.pause_days_options,
    demo_notice:
      typeof value.demo_notice === "string"
        ? value.demo_notice
        : DEFAULT_RESPONSIBLE_PLAY_CONFIG.demo_notice,
  };
}

export type LeaderboardMetric =
  | "highest_credit"
  | "cumulative_winnings"
  | "most_wins";

export const LEADERBOARD_METRICS: LeaderboardMetric[] = [
  "highest_credit",
  "cumulative_winnings",
  "most_wins",
];

export function parseLeaderboardMetric(
  value: string | undefined,
): LeaderboardMetric {
  return LEADERBOARD_METRICS.includes(value as LeaderboardMetric)
    ? (value as LeaderboardMetric)
    : "highest_credit";
}
