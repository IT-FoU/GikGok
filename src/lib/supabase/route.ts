import "server-only";

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { getClientEnv } from "@/lib/env/client";
import type { Database } from "@/lib/supabase/types";

/**
 * Route-handler / middleware-safe Supabase client.
 * Prefer createServerSupabaseClient() inside Server Components.
 */
export function createRouteSupabaseClient(request: NextRequest) {
  const env = getClientEnv();
  let response = NextResponse.next({ request });

  const client = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  return { client, response };
}
