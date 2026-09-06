import Link from "next/link";

import { DEFAULT_LOCALE, translate } from "@/modules/localization";
import { LoginForm } from "@/modules/player/auth-forms";
import { loginAction } from "@/modules/player/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const params = await searchParams;
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
          {translate(locale, "auth.signIn")}
        </h1>
        {params.reset ? (
          <p className="text-sm text-[var(--brand-accent)]">
            {translate(locale, "auth.passwordUpdated")}
          </p>
        ) : (
          <p className="text-sm text-[var(--brand-muted)]">
            {translate(locale, "auth.useVerifiedContact")}
          </p>
        )}
      </div>
      <LoginForm action={loginAction} />
      <div className="flex flex-col gap-2 text-sm text-[var(--brand-muted)]">
        <Link
          href="/forgot-password"
          className="text-[var(--brand-accent)] underline-offset-4 hover:underline"
        >
          {translate(locale, "auth.forgotPassword")}
        </Link>
        <p>
          {translate(locale, "auth.newHere")}{" "}
          <Link
            href="/register"
            className="text-[var(--brand-accent)] underline-offset-4 hover:underline"
          >
            {translate(locale, "auth.createAnAccount")}
          </Link>
        </p>
      </div>
    </main>
  );
}
