"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { runNightlyReconciliation } from "@/lib/sync/reconciliation";

/**
 * Marks a difference as dealt with.
 *
 * Deliberately does not touch any trade, fill or figure. The app has no way
 * to know which of the two versions is correct -- that is the human's call,
 * and the note is where they record it. "Resolved" here means "a person
 * looked at this", not "the data was changed".
 */
export async function resolveDiscrepancy(
  discrepancyId: string,
  note: string,
): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!z.uuid().safeParse(discrepancyId).success) return { error: "Diferencia inválida." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("reconciliation_discrepancies")
    .update({
      resolved_at: new Date().toISOString(),
      resolution_note: note.trim().slice(0, 500) || null,
    })
    .eq("id", discrepancyId)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo marcar como resuelta." };

  revalidatePath("/reconciliation");
  revalidatePath("/activity");
  return { error: null };
}

/**
 * Vuelve a leer los fills de Coinbase, ignorando el marcador.
 *
 * La sincronización normal sólo mira hacia adelante desde su marca de agua
 * (menos unos minutos de solapamiento), así que un fill que llega tarde --
 * con marca de tiempo anterior a esa ventana -- no se recupera nunca. Y sin
 * él la posición reconstruida queda desplazada y la operación que dependía de
 * ese fill se queda abierta aunque esté cerrada de verdad.
 *
 * Hasta ahora esto sólo corría de madrugada por cron, y el cron está detrás de
 * `auto_sync_enabled`, que sigue apagado hasta terminar la validación. O sea
 * que no había corrido nunca y no había forma de pedirlo.
 *
 * No corrige nada por su cuenta: trae lo que falte y registra lo que no
 * cuadre. Cuál de las dos versiones es la buena lo decide una persona.
 */
export async function reRunReconciliation(
  days: number,
): Promise<{ error: string | null; found: number }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: accounts } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .eq("is_demo", false);

  if (!accounts || accounts.length === 0) {
    return { error: "No hay ninguna cuenta activa que reconciliar.", found: 0 };
  }

  let found = 0;
  for (const account of accounts) {
    try {
      const summary = await runNightlyReconciliation(account.id, days);
      found += summary.discrepancies ?? 0;
    } catch (error) {
      // El mensaje se enseña tal cual, así que nunca lleva el error crudo:
      // podría arrastrar detalles de la petición a Coinbase.
      return {
        error:
          error instanceof Error && error.message.includes("credentials")
            ? "Faltan las credenciales de Coinbase en el servidor."
            : "Coinbase devolvió un error al releer los fills.",
        found,
      };
    }
  }

  revalidatePath("/reconciliation");
  revalidatePath("/trades");
  revalidatePath("/trading");
  revalidatePath("/activity");
  return { error: null, found };
}
