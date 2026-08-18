/**
 * Cookie options for the Supabase auth cookies.
 *
 * A note on session length, because it is easy to assume this file controls
 * it and it does not: @supabase/ssr already sets maxAge to 400 days and
 * then *overwrites* whatever you pass, on purpose --
 *
 *     const setCookieOptions = {
 *       ...DEFAULT_COOKIE_OPTIONS,
 *       ...options?.cookieOptions,
 *       maxAge: DEFAULT_COOKIE_OPTIONS.maxAge,
 *     };
 *
 * 400 days is the ceiling Chrome enforces on cookie lifetime anyway, so the
 * session already lasts as long as a browser will allow. Anyone arriving
 * here to make logins less frequent should look at the Supabase project's
 * Auth settings (session timebox, inactivity timeout) instead -- those live
 * outside this repository.
 *
 * What this file does add is `secure`. The library's defaults set path,
 * sameSite, httpOnly and maxAge but not `secure`, which means nothing stops
 * the session cookie travelling over plain HTTP. For a private financial
 * journal that is worth closing, even with HSTS already in place.
 */
export const authCookieOptions = {
  // Only meaningful in the deployment; local development is plain HTTP and
  // would refuse to keep a secure cookie.
  secure: process.env.NODE_ENV === "production",
  // Lax rather than Strict so following a link into the app (an email, a
  // bookmark, the home-screen icon) still arrives signed in.
  sameSite: "lax",
  path: "/",
} as const;
