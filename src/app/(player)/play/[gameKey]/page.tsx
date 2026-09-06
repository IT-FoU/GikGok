import { notFound, redirect } from "next/navigation";

/** Friendly hyphen aliases → staging underscore GameId routes. */
const ALIASES: Record<string, string> = {
  "fish-prawn-crab": "fish_prawn_crab",
  "high-low": "high_low",
  "spinning-plate": "spinning_plate",
};

/**
 * Catch-all for aliased / unknown play keys.
 * Dedicated pages live at `/play/fish_prawn_crab`, `/play/high_low`, `/play/spinning_plate`.
 */
export default async function PlayGameAliasPage({
  params,
}: {
  params: Promise<{ gameKey: string }>;
}) {
  const { gameKey } = await params;

  if (ALIASES[gameKey]) {
    redirect(`/play/${ALIASES[gameKey]}`);
  }

  notFound();
}
