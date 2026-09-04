/**
 * Player product module: auth, profile, settings, and future engagement surfaces.
 * Routes live under `src/app/(player)`.
 */
export const PLAYER_MODULE = "player" as const;

export {
  AVATAR_PRESETS,
  resolvePlayerGate,
  validateAvatarFile,
  registerSchema,
  loginSchema,
} from "./auth";
