/**
 * Player product module: Welcome, Home, games shell, profile, missions, tickets.
 * Routes live under `src/app/(player)`.
 */
export const PLAYER_MODULE = "player" as const;
export * from "./auth";
export * from "./auth-shared";
export {
  registerAction,
  loginAction,
  logoutAction,
  verifyOtpAction,
  requestPasswordResetAction,
  updatePasswordAction,
  updateProfileAction,
  updateSettingsAction,
  uploadAvatarAction,
  requestDeletionAction,
} from "./actions";
