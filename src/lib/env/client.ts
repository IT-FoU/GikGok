import { z } from "zod";

/**
 * Public / browser-safe environment variables only.
 * Never put service-role keys or secrets here.
 */
export const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

export function parseClientEnv(
  source: Record<string, string | undefined> = process.env,
): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: source.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: source.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  return parsed.data;
}

let cached: ClientEnv | undefined;

/** Validated public env. Lazy so build-time tooling can load modules without secrets. */
export function getClientEnv(): ClientEnv {
  if (!cached) {
    cached = parseClientEnv();
  }
  return cached;
}

/** Test helper — clears the lazy cache between cases. */
export function resetClientEnvCache(): void {
  cached = undefined;
}
