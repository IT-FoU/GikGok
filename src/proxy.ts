import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/register",
  "/verify",
  "/reset-password",
  "/forgot-password",
  "/account-status",
  "/guide",
  "/api/health",
  "/manifest.webmanifest",
  "/sw.js",
  "/admin/access-denied",
]);

const AUTH_ONLY_PATHS = new Set(["/login", "/register", "/forgot-password"]);


function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  // Script uses nonce + strict-dynamic (Next 16 App Router compatible).
  // Style keeps 'unsafe-inline' — Tailwind/runtime style injection is not yet
  // fully nonce-wired; do not claim style XSS protection beyond self+inline.
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}

function withSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("x-nonce", nonce);
  return response;
}

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/icons/")) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", buildCsp(nonce));

  let response = withSecurityHeaders(
    NextResponse.next({ request: { headers: requestHeaders } }),
    nonce,
  );

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Without env, skip auth gating so local static pages still render.
  if (!supabaseUrl || !supabaseKey) {
    return withSecurityHeaders(response, nonce);
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = withSecurityHeaders(
          NextResponse.next({ request: { headers: requestHeaders } }),
          nonce,
        );
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && AUTH_ONLY_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    return withSecurityHeaders(NextResponse.redirect(url), nonce);
  }

  if (!isPublicPath(pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return withSecurityHeaders(NextResponse.redirect(url), nonce);
  }

  // Convenience redirects only — DB RPCs remain authoritative.
  const playerAppPath =
    user &&
    !isPublicPath(pathname) &&
    !pathname.startsWith("/admin") &&
    !pathname.startsWith("/api/");

  if (playerAppPath) {
    const { data } = await supabase.rpc("get_player_access_state", {
      p_user_id: user.id,
    });
    const access = (data ?? {}) as {
      can_play?: boolean;
      verified?: boolean;
      status?: string;
      deletion_requested?: boolean;
      has_profile?: boolean;
    };

    if (!access.has_profile && pathname !== "/register") {
      const url = request.nextUrl.clone();
      url.pathname = "/register";
      return withSecurityHeaders(NextResponse.redirect(url), nonce);
    }

    if (access.deletion_requested || access.status === "deletion_requested") {
      const url = request.nextUrl.clone();
      url.pathname = "/account-status";
      url.searchParams.set("reason", "deletion_requested");
      return withSecurityHeaders(NextResponse.redirect(url), nonce);
    }

    if (access.status === "banned") {
      const url = request.nextUrl.clone();
      url.pathname = "/account-status";
      url.searchParams.set("reason", "banned");
      return withSecurityHeaders(NextResponse.redirect(url), nonce);
    }

    if (access.status === "suspended") {
      const url = request.nextUrl.clone();
      url.pathname = "/account-status";
      url.searchParams.set("reason", "suspended");
      return withSecurityHeaders(NextResponse.redirect(url), nonce);
    }

    if (
      !access.verified &&
      pathname !== "/verify" &&
      pathname !== "/register"
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify";
      return withSecurityHeaders(NextResponse.redirect(url), nonce);
    }
  }

  return withSecurityHeaders(response, nonce);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
