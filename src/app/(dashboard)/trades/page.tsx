import { ListOrdered } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

export default async function TradesPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const { count: tradeCount } = await supabase
    .from("trades")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  return (
    <>
      <PageHeader
        title="Operaciones"
        description="Todas tus operaciones reconstruidas a partir de los fills de Coinbase."
      />

      <EmptyState
        icon={ListOrdered}
        title={
          tradeCount
            ? "La tabla avanzada de operaciones se conecta en la Fase 4"
            : "Todavía no hay operaciones reconstruidas"
        }
        description="Esta sección mostrará una tabla ordenable, filtrable y exportable, con ficha completa por operación (entradas, salidas, comisiones, capturas y notas) una vez conectado el motor de reconstrucción."
      />
    </>
  );
}
