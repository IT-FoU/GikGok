/**
 * Security helpers: origin checks, file validation, secret-scan patterns.
 * Used by API routes, server actions, and unit tests — no offensive tooling.
 */

export const SECURITY_MODULE = "security" as const;

export const FORBIDDEN_BROWSER_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_JWT_SECRET",
  "ADMIN_SESSION_SECRET",
  "DATABASE_URL",
  "POSTGRES_PASSWORD",
] as const;

export const ALLOWED_UPLOAD_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const UPLOAD_MAX_BYTES = {
  avatar: 2 * 1024 * 1024,
  ticketAttachment: 5 * 1024 * 1024,
} as const;

export type OriginCheckResult =
  | { ok: true }
  | { ok: false; reason: "missing_origin" | "mismatch" };

/**
 * Same-origin check for mutating browser requests.
 * Allows missing Origin in non-browser clients when NODE_ENV !== production
 * only if explicitly opted in via allowMissingInDev.
 */
export function assertSameOrigin(
  request: {
    headers: { get(name: string): string | null };
  },
  options?: {
    appUrl?: string | null;
    allowMissingInDev?: boolean;
    nodeEnv?: string;
  },
): OriginCheckResult {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const appUrl = (options?.appUrl ?? process.env.NEXT_PUBLIC_APP_URL ?? "")
    .replace(/\/$/, "");
  const nodeEnv = options?.nodeEnv ?? process.env.NODE_ENV ?? "development";

  const candidate = origin ?? (referer ? new URL(referer).origin : null);

  if (!candidate) {
    if (options?.allowMissingInDev && nodeEnv !== "production") {
      return { ok: true };
    }
    return { ok: false, reason: "missing_origin" };
  }

  if (appUrl) {
    try {
      const expected = new URL(appUrl).origin;
      if (candidate !== expected) {
        return { ok: false, reason: "mismatch" };
      }
      return { ok: true };
    } catch {
      // fall through to host comparison below
    }
  }

  // Without NEXT_PUBLIC_APP_URL, accept only when Origin host matches Host header.
  const host = request.headers.get("host");
  if (host && candidate.includes(host)) {
    return { ok: true };
  }

  return { ok: false, reason: "mismatch" };
}

/** Throws when the request Origin/Referer is not same-origin with the app. */
export function requireSameOrigin(
  request: {
    headers: { get(name: string): string | null };
  },
  options?: Parameters<typeof assertSameOrigin>[1],
): void {
  const result = assertSameOrigin(request, options);
  if (!result.ok) {
    throw new Error(
      result.reason === "missing_origin"
        ? "Missing Origin/Referer on mutating request."
        : "Cross-origin mutating request blocked.",
    );
  }
}

export function validateUploadFile(input: {
  type: string;
  size: number;
  maxBytes?: number;
  allowedMime?: readonly string[];
}): { ok: true } | { ok: false; message: string } {
  const allowed = input.allowedMime ?? ALLOWED_UPLOAD_MIME;
  const max = input.maxBytes ?? UPLOAD_MAX_BYTES.avatar;
  if (!allowed.includes(input.type)) {
    return { ok: false, message: "Unsupported file type." };
  }
  if (input.size <= 0 || input.size > max) {
    return { ok: false, message: `File must be between 1 byte and ${max} bytes.` };
  }
  return { ok: true };
}

/** Detect accidental secret-looking keys in a flat env-like object. */
export function findExposedSecretKeys(
  source: Record<string, string | undefined>,
): string[] {
  return FORBIDDEN_BROWSER_ENV_KEYS.filter((key) => {
    const value = source[key];
    return typeof value === "string" && value.length > 0;
  });
}

export function sanitizeUserErrorMessage(
  message: string,
  fallback = "Something went wrong. Please try again.",
): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("password") ||
    lower.includes("secret") ||
    lower.includes("service_role") ||
    lower.includes("jwt") ||
    lower.includes("stack") ||
    lower.includes("exception")
  ) {
    return fallback;
  }
  if (message.length > 240) {
    return fallback;
  }
  return message;
}
