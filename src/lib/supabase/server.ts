import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { publicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Server client for use in Server Components, Server Actions, and Route
 * Handlers. Still uses the publishable key + the caller's session cookies,
 * so RLS still applies -- this is not an elevated-privilege client. For
 * background jobs that must run outside a user session (sync, reconciliation,
 * Notion queue), use lib/supabase/admin.ts instead.
 *
 * `cookies()` is async as of Next.js 15+/16 -- this function must be awaited
 * by every caller.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = publicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render, which cannot set
            // cookies. Harmless as long as proxy.ts (src/proxy.ts) is
            // refreshing the session on every request, which it does.
          }
        },
      },
    },
  );
}
