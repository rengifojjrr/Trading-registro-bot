import { z } from "zod";

/**
 * Every environment variable the app reads goes through this file. Nothing
 * else should call `process.env` directly outside of this module and the
 * two Coinbase/Notion secret readers in lib/coinbase and lib/notion, which
 * re-use the `serverEnv` schema below. Centralizing this means a missing or
 * malformed value fails fast at boot with a clear message instead of
 * surfacing as a confusing runtime error deep in a request.
 */

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

// Server-only secrets. Never import `serverEnv` from a "use client" file --
// `serverEnv()` throws if called from the browser bundle as a defense in
// depth (see the runtime check below), but keeping the import server-side
// only is the real boundary.
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Coinbase Developer Platform key, "view"-only scope. Both are required
  // together once Coinbase sync (Phase 2+) is wired up; Phase 1 never reads
  // them.
  COINBASE_CDP_API_KEY_NAME: z.string().min(1).optional(),
  COINBASE_CDP_PRIVATE_KEY: z.string().min(1).transform(normalizePemKey).optional(),
  COINBASE_PRODUCT_VENUE: z.enum(["FCM", "INTX"]).default("FCM"),
  COINBASE_PRODUCT_ID: z.string().min(1).optional(),

  // Optional Notion mirror (Phase 5). Absent unless the user opts in.
  NOTION_API_TOKEN: z.string().min(1).optional(),
  NOTION_DATABASE_ID: z.string().min(1).optional(),

  // Shared secret required on the Authorization header of /api/cron/* so
  // only the configured scheduler (Vercel Cron, pg_cron, or the local CLI
  // script) can trigger a sync -- see docs/COINBASE_INTEGRATION.md.
  CRON_SECRET: z.string().min(16).optional(),
});

/**
 * Vercel (like most hosting UIs) stores an env var value verbatim. If the
 * private key was copied from the JSON file Coinbase's CDP portal offers,
 * its line breaks are the two literal characters `\` + `n`, not a real
 * newline -- pasting that straight into Vercel keeps it that way, unlike
 * `.env.local` locally, where dotenv itself already unescapes `\n` inside a
 * quoted value. Normalizing here means the key parses the same regardless
 * of how it was pasted, instead of failing deep inside jose/node:crypto
 * with a confusing error.
 */
export function normalizePemKey(raw: string): string {
  let value = raw.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  return value.replace(/\\n/g, "\n");
}

let cachedPublicEnv: z.infer<typeof publicEnvSchema> | undefined;
let cachedServerEnv: z.infer<typeof serverEnvSchema> | undefined;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
}

/** Public, browser-safe configuration (NEXT_PUBLIC_* only). */
export function publicEnv() {
  if (cachedPublicEnv) return cachedPublicEnv;

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment configuration:\n${formatIssues(parsed.error)}\n` +
        "Copy .env.example to .env.local and fill these in.",
    );
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

/** Server-only configuration. Throws if evaluated in a browser bundle. */
export function serverEnv() {
  if (typeof window !== "undefined") {
    throw new Error("serverEnv() must never be called from client code.");
  }

  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverEnvSchema.safeParse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    COINBASE_CDP_API_KEY_NAME: process.env.COINBASE_CDP_API_KEY_NAME,
    COINBASE_CDP_PRIVATE_KEY: process.env.COINBASE_CDP_PRIVATE_KEY,
    COINBASE_PRODUCT_VENUE: process.env.COINBASE_PRODUCT_VENUE,
    COINBASE_PRODUCT_ID: process.env.COINBASE_PRODUCT_ID,
    NOTION_API_TOKEN: process.env.NOTION_API_TOKEN,
    NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID,
    CRON_SECRET: process.env.CRON_SECRET,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment configuration:\n${formatIssues(parsed.error)}`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
