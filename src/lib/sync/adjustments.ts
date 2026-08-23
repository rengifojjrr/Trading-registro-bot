import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fills que Coinbase emitió como ajuste y la reconstrucción no sabe tratar.
 *
 * Coinbase no manda sólo ejecuciones: manda también `REVERSAL` (deshace una
 * ejecución anterior), `CORRECTION` (la sustituye) y `SYNTHETIC` (la genera
 * él). El motor los aparta a «sin clasificar» y sigue, porque la semántica
 * exacta de cada uno no está confirmada y **inventarla sería peor**: aplicar
 * mal un reversal mueve la posición en la dirección contraria y produce
 * cifras coherentes y falsas, que es la única clase de error que esta
 * aplicación no puede permitirse.
 *
 * Lo que sí estaba mal era la consecuencia. Apartarlos generaba un aviso de
 * severidad «atención» y la reconstrucción se daba por buena, cuando el
 * efecto sobre las cifras es idéntico al de un fill que falta: la posición
 * calculada puede no ser la real. Así que ahora cuentan como lo que son --
 * una razón para no fiarse -- y aparecen en la barra de estado y bloquean la
 * puerta de la sincronización automática, igual que un hueco.
 *
 * La diferencia con un hueco es que éste no se puede reparar volviendo a
 * pedir: el dato está, es su significado lo que no sabemos. Por eso se
 * cuentan aparte y el texto no ofrece un botón que no arreglaría nada.
 */
export async function countUnclassifiedFills(userId: string): Promise<number> {
  const supabase = createAdminClient();

  const { count } = await supabase
    .from("raw_fills")
    .select("entry_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .neq("trade_type", "FILL");

  return count ?? 0;
}
