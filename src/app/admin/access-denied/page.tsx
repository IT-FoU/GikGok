import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminAccessDeniedPage() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>Admin access denied</CardTitle>
          <CardDescription>
            This area requires an active administrator session and the matching
            permission. Sign in with an admin account or ask an Owner to grant
            access.
          </CardDescription>
        </CardHeader>
        <div className="flex gap-4 text-sm">
          <Link href="/login?next=/admin" className="underline underline-offset-4">
            Sign in
          </Link>
          <Link href="/" className="underline underline-offset-4">
            Back home
          </Link>
        </div>
      </Card>
    </div>
  );
}
