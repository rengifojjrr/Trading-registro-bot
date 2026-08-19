import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * The handful of settings every module needs.
 *
 * Timezone above all: every module files entries by day, and "day" is the
 * user's, not UTC. Reading it in one place stops each module inventing its
 * own fallback and disagreeing with the others about what "hoy" means.
 */
export async function userTimezone(): Promise<string> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  return data?.timezone || "UTC";
}
