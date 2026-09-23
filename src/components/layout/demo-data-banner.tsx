import { FlaskConical } from "lucide-react";

import { createClient } from "@/lib/supabase/server";

/**
 * Shown whenever the signed-in user has a demo account (seeded by
 * scripts/seed-demo-data, connector = 'SEED'). This is the one banner in the
 * app that must never silently disappear while demo data is still what's
 * on screen -- see accounts.connector in supabase/migrations.
 *
 * Por `connector` y no por `is_demo`: desde que existe paper trading de verdad
 * --una cuenta demo de Bybit-- hay cuentas de dinero ficticio cuyas operaciones
 * NO están inventadas. Este aviso dice «lo que estás viendo no pasó», y eso
 * sólo es cierto de los datos del guion de siembra. Con `is_demo` habría
 * aparecido en cuanto se conectara Bybit, llamando inventado a un histórico
 * real.
 */
export async function DemoDataBanner() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("connector", "SEED")
    .eq("is_active", true);

  if (!count) return null;

  return (
    <div className="sticky top-14 z-10 flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs text-warning">
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        Estás viendo datos de demostración generados localmente, no operaciones reales de
        Coinbase.
      </span>
    </div>
  );
}
