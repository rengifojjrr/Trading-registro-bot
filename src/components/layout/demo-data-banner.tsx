import { FlaskConical } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

/**
 * Shown whenever the signed-in user has a demo account (seeded by
 * scripts/seed-demo-data, is_demo = true). This is the one banner in the
 * app that must never silently disappear while demo data is still what's
 * on screen -- see accounts.is_demo in supabase/migrations.
 */
export async function DemoDataBanner() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true)
    .eq("is_active", true);

  if (!count) return null;

  return (
    <div className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        Estás viendo datos de demostración generados localmente, no operaciones reales de
        Coinbase.
      </span>
    </div>
  );
}
