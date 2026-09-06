export type ActionResult =
  | {
      ok: true;
      message?: string;
      /** Stable machine code resolved to localized copy at the UI boundary. */
      code?: string;
      data?: Record<string, unknown>;
    }
  | {
      ok: false;
      message: string;
      /** Stable machine code resolved to localized copy at the UI boundary. */
      code?: string;
      fieldErrors?: Record<string, string[]>;
    };

export {
  AVATAR_PRESETS,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
} from "./auth";
