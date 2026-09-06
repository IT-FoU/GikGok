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
import { AssetForm } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminAssetsPage() {
  await requireAdminSession("system.settings");
  const supabase = await createServerSupabaseClient();
  const { data: assets } = await supabase
    .from("asset_metadata")
    .select("id, bucket, path, kind, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Assets</CardTitle>
          <CardDescription>
            Metadata registry for icons, models, textures, and sounds.
          </CardDescription>
        </CardHeader>
        <AssetForm />
      </Card>
      <Table>
        <THead>
          <TR>
            <TH>Bucket</TH>
            <TH>Path</TH>
            <TH>Kind</TH>
            <TH>Rights</TH>
          </TR>
        </THead>
        <TBody>
          {(assets ?? []).map((asset) => {
            const meta = (asset.metadata ?? {}) as { rights_cleared?: boolean; key?: string };
            return (
              <TR key={asset.id}>
                <TD className="font-mono text-xs">{asset.bucket}</TD>
                <TD>{asset.path}</TD>
                <TD>{asset.kind}</TD>
                <TD>{meta.rights_cleared ? "cleared" : "pending"}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </div>
  );
}
