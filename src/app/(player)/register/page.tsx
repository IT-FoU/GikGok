import Link from "next/link";

import { Button } from "@/components/ui/button";
import { RegisterForm } from "@/modules/player/auth-forms";
import { registerAction } from "@/modules/player/actions";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← GIKGOK
          </Link>
        </p>
        <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
          Create account
        </h1>
        <p className="text-sm text-[var(--brand-muted)]">
          Demo credits only. Verify email or phone before playing.
        </p>
      </div>
      <RegisterForm action={registerAction} />
      <p className="text-sm text-[var(--brand-muted)]">
            Already have an account?{" "}
        <Link href="/login" className="text-[var(--brand-accent)] underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
      <Button asChild variant="ghost">
        <Link href="/guide">Read Game Guide</Link>
      </Button>
    </main>
  );
}
