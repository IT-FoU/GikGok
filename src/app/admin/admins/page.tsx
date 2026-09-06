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

  const [{ data: admins }, { data: roles }, { data: assignments }, { data: profiles }] =
    await Promise.all([
      supabase
        .from("admin_users")
        .select("id, is_owner, is_active, requires_2fa, requires_pin, created_at")
        .order("created_at", { ascending: true }),
      supabase.from("admin_roles").select("id, key, name").order("name"),
      supabase.from("admin_user_roles").select("admin_id, role_id"),
      supabase.from("profiles").select("id, nickname"),
    ]);

  const roleName = new Map((roles ?? []).map((r) => [r.id, r.name]));
  const nick = new Map((profiles ?? []).map((p) => [p.id, p.nickname]));

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
            <TH>PIN / 2FA required</TH>
          </TR>
        </THead>
        <TBody>
          {(admins ?? []).map((admin) => {
            const roleLabels = (assignments ?? [])
              .filter((a) => a.admin_id === admin.id)
              .map((a) => roleName.get(a.role_id) ?? a.role_id)
              .join(", ");
            return (
              <TR key={admin.id}>
                <TD>
                  <div>{nick.get(admin.id) ?? admin.id}</div>
                  <div className="text-xs text-[var(--brand-muted)]">{admin.id}</div>
                </TD>
                <TD>{admin.is_active ? "active" : "disabled"}</TD>
                <TD>{admin.is_owner ? "yes" : "no"}</TD>
                <TD>{roleLabels || "—"}</TD>
                <TD>
                  {admin.requires_pin ? "PIN" : "no PIN"}
                  {admin.requires_2fa ? " · 2FA" : ""}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <Card>
        <CreateAdminForm
          roles={(roles ?? []).map((r) => ({ code: r.key, name: r.name }))}
        />
      </Card>
      <Card>
        <AdminRoleOverrideForms
          admins={(admins ?? []).map((a) => ({
            user_id: a.id,
            display_name: nick.get(a.id) ?? a.id,
          }))}
          roles={(roles ?? []).map((r) => ({ code: r.key, name: r.name }))}
        />
      </Card>
    </div>
  );
}
