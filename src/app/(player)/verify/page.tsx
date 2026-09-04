import Link from "next/link";

import { VerifyForm } from "@/modules/player/auth-forms";
import { verifyOtpAction } from "@/modules/player/actions";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; email?: string; phone?: string }>;
}) {
  const params = await searchParams;
  const contactType = params.channel === "phone" ? "phone" : "email";

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/" className="underline-offset-4 hover:underline">
            ← GIKGOK
          </Link>
        </p>
        <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
          Verify contact
        </h1>
        <p className="text-sm text-[var(--brand-muted)]">
          Enter the OTP sent to your {contactType}. At least one verified
          contact is required before playing. Welcome credit is granted once
          after verification.
        </p>
      </div>
      <VerifyForm
        action={verifyOtpAction}
        contactType={contactType}
        email={params.email}
        phone={params.phone}
      />
    </main>
  );
}
