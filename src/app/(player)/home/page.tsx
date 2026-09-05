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

    const [{ data: profile }, { data: balanceRow }, { data: contacts }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("nickname, status")
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("player_balances")
          .select("balance")
          .eq("player_id", user.id)
          .maybeSingle(),
        supabase
          .from("player_contacts")
          .select("is_verified")
          .eq("player_id", user.id),
      ]);

    if (!profile) {
      redirect("/register");
    }

    nickname = profile.nickname;
    balance = balanceRow?.balance ?? 0;
    verified = Boolean(contacts?.some((row) => row.is_verified));
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

      <section className="space-y-3" aria-label="Games">
        <h2 className="text-lg font-medium">Games</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Button asChild variant="secondary" className="h-auto justify-start py-3">
            <Link href="/play/fish_prawn_crab">Fish–Prawn–Crab</Link>
          </Button>
          <Button asChild variant="secondary" className="h-auto justify-start py-3">
            <Link href="/play/high_low">High–Low Dice</Link>
          </Button>
          <Button asChild variant="secondary" className="h-auto justify-start py-3">
            <Link href="/play/spinning_plate">Spinning Plate</Link>
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/profile">Profile & settings</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/guide">Game Guide</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/credits">Credits</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/verify">Verify contact</Link>
        </Button>
      </div>
    </main>
  );
}
