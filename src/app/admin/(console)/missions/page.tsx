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
import { MissionBadgeForms } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminMissionsPage() {
  await requireAdminSession("system.settings");
  const supabase = await createServerSupabaseClient();
  const [{ data: missions }, { data: achievements }, { data: boards }] =
    await Promise.all([
      supabase
        .from("missions")
        .select("code, target_count, reward_amount, is_enabled")
        .is("deleted_at", null)
        .order("code"),
      supabase
        .from("achievements")
        .select("code, is_enabled, badge_asset_key")
        .is("deleted_at", null)
        .order("code"),
      supabase
        .from("leaderboard_projections")
        .select("metric, player_id, score, rank")
        .order("score", { ascending: false })
        .limit(30),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Missions, badges & leaderboard</CardTitle>
          <CardDescription>
            Configure engagement content. Leaderboard rows are projections only.
          </CardDescription>
        </CardHeader>
        <MissionBadgeForms />
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle className="mb-3 text-lg">Missions</CardTitle>
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Target</TH>
                <TH>Reward</TH>
              </TR>
            </THead>
            <TBody>
              {(missions ?? []).map((m) => (
                <TR key={m.code}>
                  <TD>{m.code}</TD>
                  <TD>{m.target_count}</TD>
                  <TD>{m.reward_amount}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <Card>
          <CardTitle className="mb-3 text-lg">Achievements</CardTitle>
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Enabled</TH>
                <TH>Badge</TH>
              </TR>
            </THead>
            <TBody>
              {(achievements ?? []).map((a) => (
                <TR key={a.code}>
                  <TD>{a.code}</TD>
                  <TD>{a.is_enabled ? "yes" : "no"}</TD>
                  <TD>{a.badge_asset_key ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </section>

      <Card>
        <CardTitle className="mb-3 text-lg">Leaderboard snapshot</CardTitle>
        <Table>
          <THead>
            <TR>
              <TH>Metric</TH>
              <TH>Player</TH>
              <TH>Score</TH>
              <TH>Rank</TH>
            </TR>
          </THead>
          <TBody>
            {(boards ?? []).map((row, i) => (
              <TR key={`${row.metric}-${row.player_id}-${i}`}>
                <TD>{row.metric}</TD>
                <TD className="font-mono text-xs">{row.player_id}</TD>
                <TD>{row.score}</TD>
                <TD>{row.rank ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
