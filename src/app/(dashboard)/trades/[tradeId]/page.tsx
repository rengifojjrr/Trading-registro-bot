import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/require-user";

export default async function TradeDetailPage(props: PageProps<"/trades/[tradeId]">) {
  const { tradeId } = await props.params;
  const user = await requireUser();
  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("id, product_id, direction, status, opened_at, closed_at")
    .eq("user_id", user.id)
    .eq("id", tradeId)
    .maybeSingle();

  if (!trade) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={`${trade.product_id} · ${trade.direction === "LONG" ? "Long" : "Short"}`}
        description={`Abierta ${new Date(trade.opened_at).toLocaleString("es")}`}
      />
      <EmptyState
        title="Ficha completa en construcción"
        description="Entradas y salidas, evolución de la posición, comisiones, capturas, notas y evaluación cualitativa se conectan en la Fase 4."
      />
    </>
  );
}
