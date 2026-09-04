import Link from "next/link";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminGameControls } from "@/modules/game-engine/ui";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminGamesPage() {
  let games: Array<{
    id: string;
    lifecycle_status: string;
    is_enabled: boolean;
    maintenance_close_started_at: string | null;
  }> = [];
  let rounds: Array<{
    id: string;
    game_id: string;
    status: string;
    settlement_mode: string;
    opened_at: string;
  }> = [];
  let errorMessage: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const [{ data: gameRows }, { data: roundRows }] = await Promise.all([
      supabase
        .from("games")
        .select(
          "id, lifecycle_status, is_enabled, maintenance_close_started_at",
        )
        .order("id"),
      supabase
        .from("game_rounds")
        .select("id, game_id, status, settlement_mode, opened_at")
        .eq("status", "open")
        .order("opened_at", { ascending: false })
        .limit(20),
    ]);
    games = gameRows ?? [];
    rounds = roundRows ?? [];
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load games";
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/admin" className="underline-offset-4 hover:underline">
            ← Admin
          </Link>
        </p>
        <h1 className="font-display text-3xl font-semibold text-[var(--brand-accent)]">
          Game engine controls
        </h1>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Open random or controlled-demo rounds before play. Controlled demo is
          auditable and never silently applied to locked normal rounds.
        </p>
      </div>

      {errorMessage ? (
        <Card>
          <CardDescription>{errorMessage}</CardDescription>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Availability & rounds</CardTitle>
          <CardDescription>
            Requires games.control (or games.configure for availability).
          </CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">
          <AdminGameControls />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current games</CardTitle>
        </CardHeader>
        <ul className="space-y-2 px-6 pb-6 text-sm">
          {games.map((game) => (
            <li key={game.id}>
              <span className="font-medium">{game.id}</span> —{" "}
              {game.lifecycle_status} /{" "}
              {game.is_enabled ? "enabled" : "disabled"}
              {game.maintenance_close_started_at
                ? " (maintenance close)"
                : ""}
            </li>
          ))}
          {games.length === 0 ? (
            <li className="text-[var(--brand-muted)]">No games loaded.</li>
          ) : null}
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Open rounds</CardTitle>
        </CardHeader>
        <ul className="space-y-2 px-6 pb-6 text-sm">
          {rounds.map((round) => (
            <li key={round.id}>
              {round.game_id} · {round.settlement_mode} · opened{" "}
              {new Date(round.opened_at).toLocaleString()}
            </li>
          ))}
          {rounds.length === 0 ? (
            <li className="text-[var(--brand-muted)]">
              No open rounds (players auto-open random rounds on first bet).
            </li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}
