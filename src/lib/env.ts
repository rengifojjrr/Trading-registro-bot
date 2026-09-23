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

  /*
    La cuenta demo de Bybit: paper trading con API de verdad.
    Ver `lib/bybit/adapter.ts`.

    `spot` por defecto y no `linear` a propósito. En los perpetuos, Bybit cobra
    funding y ese cobro llega mezclado con las ejecuciones; el adaptador lo
    descarta --pasarlo por ejecución inventaría entradas-- así que el P&L de
    una posición que aguante un cobro sale mejor de lo que fue. En spot no hay
    funding y el número es exacto.
  */
  BYBIT_DEMO_API_KEY: z.string().min(1).optional(),
  BYBIT_DEMO_API_SECRET: z.string().min(1).optional(),
  BYBIT_CATEGORY: z.enum(["spot", "linear", "inverse"]).default("spot"),
  /** Separados por comas, como `COINBASE_PRODUCT_ID`. Por ejemplo `BTCUSDT,ETHUSDT`. */
  BYBIT_SYMBOLS: z.string().min(1).optional(),

  // Optional Notion mirror (Phase 5). Absent unless the user opts in.
  NOTION_API_TOKEN: z.string().min(1).optional(),
  NOTION_DATABASE_ID: z.string().min(1).optional(),
  // El calendario de contenido es otra base de datos distinta a la de
  // trading, y la relación es la contraria: de trading escribimos hacia
  // Notion, y de contenido leemos desde Notion mientras el editor trabaje
  // allí. Un identificador de base de datos no es un secreto, pero se
  // configura igual para no fijar en el código la base de nadie.
  NOTION_CONTENT_DATABASE_ID: z.string().min(1).optional(),
  // Las otras cuatro bases de Vida. Todas se leen, ninguna se escribe: la
  // aplicación es el destino y Notion el origen mientras se haga la mudanza.
  NOTION_SLEEP_DATABASE_ID: z.string().min(1).optional(),
  NOTION_HABITS_DATABASE_ID: z.string().min(1).optional(),
  NOTION_TASKS_DATABASE_ID: z.string().min(1).optional(),
  NOTION_MEALS_DATABASE_ID: z.string().min(1).optional(),
  NOTION_READING_DATABASE_ID: z.string().min(1).optional(),

  // Shared secret required on the Authorization header of /api/cron/* so
  // only the configured scheduler (Vercel Cron, pg_cron, or the local CLI
  // script) can trigger a sync -- see docs/COINBASE_INTEGRATION.md.
  CRON_SECRET: z.string().min(16).optional(),

  // Optional email alerting for critical problems (repeated sync failures).
  // All three are required together -- with any of them missing, alerting
  // silently stays off rather than half-working. See lib/notifications/email.ts.
  RESEND_API_KEY: z.string().min(1).optional(),
  ALERT_EMAIL_TO: z.email().optional(),
  ALERT_EMAIL_FROM: z.string().min(1).optional(),
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
    BYBIT_DEMO_API_KEY: process.env.BYBIT_DEMO_API_KEY,
    BYBIT_DEMO_API_SECRET: process.env.BYBIT_DEMO_API_SECRET,
    BYBIT_CATEGORY: process.env.BYBIT_CATEGORY,
    BYBIT_SYMBOLS: process.env.BYBIT_SYMBOLS,
    NOTION_API_TOKEN: process.env.NOTION_API_TOKEN,
    NOTION_DATABASE_ID: process.env.NOTION_DATABASE_ID,
    NOTION_CONTENT_DATABASE_ID: process.env.NOTION_CONTENT_DATABASE_ID,
    NOTION_SLEEP_DATABASE_ID: process.env.NOTION_SLEEP_DATABASE_ID,
    NOTION_HABITS_DATABASE_ID: process.env.NOTION_HABITS_DATABASE_ID,
    NOTION_TASKS_DATABASE_ID: process.env.NOTION_TASKS_DATABASE_ID,
    NOTION_MEALS_DATABASE_ID: process.env.NOTION_MEALS_DATABASE_ID,
    NOTION_READING_DATABASE_ID: process.env.NOTION_READING_DATABASE_ID,
    CRON_SECRET: process.env.CRON_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    ALERT_EMAIL_TO: process.env.ALERT_EMAIL_TO,
    ALERT_EMAIL_FROM: process.env.ALERT_EMAIL_FROM,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment configuration:\n${formatIssues(parsed.error)}`,
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}
