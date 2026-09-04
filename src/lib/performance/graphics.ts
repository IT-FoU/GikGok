/**
 * Shared WebGL / graphics capability detection for 2D fallback.
 */

export type GraphicsModePreference = "auto" | "2d" | "3d";

export function detectWebGLSupport(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * Resolves effective renderer mode.
 * No-WebGL and forced-2d always yield 2d; auto prefers 3d when available.
 */
export function resolveGraphicsMode(
  preference: GraphicsModePreference,
  hasWebGL: boolean = detectWebGLSupport(),
): "2d" | "3d" {
  if (preference === "2d") return "2d";
  if (preference === "3d") return hasWebGL ? "3d" : "2d";
  return hasWebGL ? "3d" : "2d";
}

/** Soft performance budgets used by docs + smoke checks. */
export const PERFORMANCE_BUDGETS = {
  firstContentfulPaintMs: 2500,
  largestContentfulPaintMs: 4000,
  jsBundleSoftMaxKb: 900,
  textureSoftMaxKb: 512,
  audioClipSoftMaxKb: 256,
} as const;
