import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminSecurityForms } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminMfaPage() {
  const { session } = await requireAdminSession(null, { allowMfaEnrollment: true });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Admin MFA</CardTitle>
          <CardDescription>
            Authenticator MFA (aal2) is required for owners and admins with
            require_2fa. PIN confirmation remains a separate control for
            high-impact actions.
          </CardDescription>
        </CardHeader>
        <div className="space-y-2 text-sm text-[var(--brand-muted)]">
          <p>Admin: {session.display_name}</p>
          <p>
            Policy: {session.require_2fa || session.is_owner ? "2FA required" : "2FA optional"}
            {" · "}
            Enrolled: {session.totp_enrolled ? "yes" : "no"}
            {" · "}
            Flag: {session.totp_enabled ? "enabled" : "disabled"}
            {" · "}
            Session AAL: {session.aal ?? "unknown"}
            {" · "}
            MFA OK: {session.mfa_ok ? "yes" : "no"}
          </p>
        </div>
        <AdminSecurityForms />
      </Card>
    </div>
  );
}
