import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { publicEnv } from "@/lib/env";
import { authCookieOptions } from "@/lib/supabase/cookie-options";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/confirm",
  "/auth/auth-code-error",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Refreshes the Supabase session on every request and gates every
 * non-public route behind authentication. Called from src/proxy.ts (the
 * Next.js 16 successor to middleware.ts -- same mechanism, renamed).
 *
 * Uses `getUser()`, not `getSession()`: `getUser()` revalidates the token
 * against Supabase Auth on every call instead of trusting the (spoofable)
 * cookie payload, which is the documented-safe way to authorize inside
 * proxy/middleware.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const env = publicEnv();
  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      // Adds `secure` in production; the session length is the library's,
      // not ours -- see cookie-options.ts.
      cookieOptions: authCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, { ...options, ...authCookieOptions });
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/forgot-password")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
