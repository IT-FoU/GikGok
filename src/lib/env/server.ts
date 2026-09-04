import "server-only";

import { z } from "zod";

import { getClientEnv, parseClientEnv } from "./client";

/**
 * Server-only environment variables.
 * Never import this module from Client Components or browser bundles.
 */
export const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  ADMIN_SESSION_SECRET: z.string().min(32).optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema> &
  ReturnType<typeof getClientEnv>;

export function parseServerEnv(
  source: Record<string, string | undefined> = process.env,
): ServerEnv {
  const publicEnv = parseClientEnv(source);
  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: source.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: source.SUPABASE_JWT_SECRET,
    ADMIN_SESSION_SECRET: source.ADMIN_SESSION_SECRET,
    NODE_ENV: source.NODE_ENV,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return { ...publicEnv, ...parsed.data };
}

let cached: ServerEnv | undefined;

/** Validated server env. Lazy so scripts can import without failing early. */
export function getServerEnv(): ServerEnv {
  if (!cached) {
    cached = parseServerEnv();
  }
  return cached;
}

/** Test helper — clears the lazy cache between cases. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
