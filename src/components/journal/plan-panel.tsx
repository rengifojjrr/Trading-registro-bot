import { PlanLauncher } from "@/components/journal/plan-launcher";
import { planPendiente } from "@/lib/journal/plan-store";
import { chartProductId } from "@/lib/economic-calendar/candles";

/**
 * Busca el plan que esté esperando y monta el botón.
 *
 * Va envuelto en un `Suspense` por quien lo monta: son dos consultas más y el
 * panel no puede esperar a ellas para pintar las cifras. Si falla, no aparece y
 * no se lleva la página por delante -- planificar es un extra, y un extra nunca
 * puede romper lo principal.
 */
export async function PlanPanel() {
  const plan = await planPendiente().catch((error) => {
    console.error("[plan] no se pudo buscar el plan pendiente", error);
    return null;
  });

  return <PlanLauncher plan={plan} productId={chartProductId()} />;
}
