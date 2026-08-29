import { FlaskConical } from "lucide-react";
import Link from "next/link";

import { BacktestWorkbench } from "@/components/backtest/backtest-workbench";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { parseStoredCosts, parseStoredStrategy } from "@/lib/backtest/persistence";
import { requireUser } from "@/lib/auth/require-user";
import { fetchTradeCandles } from "@/lib/coinbase/fetch-trade-candles";
import { createClient } from "@/lib/supabase/server";

/**
 * Backtest.
 *
 * Las velas se cargan aquí, en el servidor, y el backtest corre en el
 * navegador: es una función pura sobre esas velas, así que mandarlas de vuelta
 * al servidor para que las devuelva calculadas sólo añadiría una espera. El
 * efecto secundario es lo que hace útil la pantalla -- cambiar un stop y ver
 * el resultado al momento convierte esto en algo con lo que se juega, en vez
 * de en un formulario que se envía y se espera.
 *
 * El producto y el tamaño de contrato salen de la configuración y del registro
 * de productos, nunca escritos a mano: el multiplicador es lo que convierte un
 * movimiento de precio en dinero, y equivocarlo hace que todas las cifras del
 * backtest estén mal por el mismo factor -- que es la clase de error que no se
 * nota porque todo parece coherente.
 */
const DIAS_DE_HISTORIA = 60;

export default async function BacktestPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: settings }, { data: strategyRows }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("active_product_id, timezone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("backtest_strategies")
      .select("id, name, rules, costs")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
  ]);

  const productId = settings?.active_product_id;

  if (!productId) {
    return (
      <>
        <PageHeader title="Backtest" description="Probar una regla contra el histórico." />
        <EmptyState
          icon={FlaskConical}
          title="Falta decir qué producto operas"
          description="El backtest necesita saber sobre qué instrumento correr las reglas y con qué tamaño de contrato, porque el multiplicador es lo que convierte un movimiento de precio en dinero."
          action={
            <Button asChild>
              <Link href="/settings">Ir a Configuración</Link>
            </Button>
          }
        />
      </>
    );
  }

  const { data: producto } = await supabase
    .from("products")
    .select("contract_size")
    .eq("product_id", productId)
    .maybeSingle();

  const ahora = new Date();
  const desde = new Date(ahora.getTime() - DIAS_DE_HISTORIA * 24 * 60 * 60 * 1000);
  const chart = await fetchTradeCandles({ productId, openedAt: desde, closedAt: ahora });

  if (!chart || chart.candles.length < 50) {
    return (
      <>
        <PageHeader title="Backtest" description="Probar una regla contra el histórico." />
        <EmptyState
          icon={FlaskConical}
          title="No hay velas suficientes"
          description="Coinbase no devolvió histórico para este producto, o no hay bastante para que los indicadores arranquen. Comprueba la conexión en Configuración; el backtest no inventa datos."
          action={
            <Button asChild>
              <Link href="/settings">Revisar la conexión</Link>
            </Button>
          }
        />
      </>
    );
  }

  const stored = (strategyRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    strategy: parseStoredStrategy(row.rules),
    costs: parseStoredCosts(row.costs),
  }));

  return (
    <>
      <PageHeader
        title="Backtest"
        description={`Sobre ${chart.candles.length} velas de ${chart.granularityLabel} de ${productId}, los últimos ${DIAS_DE_HISTORIA} días.`}
      />

      <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        Las operaciones simuladas las arma el mismo motor que arma las tuyas de Coinbase, y el P&amp;L
        lo calcula la misma función. Por eso «la regla habría ganado 300» y «tú ganaste 250» son
        cifras del mismo tipo y se pueden restar. Puedes verlo en{" "}
        <Link href="/trades" className="underline underline-offset-4">
          tus operaciones
        </Link>
        .
      </p>

      <BacktestWorkbench
        candles={chart.candles}
        productId={productId}
        contractSize={Number(producto?.contract_size ?? 1)}
        stored={stored}
      />
    </>
  );
}
