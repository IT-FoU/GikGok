import Link from "next/link";

import { ResetPasswordForm } from "@/modules/player/auth-forms";
import { updatePasswordAction } from "@/modules/player/actions";

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/login" className="underline-offset-4 hover:underline">
            ← Sign in
          </Link>
        </p>
        <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
          Choose a new password
        </h1>
      </div>
      <ResetPasswordForm action={updatePasswordAction} />
    </main>
  );
}
