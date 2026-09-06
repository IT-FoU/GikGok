import Link from "next/link";
import { redirect } from "next/navigation";

import {
  CreditRequestForm,
  CreditRequestList,
  DailyCheckInCard,
} from "@/modules/ledger/ui";
import {
  CREDIT_SETTING_KEYS,
  DEFAULT_CREDIT_CONFIG,
  mergeCreditConfig,
  parseSettingNumber,
  type CreditConfig,
} from "@/modules/ledger";
import { T } from "@/modules/localization/t";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function loadCreditConfig(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
): Promise<CreditConfig> {
  const partial: Partial<CreditConfig> = {};

  await Promise.all(
    (
      Object.entries(CREDIT_SETTING_KEYS) as Array<
        [keyof typeof CREDIT_SETTING_KEYS, string]
      >
    ).map(async ([field, key]) => {
      const { data } = await supabase.rpc("get_setting", { p_key: key });
      partial[field] = parseSettingNumber(
        data,
        DEFAULT_CREDIT_CONFIG[field],
      );
    }),
  );

  return mergeCreditConfig(partial);
}

export default async function CreditsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);

  const [config, { data: balanceRow }, { data: streakRow }, { data: requests }] =
    await Promise.all([
      loadCreditConfig(supabase),
      supabase
        .from("player_balances")
        .select("balance")
        .eq("player_id", user.id)
        .maybeSingle(),
      supabase
        .from("player_streaks")
        .select("current_streak, last_claimed_on")
        .eq("player_id", user.id)
        .maybeSingle(),
      supabase
        .from("credit_requests")
        .select("id, requested_amount, status, note, created_at")
        .eq("player_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const balance = balanceRow?.balance ?? 0;
  const streakDay = streakRow?.current_streak ?? 0;
  const lastClaimDate = streakRow?.last_claimed_on ?? null;
  const claimedToday = lastClaimDate === today;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/home" className="underline-offset-4 hover:underline">
            <T id="common.backHome" />
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          <T id="credits.title" />
        </h1>
        <p className="mt-2 text-[var(--brand-muted)]">
          <T
            id="credits.balance"
            params={{ amount: balance.toLocaleString() }}
          />
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
          <T id="credits.viewLedger" />
        </Link>
      </p>
    </main>
  );
}
