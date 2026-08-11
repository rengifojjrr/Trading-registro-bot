"use client";

import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Browser client. Uses the publishable (formerly "anon") key only -- this
 * key is safe to ship to the client and relies entirely on Postgres RLS
 * policies (see supabase/migrations) to scope every query to the signed-in
 * user. Never import the service-role client (lib/supabase/admin.ts) here.
 */
export function createClient() {
  const env = publicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
