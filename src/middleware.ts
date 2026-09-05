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
]);

const AUTH_ONLY_PATHS = new Set(["/login", "/register", "/forgot-password"]);

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (pathname.startsWith("/admin")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Without env, skip auth gating so local static pages still render.
  if (!supabaseUrl || !supabaseKey) {
    return response;
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
        response = NextResponse.next({ request });
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
    return NextResponse.redirect(url);
  }

  if (!isPublicPath(pathname) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/home" || pathname.startsWith("/profile"))) {
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

    if (!access.has_profile) {
      const url = request.nextUrl.clone();
      url.pathname = "/register";
      return NextResponse.redirect(url);
    }

    if (access.deletion_requested || access.status === "deletion_requested") {
      const url = request.nextUrl.clone();
      url.pathname = "/account-status";
      url.searchParams.set("reason", "deletion_requested");
      return NextResponse.redirect(url);
    }

    if (access.status === "banned") {
      const url = request.nextUrl.clone();
      url.pathname = "/account-status";
      url.searchParams.set("reason", "banned");
      return NextResponse.redirect(url);
    }

    if (access.status === "suspended") {
      const url = request.nextUrl.clone();
      url.pathname = "/account-status";
      url.searchParams.set("reason", "suspended");
      return NextResponse.redirect(url);
    }

    if (!access.verified) {
      const url = request.nextUrl.clone();
      url.pathname = "/verify";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
