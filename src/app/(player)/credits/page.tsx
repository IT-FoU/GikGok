import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CreditRequestForm,
  CreditRequestList,
  DailyCheckInCard,
} from "@/modules/ledger/ui";
import {
  DEFAULT_CREDIT_CONFIG,
  type CreditConfig,
} from "@/modules/ledger";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CreditsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: configRaw },
    { data: balanceRow },
    { data: rewardState },
    { data: requests },
  ] = await Promise.all([
    supabase.rpc("get_credit_config"),
    supabase
      .from("player_balances")
      .select("balance")
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("daily_reward_state")
      .select("streak_day, last_claim_date")
      .eq("player_id", user.id)
      .maybeSingle(),
    supabase
      .from("credit_requests")
      .select("id, requested_amount, status, player_note, created_at")
      .eq("player_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const config = {
    ...DEFAULT_CREDIT_CONFIG,
    ...((configRaw as Partial<CreditConfig> | null) ?? {}),
  };

  const balance = balanceRow?.balance ?? 0;
  const streakDay = rewardState?.streak_day ?? 0;
  const lastClaimDate = rewardState?.last_claim_date ?? null;
  const claimedToday = lastClaimDate === today;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            ← Home
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          Credits & rewards
        </h1>
        <p className="mt-2 text-[var(--brand-muted)]">
          Balance {balance.toLocaleString()} GIK · demo credits only
        </p>
      </div>

      <DailyCheckInCard
        config={config}
        streakDay={streakDay}
        lastClaimDate={lastClaimDate}
        balance={balance}
        claimedToday={claimedToday}
      />

      <CreditRequestForm />
      <CreditRequestList requests={requests ?? []} />

      <p className="text-sm text-[var(--brand-muted)]">
        <Link href="/ledger" className="underline-offset-4 hover:underline">
          View ledger history →
        </Link>
      </p>
    </main>
  );
}
