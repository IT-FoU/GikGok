import en from "./messages/en.json";
import lo from "./messages/lo.json";

export type AppLocale = "lo" | "en";

/** Reserved for future Thai catalog without refactoring module boundaries. */
export const FUTURE_LOCALES = ["th"] as const;
export type FutureLocale = (typeof FUTURE_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "lo";
export const SUPPORTED_LOCALES: readonly AppLocale[] = ["lo", "en"] as const;

export const LOCALIZATION_MODULE = "localization" as const;

export type MessageCatalog = typeof en;

const catalogs: Record<AppLocale, MessageCatalog> = {
  en,
  lo: lo as MessageCatalog,
};

export function isAppLocale(value: unknown): value is AppLocale {
  return value === "lo" || value === "en";
}

export function getCatalog(locale: AppLocale): MessageCatalog {
  return catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
}

type DotPaths<T, Prefix extends string = ""> = T extends string
  ? Prefix
  : {
      [K in keyof T & string]: DotPaths<
        T[K],
        Prefix extends "" ? K : `${Prefix}.${K}`
      >;
    }[keyof T & string];

export type MessageKey = DotPaths<MessageCatalog>;

function getByPath(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : undefined;
}

export function translate(
  locale: AppLocale,
  key: MessageKey | string,
  params?: Record<string, string | number>,
): string {
  const catalog = getCatalog(locale);
  let template =
    getByPath(catalog, key) ?? getByPath(catalogs.en, key) ?? key;

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      template = template.replaceAll(`{${name}}`, String(value));
    }
  }

  return template;
}

export function createTranslator(locale: AppLocale) {
  return (
    key: MessageKey | string,
    params?: Record<string, string | number>,
  ) => translate(locale, key, params);
}
