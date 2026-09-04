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
import { ReleaseAdvanceForm } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminGameReleasesPage() {
  const { session } = await requireAdminSession("games.control");
  const supabase = await createServerSupabaseClient();
  const { data: games } = await supabase
    .from("games")
    .select("id, lifecycle_status, is_enabled, scheduled_launch_at")
    .is("deleted_at", null)
    .order("id");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Game release workflow</CardTitle>
          <CardDescription>
            Draft → QA → Owner Approved → Scheduled → Live → Disabled. Owner-only
            steps: owner_approved and live.
            {session.is_owner ? " You are Owner." : " Non-owners cannot finalize."}
          </CardDescription>
        </CardHeader>
        <ReleaseAdvanceForm
          games={(games ?? []).map((g) => ({
            id: g.id,
            lifecycle_status: g.lifecycle_status,
          }))}
        />
      </Card>
      <Table>
        <THead>
          <TR>
            <TH>Game</TH>
            <TH>Lifecycle</TH>
            <TH>Enabled</TH>
            <TH>Scheduled</TH>
          </TR>
        </THead>
        <TBody>
          {(games ?? []).map((game) => (
            <TR key={game.id}>
              <TD>{game.id}</TD>
              <TD>{game.lifecycle_status}</TD>
              <TD>{game.is_enabled ? "yes" : "no"}</TD>
              <TD>{game.scheduled_launch_at ?? "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
