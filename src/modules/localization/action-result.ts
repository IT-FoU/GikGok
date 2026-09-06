import type { ActionResult } from "@/modules/player/auth-shared";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/**
 * Resolve ActionResult to localized UI copy.
 * Prefer stable `code` (+ optional data params) over English server `message`.
 */
export function resolveActionMessage(
  t: Translate,
  state: ActionResult,
): string {
  if (state.code) {
    const data = "data" in state ? state.data : undefined;
    const params = data
      ? (Object.fromEntries(
          Object.entries(data).filter(
            ([, value]) =>
              typeof value === "string" || typeof value === "number",
          ),
        ) as Record<string, string | number>)
      : undefined;
    const keyed = t(`actionCodes.${state.code}`, params);
    if (keyed !== `actionCodes.${state.code}`) return keyed;
  }
  return state.message ?? "";
}
