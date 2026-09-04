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
import { PlayerStatusForm } from "@/modules/admin/ui";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireAdminSession("players.view");
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();

  const { data: players, error } = await supabase.rpc("search_players_admin", {
    p_query: params.q ?? null,
    p_status: (params.status as "active" | "suspended" | "banned" | null) ?? null,
    p_limit: 50,
  });

  const rows = players ?? [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Players</CardTitle>
          <CardDescription>
            Search profiles, review activity balances, and apply safe
            suspension/ban with audited reasons.
          </CardDescription>
        </CardHeader>
        <form className="flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Nickname, email, phone, id"
            className="min-w-[220px] flex-1 rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-md border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2 text-sm"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-[var(--brand-accent)] px-4 py-2 text-sm text-black"
          >
            Search
          </button>
        </form>
      </Card>

      {error ? <p className="text-sm text-red-400">{error.message}</p> : null}

      <Table>
        <THead>
          <TR>
            <TH>Nickname</TH>
            <TH>Status</TH>
            <TH>Balance</TH>
            <TH>Last activity</TH>
            <TH>QA</TH>
          </TR>
        </THead>
        <TBody>
          {rows.map((player) => (
            <TR key={player.id}>
              <TD>
                <div>{player.nickname}</div>
                <div className="text-xs text-[var(--brand-muted)]">{player.id}</div>
              </TD>
              <TD>{player.status}</TD>
              <TD>{Number(player.balance).toLocaleString()} GIK</TD>
              <TD>{player.last_activity_at ?? "—"}</TD>
              <TD>{player.is_qa ? "yes" : "no"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Card>
        <PlayerStatusForm
          players={rows.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            status: p.status,
          }))}
        />
      </Card>
    </div>
  );
}
