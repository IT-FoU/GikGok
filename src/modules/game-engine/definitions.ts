import type { GameDefinition, GameId } from "./types";

export const GAME_DEFINITIONS: Record<GameId, GameDefinition> = {
  "fish-prawn-crab": {
    id: "fish-prawn-crab",
    displayNameKey: "games.fpc.name",
    descriptionKey: "games.fpc.description",
    guideKey: "games.fpc.guide",
    minStake: 500,
    maxStake: 100_000,
    quickStakes: [500, 1000, 5000, 10_000],
    defaultConfigVersion: 1,
  },
  "high-low": {
    id: "high-low",
    displayNameKey: "games.highlow.name",
    descriptionKey: "games.highlow.description",
    guideKey: "games.highlow.guide",
    minStake: 500,
    maxStake: 100_000,
    quickStakes: [500, 1000, 5000, 10_000],
    defaultConfigVersion: 1,
  },
  "spinning-plate": {
    id: "spinning-plate",
    displayNameKey: "games.plate.name",
    descriptionKey: "games.plate.description",
    guideKey: "games.plate.guide",
    minStake: 500,
    maxStake: 100_000,
    quickStakes: [500, 1000, 5000, 10_000],
    defaultConfigVersion: 1,
  },
};

export function getGameDefinition(gameId: GameId): GameDefinition {
  return GAME_DEFINITIONS[gameId];
}

export function listGameDefinitions(): GameDefinition[] {
  return Object.values(GAME_DEFINITIONS);
}
