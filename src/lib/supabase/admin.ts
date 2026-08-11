import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { publicEnv, serverEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Service-role client: bypasses Row Level Security entirely. This is what
 * background work (Coinbase sync, trade reconstruction, Notion queue
 * workers, cron routes) uses to write across the schema without a user
 * session -- it is how "toda la lógica sensible" stays server-side instead
 * of granting the browser broad write access.
 *
 * The `server-only` import makes any accidental client-bundle import a
 * build-time error. Do not use this client to serve a user's own reads or
 * writes -- use lib/supabase/server.ts for anything performed on behalf of
 * a logged-in user, so RLS keeps doing its job.
 *
 * Throws if SUPABASE_SERVICE_ROLE_KEY is not configured, since callers of
 * this module only exist in code paths that require it.
 */
export function createAdminClient() {
  const env = serverEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Required for sync/reconstruction/Notion background jobs -- see .env.example.",
    );
  }

  return createSupabaseClient<Database>(
    publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
