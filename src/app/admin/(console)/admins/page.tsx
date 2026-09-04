import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/table";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  AdminRoleOverrideForms,
  CreateAdminForm,
} from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminAdminsPage() {
  await requireAdminSession("admins.manage");
  const supabase = await createServerSupabaseClient();

  const [{ data: admins }, { data: roles }, { data: assignments }] =
    await Promise.all([
      supabase
        .from("admin_profiles")
        .select("user_id, display_name, status, is_owner, require_2fa, pin_updated_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("admin_roles")
        .select("id, code, name")
        .is("deleted_at", null)
        .order("name"),
      supabase.from("admin_role_assignments").select("admin_user_id, role_id"),
    ]);

  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name]));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Administrators</CardTitle>
          <CardDescription>
            Owner tools: create admins, assign roles, override permissions, and
            disable accounts. Sensitive actions require PIN / 2FA when enabled.
          </CardDescription>
        </CardHeader>
      </Card>

      <Table>
        <THead>
          <TR>
            <TH>Name</TH>
            <TH>Status</TH>
            <TH>Owner</TH>
            <TH>Roles</TH>
            <TH>PIN / 2FA</TH>
          </TR>
        </THead>
        <TBody>
          {(admins ?? []).map((admin) => {
            const roleLabels = (assignments ?? [])
              .filter((a) => a.admin_user_id === admin.user_id)
              .map((a) => roleName.get(a.role_id) ?? a.role_id)
              .join(", ");
            return (
              <TR key={admin.user_id}>
                <TD>
                  <div>{admin.display_name}</div>
                  <div className="text-xs text-[var(--brand-muted)]">
                    {admin.user_id}
                  </div>
                </TD>
                <TD>{admin.status}</TD>
                <TD>{admin.is_owner ? "yes" : "no"}</TD>
                <TD>{roleLabels || "—"}</TD>
                <TD>
                  {admin.pin_updated_at ? "PIN" : "no PIN"}
                  {admin.require_2fa ? " · 2FA" : ""}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <Card>
        <CreateAdminForm
          roles={(roles ?? []).map((r) => ({ code: r.code, name: r.name }))}
        />
      </Card>
      <Card>
        <AdminRoleOverrideForms
          admins={(admins ?? []).map((a) => ({
            user_id: a.user_id,
            display_name: a.display_name,
          }))}
          roles={(roles ?? []).map((r) => ({ code: r.code, name: r.name }))}
        />
      </Card>
    </div>
  );
}
