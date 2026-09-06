import type { GameDefinition, GameId } from "./types";

export const GAME_DEFINITIONS: Record<GameId, GameDefinition> = {
  fish_prawn_crab: {
    id: "fish_prawn_crab",
    displayNameKey: "games.fpc.name",
    descriptionKey: "games.fpc.description",
    guideKey: "games.fpc.guide",
    minStake: 500,
    maxStake: 1_000_000,
    quickStakes: [500, 1000, 5000, 10_000],
    defaultConfigVersion: 1,
  },
  high_low: {
    id: "high_low",
    displayNameKey: "games.highlow.name",
    descriptionKey: "games.highlow.description",
    guideKey: "games.highlow.guide",
    minStake: 500,
    maxStake: 1_000_000,
    quickStakes: [500, 1000, 5000, 10_000],
    defaultConfigVersion: 1,
  },
  spinning_plate: {
    id: "spinning_plate",
    displayNameKey: "games.plate.name",
    descriptionKey: "games.plate.description",
    guideKey: "games.plate.guide",
    minStake: 500,
    maxStake: 1_000_000,
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
