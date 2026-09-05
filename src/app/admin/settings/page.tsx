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
import { AdminSecurityForms, SettingsForms } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const { session } = await requireAdminSession("system.settings");
  const supabase = await createServerSupabaseClient();
  const [{ data: settings }, { data: maintenance }] = await Promise.all([
    supabase.from("system_settings").select("key, value, description").order("key"),
    supabase.from("maintenance_state").select("*").eq("id", true).maybeSingle(),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>System settings</CardTitle>
          <CardDescription>
            Owner accent theme and credit knobs are system-wide. PIN / 2FA
            protects sensitive maintenance toggles.
          </CardDescription>
        </CardHeader>
        <p className="mb-4 text-sm text-[var(--brand-muted)]">
          Session: {session.display_name}
          {session.pin_set ? " · PIN set" : " · PIN not set"}
          {session.totp_enabled ? " · 2FA on" : ""}
        </p>
        <AdminSecurityForms />
      </Card>

      <Card>
        <CardDescription>
          Maintenance currently{" "}
          {maintenance?.is_maintenance ? "ACTIVE" : "inactive"}
        </CardDescription>
        <SettingsForms
          settings={(settings ?? []).map((s) => ({ key: s.key, value: s.value }))}
        />
      </Card>

      <Table>
        <THead>
          <TR>
            <TH>Key</TH>
            <TH>Value</TH>
            <TH>Description</TH>
          </TR>
        </THead>
        <TBody>
          {(settings ?? []).map((row) => (
            <TR key={row.key}>
              <TD className="font-mono text-xs">{row.key}</TD>
              <TD className="font-mono text-xs">
                {JSON.stringify(row.value)}
              </TD>
              <TD>{row.description ?? "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
