import Link from "next/link";

import { ResetRequestForm } from "@/modules/player/auth-forms";
import { requestPasswordResetAction } from "@/modules/player/actions";

export default function ForgotPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/login" className="underline-offset-4 hover:underline">
            ← Sign in
          </Link>
        </p>
        <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
          Reset password
        </h1>
        <p className="text-sm text-[var(--brand-muted)]">
          We will email a secure reset link. Demo credits are never transferred
          or cashed out.
        </p>
      </div>
      <ResetRequestForm action={requestPasswordResetAction} />
    </main>
  );
}
