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
        .select("key, name, goal_target, reward_amount, is_active")
        .order("key"),
      supabase
        .from("achievements")
        .select("key, name, is_active, icon")
        .order("key"),
      supabase
        .from("leaderboard_entries")
        .select("board, player_id, nickname, metric_value, rank")
        .order("rank", { ascending: true })
        .limit(30),
    ]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Missions, badges & leaderboard</CardTitle>
          <CardDescription>
            Configure engagement content. Leaderboard shows nickname/avatar metrics only.
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
                <TH>Key</TH>
                <TH>Target</TH>
                <TH>Reward</TH>
              </TR>
            </THead>
            <TBody>
              {(missions ?? []).map((m) => (
                <TR key={m.key}>
                  <TD>{m.key}</TD>
                  <TD>{m.goal_target}</TD>
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
                <TH>Key</TH>
                <TH>Enabled</TH>
                <TH>Icon</TH>
              </TR>
            </THead>
            <TBody>
              {(achievements ?? []).map((a) => (
                <TR key={a.key}>
                  <TD>{a.key}</TD>
                  <TD>{a.is_active ? "yes" : "no"}</TD>
                  <TD>{a.icon ?? "—"}</TD>
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
              <TH>Board</TH>
              <TH>Nickname</TH>
              <TH>Score</TH>
              <TH>Rank</TH>
            </TR>
          </THead>
          <TBody>
            {(boards ?? []).map((row, i) => (
              <TR key={`${row.board}-${row.player_id}-${i}`}>
                <TD>{row.board}</TD>
                <TD>{row.nickname}</TD>
                <TD>{row.metric_value}</TD>
                <TD>{row.rank ?? "—"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
