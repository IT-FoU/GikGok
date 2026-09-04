/**
 * Game engine: definitions, bet validation, idempotency, settlement contracts.
 * Browser renderers reveal server-authoritative results only — never compute outcomes.
 */
export type GameId = "fish-prawn-crab" | "high-low" | "spinning-plate";

export type SettlementMode = "random" | "controlled_demo";

export interface GameDefinition {
  id: GameId;
  version: string;
  displayNameKey: string;
  enabled: boolean;
}

export const GAME_ENGINE_MODULE = "game-engine" as const;
