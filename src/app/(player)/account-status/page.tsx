import Link from "next/link";

const MESSAGES: Record<string, { title: string; body: string }> = {
  suspended: {
    title: "Account suspended",
    body: "Your account is suspended. You can browse guides, but play and rewards are blocked until an administrator restores access.",
  },
  banned: {
    title: "Account banned",
    body: "This account is banned and cannot play or receive demo credits.",
  },
  deletion_requested: {
    title: "Deletion requested",
    body: "Your deletion request is recorded. Ledger and audit records are preserved. Contact support if this was a mistake.",
  },
  verification_required: {
    title: "Verification required",
    body: "Verify your email or phone before playing.",
  },
};

export default async function AccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const message =
    MESSAGES[params.reason ?? ""] ?? MESSAGES.suspended;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
        {message.title}
      </h1>
      <p className="text-[var(--brand-muted)]">{message.body}</p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/" className="underline-offset-4 hover:underline">
          Welcome
        </Link>
        <Link href="/guide" className="underline-offset-4 hover:underline">
          Game Guide
        </Link>
        <Link href="/login" className="underline-offset-4 hover:underline">
          Sign in
        </Link>
      </div>
    </main>
  );
}
