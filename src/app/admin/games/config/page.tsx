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
    supabase.from("games").select("id, key, name, active_version_id").order("key"),
    supabase
      .from("game_versions")
      .select("id, game_id, version, is_published, created_at")
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const keyById = new Map((games ?? []).map((g) => [g.id, g.key]));

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
        <GameConfigForm gameIds={(games ?? []).map((g) => g.key)} />
      </Card>
      <Table>
        <THead>
          <TR>
            <TH>Game</TH>
            <TH>Version</TH>
            <TH>Published</TH>
            <TH>Created</TH>
          </TR>
        </THead>
        <TBody>
          {(versions ?? []).map((v) => (
            <TR key={v.id}>
              <TD>{keyById.get(v.game_id) ?? v.game_id}</TD>
              <TD>{v.version}</TD>
              <TD>{v.is_published ? "yes" : "no"}</TD>
              <TD>{v.created_at}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
