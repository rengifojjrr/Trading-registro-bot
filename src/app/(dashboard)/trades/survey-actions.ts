"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { MISTAKE_CODES } from "@/lib/journal/mistakes";
import { enqueueNotionSync } from "@/lib/notion/sync";
import { createClient } from "@/lib/supabase/server";

/**
 * Guardar la encuesta del cierre, una respuesta a la vez.
 *
 * Cada paso se guarda en cuanto se contesta, y no todo junto al final. Es la
 * diferencia entre una encuesta que se puede abandonar y una que castiga
 * abandonarla: contestas dos preguntas, te llaman por teléfono, y las dos
 * están guardadas. Un formulario que sólo guarda al final convierte cualquier
 * interrupción en trabajo perdido, y trabajo perdido una vez es un formulario
 * que ya no se abre más.
 *
 * Escribe en las columnas de siempre -- las mismas que la ficha completa y
 * que el cuadro de apuntar varias a la vez -- porque es el mismo diario visto
 * de otra forma. Un sitio aparte para «lo que se contestó en la encuesta»
 * sería un segundo diario, y entonces ninguna pantalla podría volver a decir
 * la verdad sobre una operación sin consultar los dos.
 *
 * Los errores van a `trade_mistakes` y no a `journal_entries.mistake_tag`: la
 * primera es la lista contable de la que viven las estadísticas de
 * comportamiento, y la segunda es texto que vino de la importación de Notion.
 */

const tradeIdSchema = z.uuid();

const stepSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("plan"), rating: z.number().int().min(1).max(5) }),
  z.object({ step: z.literal("entrada"), rating: z.number().int().min(1).max(5) }),
  z.object({ step: z.literal("animo"), emotions: z.array(z.string().max(200)).max(20) }),
  z.object({ step: z.literal("errores"), mistakes: z.array(z.enum(MISTAKE_CODES)).max(20) }),
  z.object({ step: z.literal("leccion"), text: z.string().max(2000) }),
]);

export type SurveyStepInput = z.infer<typeof stepSchema>;

export type SurveyActionResult = { error: string | null };

/** Comprueba que la operación es tuya, para poder decirlo en vez de fallar en silencio. */
async function ownedTrade(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tradeId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("trades")
    .select("id")
    .eq("id", tradeId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function saveSurveyStep(
  tradeId: string,
  input: SurveyStepInput,
): Promise<SurveyActionResult> {
  const user = await requireUser();

  if (!tradeIdSchema.safeParse(tradeId).success) return { error: "Operación inválida." };
  const parsed = stepSchema.safeParse(input);
  if (!parsed.success) return { error: "Respuesta no reconocida." };

  const supabase = await createClient();
  if (!(await ownedTrade(supabase, tradeId, user.id))) return { error: "Operación no encontrada." };

  const paso = parsed.data;

  if (paso.step === "errores") {
    // Se sincroniza la lista entera: lo que ya no está marcado se borra. Sin
    // esto, desmarcar un error en la encuesta lo dejaría puesto, y la
    // siguiente vez que se abriera volvería a salir marcado.
    const { error: borrado } = await supabase
      .from("trade_mistakes")
      .delete()
      .eq("user_id", user.id)
      .eq("trade_id", tradeId);
    if (borrado) return { error: "No se pudieron guardar los errores." };

    if (paso.mistakes.length > 0) {
      const { error } = await supabase.from("trade_mistakes").upsert(
        paso.mistakes.map((code) => ({ user_id: user.id, trade_id: tradeId, mistake_code: code })),
        { onConflict: "trade_id,mistake_code" },
      );
      if (error) return { error: "No se pudieron guardar los errores." };
    }

    revalidatePath(`/trades/${tradeId}`);
    revalidatePath("/behaviour");
    return { error: null };
  }

  // Sólo viaja la columna de este paso. Un `upsert` de Postgres actualiza
  // exactamente las columnas que recibe, así que contestar la tercera
  // pregunta no puede borrar lo que se escribió a mano en la ficha completa.
  const fila = {
    user_id: user.id,
    trade_id: tradeId,
    ...(paso.step === "plan" ? { plan_adherence: paso.rating } : {}),
    ...(paso.step === "entrada" ? { entry_quality: paso.rating } : {}),
    ...(paso.step === "animo"
      ? { emotional_state: paso.emotions.length > 0 ? paso.emotions.join(", ") : null }
      : {}),
    // Una lección en blanco se guarda como null y no como cadena vacía: lo que
    // decide si una operación cuenta como apuntada mira si hay algo escrito, y
    // "" no es algo escrito.
    ...(paso.step === "leccion" ? { lesson_learned: paso.text.trim() || null } : {}),
  };

  const { error } = await supabase
    .from("journal_entries")
    .upsert(fila, { onConflict: "trade_id" });
  if (error) return { error: "No se pudo guardar la respuesta." };

  revalidatePath(`/trades/${tradeId}`);
  return { error: null };
}

/**
 * Cerrar la encuesta de una operación: contestada entera, a medias o ni
 * empezada.
 *
 * Es lo mismo para las tres porque para decidir si vuelve a salir sola las
 * tres son lo mismo. Lo que se contestó ya está guardado paso a paso; esto
 * sólo apaga el automatismo.
 */
export async function closeSurvey(
  tradeId: string,
  opciones: { completada: boolean } = { completada: false },
): Promise<SurveyActionResult> {
  const user = await requireUser();
  if (!tradeIdSchema.safeParse(tradeId).success) return { error: "Operación inválida." };

  const supabase = await createClient();
  if (!(await ownedTrade(supabase, tradeId, user.id))) return { error: "Operación no encontrada." };

  const { error } = await supabase.from("journal_entries").upsert(
    { user_id: user.id, trade_id: tradeId, survey_closed_at: new Date().toISOString() },
    { onConflict: "trade_id" },
  );
  if (error) return { error: "No se pudo cerrar la encuesta." };

  // Al espejo de Notion se le avisa una vez, al final, y no en cada pregunta:
  // cinco encolados para una operación son cuatro de más.
  if (opciones.completada) await enqueueNotionSync(user.id, tradeId);

  revalidatePath(`/trades/${tradeId}`);
  revalidatePath("/trading");
  revalidatePath("/journal");
  return { error: null };
}
