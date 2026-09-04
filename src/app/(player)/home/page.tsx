import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/modules/player/actions";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PlayerHomePage() {
  let nickname = "Player";
  let balance = 0;
  let verified = false;
  let signedIn = false;

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login");
    }

    signedIn = true;

    const [{ data: profile }, { data: balanceRow }] = await Promise.all([
      supabase
        .from("profiles")
        .select("nickname, email_verified_at, phone_verified_at, status")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("player_balances")
        .select("balance")
        .eq("player_id", user.id)
        .maybeSingle(),
    ]);

    if (!profile) {
      redirect("/register");
    }

    nickname = profile.nickname;
    balance = balanceRow?.balance ?? 0;
    verified = Boolean(profile.email_verified_at || profile.phone_verified_at);
  } catch (error) {
    // Next.js redirect() throws; never swallow it.
    if (
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      String((error as { digest?: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    // Missing env during local preview — show shell without session data.
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--brand-muted)]">
            <Link href="/" className="underline-offset-4 hover:underline">
              ← Welcome
            </Link>
          </p>
          <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
            Welcome, {nickname}
          </h1>
          <p className="mt-2 text-[var(--brand-muted)]">
            Balance: {balance.toLocaleString()} GIK (demo credits only)
          </p>
          {!verified ? (
            <p className="mt-2 text-sm text-amber-200">
              Verify your contact to unlock play and welcome credit.
            </p>
          ) : null}
        </div>
        {signedIn ? (
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        ) : (
          <Button asChild variant="outline">
            <Link href="/login">Sign in</Link>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/credits">Credits & rewards</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/ledger">Ledger</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/profile">Profile & settings</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/guide">Game Guide</Link>
        </Button>
      </div>
    </main>
  );
}
