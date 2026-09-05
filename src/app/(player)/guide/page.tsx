import Link from "next/link";

export default function GuidePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <p className="text-sm text-[var(--brand-muted)]">
        <Link href="/" className="underline-offset-4 hover:underline">
          ← Welcome
        </Link>
      </p>
      <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
        Game Guide
      </h1>
      <p className="text-[var(--brand-muted)]">
        Browse without signing in. Playing requires a verified account. GIK
        credits are demo credits only and have no cash value.
      </p>
      <ul className="list-disc space-y-2 pl-5 text-[var(--brand-muted)]">
        <li>Fish–Prawn–Crab — symbol dice with Single Symbol and Special Pair bets</li>
        <li>High–Low Dice — predict high or low; triples lose both sides</li>
        <li>Spinning Plate — pick one of twelve slots and land exactly</li>
      </ul>
    </main>
  );
}
