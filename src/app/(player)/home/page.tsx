import Link from "next/link";

export default function PlayerHomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-12">
      <p className="text-sm text-[var(--brand-muted)]">
        <Link href="/" className="underline-offset-4 hover:underline">
          ← Welcome
        </Link>
      </p>
      <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
        Player home
      </h1>
      <p className="text-[var(--brand-muted)]">
        Player shell, games, ledger, and engagement features land in later
        phases. This route marks the player app boundary.
      </p>
    </main>
  );
}
