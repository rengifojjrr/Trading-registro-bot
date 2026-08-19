"use server";

import { revalidatePath } from "next/cache";

import { recordAudit } from "@/lib/audit/log";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { resolveCoinbaseAccountId } from "@/lib/sync/account";
import { runPollSync } from "@/lib/sync/orchestrator";

export type BackfillState = { error: string | null; message: string | null };

/**
 * Widens the next sync's window back to the full initial backfill.
 *
 * Normal syncs only ask Coinbase for fills newer than the high water mark,
 * which is right almost always and wrong in exactly one situation: a fill
 * that should have been ingested earlier never was, so the mark advanced
 * past it and no later sync will ever look that far back again. That is not
 * hypothetical -- it left a position of 42 contracts against a sell order
 * of 43, and a phantom short made of the difference.
 *
 * Clearing the mark is safe. Nothing is deleted, and the sync inserts only
 * fills it does not already have (raw_fills is keyed by Coinbase's own
 * entry_id), so re-fetching a window that is already complete does nothing
 * at all. The cost is one larger request.
 */
export async function requestFullBackfill(): Promise<BackfillState> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: states, error } = await supabase
    .from("sync_state")
    .update({ high_water_mark: null })
    .eq("user_id", user.id)
    .eq("sync_type", "POLL")
    .select("id");

  if (error) {
    return { error: "No se pudo preparar el rebackfill.", message: null };
  }
  if (!states || states.length === 0) {
    return { error: "Todavía no hay una sincronización configurada que rehacer.", message: null };
  }

  await recordAudit({
    userId: user.id,
    action: "BACKFILL_REQUESTED",
    metadata: { note: "Se borró la marca de agua para que la próxima sincronización rehaga el histórico." },
  });

  revalidatePath("/settings");
  return {
    error: null,
    message:
      "Listo. La próxima sincronización pedirá el histórico completo en lugar de sólo lo nuevo. Pulsa «Sincronizar ahora».",
  };
}

/**
 * Rehace el histórico y sincroniza, de una vez.
 *
 * `requestFullBackfill` deja preparada la relectura pero no la ejecuta, y eso
 * está bien en Configuración, donde quien entra ya venía a tocar la
 * sincronización. No está bien en el sitio donde de verdad aparece el
 * problema: cuando la aplicación enseña una posición que Coinbase dice que no
 * existe, la persona que lo está mirando no tiene por qué saber que la cura se
 * llama «rehacer el histórico», ni que después hay que ir a otra tarjeta a
 * pulsar «Sincronizar ahora».
 *
 * Ese fue el fallo real de esta semana: la aplicación tenía el remedio desde
 * el principio, escondido detrás de dos pasos y de un título que parece de
 * programadores, y el panel estuvo ocho días enseñando una operación fantasma
 * de 151 contratos.
 *
 * No borra nada. `raw_fills` está indexado por el `entry_id` de Coinbase, así
 * que releer una ventana que ya está completa no cambia absolutamente nada;
 * lo único que cuesta es una petición más grande.
 */
export async function repairHistory(): Promise<BackfillState> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error: markError } = await supabase
    .from("sync_state")
    .update({ high_water_mark: null })
    .eq("user_id", user.id)
    .eq("sync_type", "POLL");

  if (markError) {
    return { error: "No se pudo preparar la relectura del histórico.", message: null };
  }

  const accountId = await resolveCoinbaseAccountId(user.id);
  if (!accountId) {
    return { error: "No hay ninguna cuenta de Coinbase configurada.", message: null };
  }

  const summary = await runPollSync(accountId);

  await recordAudit({
    userId: user.id,
    action: "BACKFILL_REQUESTED",
    metadata: {
      note: "Relectura completa lanzada desde el aviso de descuadre.",
      fillsNew: summary.fillsNew,
      status: summary.status,
    },
  });

  revalidatePath("/", "layout");

  if (summary.status === "FAILED") {
    return { error: summary.errorSummary ?? "La sincronización falló.", message: null };
  }

  return {
    error: null,
    message:
      summary.fillsNew > 0
        ? `Recuperadas ${summary.fillsNew} ejecución(es) que faltaban. Las operaciones se han vuelto a calcular.`
        : "El histórico ya estaba completo: no faltaba ninguna ejecución.",
  };
}
