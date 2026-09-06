import Link from "next/link";

import { DEFAULT_LOCALE, translate } from "@/modules/localization";
import { ResetPasswordForm } from "@/modules/player/auth-forms";
import { updatePasswordAction } from "@/modules/player/actions";

export default async function ResetPasswordPage() {
  const locale = DEFAULT_LOCALE;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/login" className="underline-offset-4 hover:underline">
            ← {translate(locale, "auth.signIn")}
          </Link>
        </p>
        <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
          {translate(locale, "auth.resetTitle")}
        </h1>
      </div>
      <ResetPasswordForm action={updatePasswordAction} />
    </main>
  );
}
