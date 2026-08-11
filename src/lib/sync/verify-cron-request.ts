import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Every /api/cron/* route calls this first. Matches Vercel Cron's own
 * convention (Authorization: Bearer $CRON_SECRET) so the same route works
 * whether it's triggered by Vercel Cron, a Supabase pg_cron -> HTTP call,
 * or a manual `curl` during testing -- see README.md's deploy section.
 */
export function verifyCronRequest(request: Request): { ok: true } | { ok: false; status: number } {
  const env = serverEnv();
  if (!env.CRON_SECRET) {
    return { ok: false, status: 500 };
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
