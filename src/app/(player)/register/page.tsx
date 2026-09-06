import Link from "next/link";

import { DEFAULT_LOCALE, translate } from "@/modules/localization";
import { RegisterForm } from "@/modules/player/auth-forms";
import { registerAction } from "@/modules/player/actions";

export default async function RegisterPage() {
  const locale = DEFAULT_LOCALE;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← GIKGOK
          </Link>
        </p>
        <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
          {translate(locale, "auth.createAccount")}
        </h1>
        <p className="text-sm text-[var(--brand-muted)]">
          {translate(locale, "auth.demoCreditsOnly")}
        </p>
      </div>
      <RegisterForm action={registerAction} />
      <p className="text-sm text-[var(--brand-muted)]">
        {translate(locale, "auth.alreadyHaveAccount")}{" "}
        <Link
          href="/login"
          className="text-[var(--brand-accent)] underline-offset-4 hover:underline"
        >
          {translate(locale, "auth.signIn")}
        </Link>
      </p>
    </main>
  );
}
