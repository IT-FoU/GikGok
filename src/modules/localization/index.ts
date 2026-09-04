/**
 * Localization: Lao + English first; Thai-ready catalog layout.
 */
export type AppLocale = "lo" | "en";

export const DEFAULT_LOCALE: AppLocale = "lo";
export const SUPPORTED_LOCALES: readonly AppLocale[] = ["lo", "en"] as const;

/** Reserved for a future Thai catalog without refactoring module boundaries. */
export const FUTURE_LOCALES = ["th"] as const;

export const LOCALIZATION_MODULE = "localization" as const;
