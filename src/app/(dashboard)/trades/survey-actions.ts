"use server";

import { revalidatePath } from "next/cache";

import { cerrarEncuesta } from "@/lib/journal/survey-store";
import { enqueueNotionSync } from "@/lib/notion/sync";
import { requireUser } from "@/lib/auth/require-user";

/**
 * Cerrar la encuesta del cierre de una operación.
 *
 * Aquí **sí** es una Server Action, al contrario que guardar una respuesta: se
 * llama cuando la encuesta ya ha desaparecido de la pantalla, así que el
 * refresco que dispara toda Server Action no puede desmontar nada y además es
 * lo que se quiere -- el panel se entera de que esa operación ya está
 * apuntada.
 *
 * Guardar una respuesta va por `/api/trades/[tradeId]/survey` justamente
 * porque ese refresco, a media encuesta, la cerraba sola.
 */
export async function closeSurvey(
  tradeId: string,
  opciones: { completada: boolean } = { completada: false },
): Promise<{ error: string | null }> {
  const user = await requireUser();

  const { error } = await cerrarEncuesta(tradeId);
  if (error) return { error };

  // Al espejo de Notion se le avisa una vez, al final, y no en cada pregunta:
  // cinco encolados para una operación son cuatro de más.
  if (opciones.completada) await enqueueNotionSync(user.id, tradeId);

  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trading");
  revalidatePath("/journal");
  revalidatePath("/behaviour");
  return { error: null };
}
