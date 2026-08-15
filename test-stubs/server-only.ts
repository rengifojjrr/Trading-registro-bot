/**
 * Stub for the `server-only` package under Vitest.
 *
 * The real package throws on import so that server code can never be
 * bundled into a client chunk. That guarantee comes from Next's bundler,
 * which vitest does not run: here a client component legitimately importing
 * a server action pulls the action's whole module graph -- including
 * `server-only` -- into the same graph, and the real package would throw on
 * a boundary Next itself enforces correctly at build time.
 *
 * Stubbing it restores the ability to render client components in tests
 * without weakening anything in production, where the real package is still
 * what gets resolved.
 */
export {};
