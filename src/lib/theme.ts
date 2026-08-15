/**
 * Theme constants, in a module with no "use client" and no server-only
 * import -- both the root layout (server) and the toggle (client) read
 * them.
 *
 * This split is not stylistic. Importing a value from a "use client" module
 * into a Server Component hands back a client reference rather than the
 * value itself, so the cookie name silently stopped matching and the theme
 * never applied. Same failure this codebase already hit with
 * lib/analytics/trade-sort.ts and lib/audit/actions.ts.
 */

export type Theme = "dark" | "light";

/**
 * A cookie rather than localStorage, because the root layout resolves the
 * theme on the server -- that is what puts the right palette in the first
 * byte of HTML instead of applying it after hydration and flashing.
 *
 * Lax and non-HttpOnly on purpose: it is a display preference, has to be
 * readable by the toggle, and carries nothing sensitive.
 */
export const THEME_COOKIE = "trading-registro-theme";

/** Applied to <html>; the light palette in globals.css hangs off it. */
export const THEME_LIGHT_CLASS = "theme-light";

export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "dark";
}
