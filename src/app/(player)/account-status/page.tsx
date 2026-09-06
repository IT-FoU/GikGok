import Link from "next/link";

import { DEFAULT_LOCALE, translate } from "@/modules/localization";

const REASON_KEYS = {
  suspended: {
    title: "status.suspendedTitle",
    body: "status.suspendedBody",
  },
  banned: {
    title: "status.bannedTitle",
    body: "status.bannedBody",
  },
  deletion_requested: {
    title: "status.deletionTitle",
    body: "status.deletionBody",
  },
  verification_required: {
    title: "status.verificationTitle",
    body: "status.verificationBody",
  },
} as const;

type StatusReason = keyof typeof REASON_KEYS;

function isStatusReason(value: string | undefined): value is StatusReason {
  return !!value && value in REASON_KEYS;
}

export default async function AccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const params = await searchParams;
  const reason: StatusReason = isStatusReason(params.reason)
    ? params.reason
    : "suspended";
  const keys = REASON_KEYS[reason];
  const locale = DEFAULT_LOCALE;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold text-[var(--brand-accent)]">
        {translate(locale, keys.title)}
      </h1>
      <p className="text-[var(--brand-muted)]">
        {translate(locale, keys.body)}
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/" className="underline-offset-4 hover:underline">
          {translate(locale, "status.welcomeLink")}
        </Link>
        <Link href="/guide" className="underline-offset-4 hover:underline">
          {translate(locale, "status.guideLink")}
        </Link>
        <Link href="/login" className="underline-offset-4 hover:underline">
          {translate(locale, "status.signInLink")}
        </Link>
      </div>
    </main>
  );
}
