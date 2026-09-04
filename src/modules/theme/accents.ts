export const ACCENT_THEMES = [
  "green",
  "red_white",
  "blue_white",
  "yellow_gray",
] as const;

export type AccentTheme = (typeof ACCENT_THEMES)[number];
export type ColorMode = "system" | "light" | "dark";
export type ResolvedColorMode = "light" | "dark";

export function isAccentTheme(value: unknown): value is AccentTheme {
  return (
    typeof value === "string" &&
    (ACCENT_THEMES as readonly string[]).includes(value)
  );
}

export function resolveColorMode(
  preference: ColorMode,
  systemPrefersDark: boolean,
): ResolvedColorMode {
  if (preference === "light" || preference === "dark") return preference;
  return systemPrefersDark ? "dark" : "light";
}

/** Owner-controlled accent only — never accept player-submitted accent changes. */
export function sanitizeAccentTheme(
  value: unknown,
  fallback: AccentTheme = "green",
): AccentTheme {
  return isAccentTheme(value) ? value : fallback;
}
