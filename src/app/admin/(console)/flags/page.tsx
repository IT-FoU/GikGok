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
import { FeatureFlagForm } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminFlagsPage() {
  await requireAdminSession("system.settings");
  const supabase = await createServerSupabaseClient();
  const { data: flags } = await supabase
    .from("feature_flags")
    .select("key, enabled, description, payload, updated_at")
    .order("key");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Feature flags</CardTitle>
          <CardDescription>Toggle engagement and game capabilities.</CardDescription>
        </CardHeader>
        <FeatureFlagForm
          flags={(flags ?? []).map((f) => ({ key: f.key, enabled: f.enabled }))}
        />
      </Card>
      <Table>
        <THead>
          <TR>
            <TH>Key</TH>
            <TH>Enabled</TH>
            <TH>Description</TH>
          </TR>
        </THead>
        <TBody>
          {(flags ?? []).map((flag) => (
            <TR key={flag.key}>
              <TD className="font-mono text-xs">{flag.key}</TD>
              <TD>{flag.enabled ? "on" : "off"}</TD>
              <TD>{flag.description}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
