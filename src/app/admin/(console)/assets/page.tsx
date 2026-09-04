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
    .select("key, kind, storage_path, rights_cleared, mime_type, byte_size")
    .is("deleted_at", null)
    .order("key");

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
            <TH>Key</TH>
            <TH>Kind</TH>
            <TH>Path</TH>
            <TH>Rights</TH>
          </TR>
        </THead>
        <TBody>
          {(assets ?? []).map((asset) => (
            <TR key={asset.key}>
              <TD className="font-mono text-xs">{asset.key}</TD>
              <TD>{asset.kind}</TD>
              <TD>{asset.storage_path ?? "—"}</TD>
              <TD>{asset.rights_cleared ? "cleared" : "pending"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
