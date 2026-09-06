/**
 * Structured logging + operational helpers.
 * Never log secrets, tokens, or full PII.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

const REDACT_KEYS = new Set([
  "password",
  "token",
  "authorization",
  "secret",
  "pin",
  "otp",
  "service_role",
  "jwt",
]);

function redact(fields?: LogFields): LogFields | undefined {
  if (!fields) return undefined;
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (REDACT_KEYS.has(key.toLowerCase())) {
      out[key] = "[redacted]";
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function logEvent(
  level: LogLevel,
  message: string,
  fields?: LogFields,
): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    message,
    ...redact(fields),
  };
  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function recordClientHealthHint(code: string, detail?: string): void {
  if (typeof window === "undefined") return;
  try {
    const key = "gikgok.health.hints";
    const prev = JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as Array<{
      code: string;
      detail?: string;
      at: string;
    }>;
    prev.unshift({ code, detail, at: new Date().toISOString() });
    window.sessionStorage.setItem(key, JSON.stringify(prev.slice(0, 20)));
  } catch {
    // ignore storage failures
  }
}
