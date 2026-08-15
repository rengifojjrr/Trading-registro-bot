import type { SavedView } from "@/components/dashboard/saved-views";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * The saved views for one page.
 *
 * Scoped by path on purpose: the same filters mean different things on
 * /trades than on /behaviour, so a view saved on one should not appear on
 * the other.
 */
export async function fetchSavedViews(path: string): Promise<SavedView[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("saved_views")
    .select("id, name, path, query")
    .eq("user_id", user.id)
    .eq("path", path)
    .order("created_at", { ascending: true });

  return (data ?? []) as SavedView[];
}
