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
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requireAdminSession();
  const supabase = await createServerSupabaseClient();

  let dashboard: {
    pending_credit_requests?: number;
    open_tickets?: number;
    open_rounds?: number;
    active_players_15m?: number;
    games?: Array<{
      id: string;
      lifecycle_status: string;
      is_enabled: boolean;
    }>;
    health_events?: Array<{
      severity: string;
      code: string;
      message: string;
    }>;
    maintenance?: { is_active?: boolean };
    generated_at?: string;
  } = {};
  let errorMessage: string | null = null;

  const { data, error } = await supabase.rpc("get_admin_dashboard");
  if (error) {
    errorMessage = error.message;
  } else {
    dashboard = (data ?? {}) as typeof dashboard;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Operations dashboard</CardTitle>
          <CardDescription>
            Near-real-time queues, game status, and health. Demo credits only —
            no real-money rails.
          </CardDescription>
        </CardHeader>
        {errorMessage ? (
          <p className="text-sm text-red-400">{errorMessage}</p>
        ) : (
          <p className="text-xs text-[var(--brand-muted)]">
            Generated {dashboard.generated_at ?? "—"}
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Pending credits", dashboard.pending_credit_requests ?? 0],
          ["Open tickets", dashboard.open_tickets ?? 0],
          ["Open rounds", dashboard.open_rounds ?? 0],
          ["Active players (15m)", dashboard.active_players_15m ?? 0],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardDescription>{label}</CardDescription>
            <p className="font-display text-3xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Game status</h2>
        <Table>
          <THead>
            <TR>
              <TH>Game</TH>
              <TH>Lifecycle</TH>
              <TH>Enabled</TH>
            </TR>
          </THead>
          <TBody>
            {(dashboard.games ?? []).map((game) => (
              <TR key={game.id}>
                <TD>{game.id}</TD>
                <TD>{game.lifecycle_status}</TD>
                <TD>{game.is_enabled ? "yes" : "no"}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl font-semibold">Health</h2>
        <Card>
          <CardDescription>
            Maintenance:{" "}
            {dashboard.maintenance?.is_active ? "ACTIVE" : "inactive"}
          </CardDescription>
          {(dashboard.health_events ?? []).length === 0 ? (
            <p className="text-sm text-[var(--brand-muted)]">No open health events.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(dashboard.health_events ?? []).map((event, index) => (
                <li key={`${event.code}-${index}`}>
                  [{event.severity}] {event.code}: {event.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
