import Link from "next/link";

export default function AdminHomePage() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <p className="text-sm text-[var(--brand-muted)]">
        <Link href="/" className="underline-offset-4 hover:underline">
          ← Welcome
        </Link>
      </p>
      <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
        Admin console
      </h1>
      <p className="text-[var(--brand-muted)]">
        Secure admin routing, permissions, and operational modules are
        implemented in Phase 10. This route reserves the `/admin` boundary.
      </p>
    </main>
  );
}
