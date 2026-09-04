import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function WelcomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--brand-muted)]">
          Demo credits only
        </p>
        <h1 className="text-5xl font-semibold tracking-tight text-[var(--brand-accent)] md:text-6xl">
          GIKGOK
        </h1>
        <p className="max-w-xl text-lg text-[var(--brand-muted)]">
          A private, mobile-first game platform using GIK demo credits. No
          real-money deposits, cash-out, or wallets — ever.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/home">Enter player app</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin">Admin console</Link>
        </Button>
      </div>
    </main>
  );
}
