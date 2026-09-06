import Link from "next/link";

import { AdminGameControls } from "@/modules/game-engine/ui";
import { listGameDefinitions } from "@/modules/game-engine";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/modules/admin/guards";

export const dynamic = "force-dynamic";

const DISPLAY_NAMES: Record<string, string> = {
  fish_prawn_crab: "Fish–Prawn–Crab",
  high_low: "High–Low Dice",
  spinning_plate: "Spinning Plate",
};

export default async function AdminGamesPage() {
  await requireAdminSession("games.view");
  let rows: Array<{
    key: string;
    name: string;
    is_enabled: boolean;
    status: string;
    maintenance_message: string | null;
    min_stake: number;
    max_stake: number | null;
  }> = [];
  let errorMessage: string | null = null;

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("games")
      .select(
        "key, name, is_enabled, status, maintenance_message, min_stake, max_stake",
      )
      .in("key", listGameDefinitions().map((g) => g.id))
      .order("key");

    if (error) {
      errorMessage = error.message;
    } else {
      rows = data ?? [];
    }
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unable to load games";
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
      <div>
        <p className="text-sm text-[var(--brand-muted)]">
          <Link href="/admin" className="underline-offset-4 hover:underline">
            ← Admin
          </Link>
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-[var(--brand-accent)]">
          Game control
        </h2>
        <p className="mt-2 text-sm text-[var(--brand-muted)]">
          Availability, smooth maintenance close, and controlled-demo setup.
          Requires <code>games.control</code>. Outcomes stay server-side.
        </p>
      </div>

      {errorMessage ? (
        <p className="text-sm text-red-400" role="alert">
          {errorMessage}
        </p>
      ) : (
        <ul className="space-y-3 text-sm">
          {rows.map((game) => (
            <li
              key={game.key}
              className="rounded-md border border-[var(--brand-border)] p-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">
                  {DISPLAY_NAMES[game.key] ?? game.name}
                </p>
                <p className="text-[var(--brand-muted)]">
                  {game.status} · {game.is_enabled ? "enabled" : "disabled"}
                </p>
              </div>
              <p className="mt-1 text-[var(--brand-muted)]">
                Stake {game.min_stake.toLocaleString()}–
                {(game.max_stake ?? 0).toLocaleString()} GIK
              </p>
              {game.maintenance_message ? (
                <p className="mt-1 text-amber-200">{game.maintenance_message}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <AdminGameControls />
    </div>
  );
}
