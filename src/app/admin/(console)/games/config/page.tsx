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
import { GameConfigForm } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminGameConfigPage() {
  await requireAdminSession("games.configure");
  const supabase = await createServerSupabaseClient();
  const [{ data: games }, { data: versions }] = await Promise.all([
    supabase.from("games").select("id").is("deleted_at", null).order("id"),
    supabase
      .from("game_versions")
      .select("id, game_id, version, is_active, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Game configuration</CardTitle>
          <CardDescription>
            Versioned configs apply to future rounds only. Activating a version
            does not rewrite locked or settled rounds.
          </CardDescription>
        </CardHeader>
        <GameConfigForm gameIds={(games ?? []).map((g) => g.id)} />
      </Card>
      <Table>
        <THead>
          <TR>
            <TH>Game</TH>
            <TH>Version</TH>
            <TH>Active</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {(versions ?? []).map((v) => (
            <TR key={v.id}>
              <TD>{v.game_id}</TD>
              <TD>{v.version}</TD>
              <TD>{v.is_active ? "yes" : "no"}</TD>
              <TD>{v.created_at}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
