import Link from "next/link";

import { LoginForm } from "@/modules/player/auth-forms";
import { loginAction } from "@/modules/player/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← GIKGOK
          </Link>
        </p>
        <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
          Sign in
        </h1>
        {params.reset ? (
          <p className="text-sm text-[var(--brand-accent)]">
            Password updated. You can sign in now.
          </p>
        ) : (
          <p className="text-sm text-[var(--brand-muted)]">
            Use your verified email or phone.
          </p>
        )}
      </div>
      <LoginForm action={loginAction} />
      <div className="flex flex-col gap-2 text-sm text-[var(--brand-muted)]">
        <Link
          href="/forgot-password"
          className="text-[var(--brand-accent)] underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
        <p>
          New here?{" "}
          <Link
            href="/register"
            className="text-[var(--brand-accent)] underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
