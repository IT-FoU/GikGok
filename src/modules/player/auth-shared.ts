export type ActionResult =
  | { ok: true; message?: string; data?: Record<string, unknown> }
  | { ok: false; message: string; fieldErrors?: Record<string, string[]> };

export {
  AVATAR_PRESETS,
  AVATAR_MAX_BYTES,
  AVATAR_MIME_TYPES,
} from "./auth";
