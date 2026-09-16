import "server-only";

import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { MISTAKE_CODES } from "./mistakes";
import { isSetupGrade } from "./setup-grade";
import { applySetupGrade } from "./setup-tags";

/**
 * Guardar la encuesta del cierre, una respuesta a la vez.
 *
 * Cada paso se guarda en cuanto se contesta, y no todo junto al final. Es la
 * diferencia entre una encuesta que se puede abandonar y una que castiga
 * abandonarla: contestas dos preguntas, te llaman por teléfono, y las dos
 * están guardadas.
 *
 * Escribe en las columnas de siempre -- las mismas que la ficha completa y
 * que el cuadro de apuntar varias a la vez -- porque es el mismo diario visto
 * de otra forma. Un sitio aparte para «lo que se contestó en la encuesta»
 * sería un segundo diario, y entonces ninguna pantalla podría volver a decir
 * la verdad sobre una operación sin consultar los dos.
 *
 * **Vive aquí y no en una Server Action, y ése es el arreglo de un fallo que
 * hacía la encuesta casi inservible.** Una Server Action refresca la ruta
 * actual al terminar; la ruta actual es el panel de trading, que vuelve a
 * preguntar qué operación toca encuestar. Al contestar «¿cómo estabas?» la
 * operación pasa a contar como apuntada, deja de ser candidata, y el cuadro
 * se desmontaba a media encuesta -- justo lo que se veía: se cerraba sola
 * antes de acabarla. Desde una ruta de API no hay refresco y no hay nada que
 * la desmonte. Es la misma razón por la que los dibujos del gráfico son una
 * ruta y no una acción.
 */

const tradeIdSchema = z.uuid();

const stepSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("plan_seguido"), planId: z.uuid(), value: z.enum(["SI", "NO", ""]) }),
  z.object({ step: z.literal("setup"), grade: z.string() }),
  z.object({ step: z.literal("plan"), rating: z.number().int().min(1).max(5) }),
  z.object({ step: z.literal("entrada"), rating: z.number().int().min(1).max(5) }),
  z.object({ step: z.literal("animo"), emotions: z.array(z.string().max(200)).max(20) }),
  z.object({ step: z.literal("errores"), mistakes: z.array(z.enum(MISTAKE_CODES)).max(20) }),
  z.object({ step: z.literal("leccion"), text: z.string().max(2000) }),
]);

export type SurveyStepInput = z.infer<typeof stepSchema>;

export interface ResultadoEncuesta {
  error: string | null;
  /** Para que la ruta elija el código HTTP sin reinterpretar el mensaje. */
  estado: number;
}

const ok = (): ResultadoEncuesta => ({ error: null, estado: 200 });
const fallo = (error: string, estado: number): ResultadoEncuesta => ({ error, estado });

/** Comprueba que la operación es tuya, para poder decirlo en vez de fallar en silencio. */
async function esTuya(
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

/**
 * Une --o no-- una operación con el plan que estaba esperando.
 *
 * Decir que sí hace algo más que apuntar un enlace: **el plan se muda a la
 * operación**. Los niveles que escribiste antes de entrar pasan a las columnas
 * del diario y la foto del gráfico pasa a las capturas, en la fase «antes».
 *
 * Eso es todo el sentido de haberlo escrito. Un plan que se queda en su propia
 * tabla es un papel en un cajón: lo que sirve es que al abrir la ficha de la
 * operación estén ahí tu stop, tu objetivo y la foto de lo que veías, para
 * mirarlos al lado de lo que de verdad hiciste.
 *
 * **Sin pisar nada.** Si la ficha ya tenía stop --porque lo arrastraste en el
 * gráfico, o lo escribiste a mano-- ese gana: lo del plan es lo que pensabas,
 * y lo de la ficha es lo que hiciste; cuando discrepan, la que manda es la
 * segunda.
 */
async function unirAlPlan(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tradeId: string,
  planId: string,
  respuesta: "SI" | "NO" | "",
): Promise<ResultadoEncuesta> {
  const seguido = respuesta === "" ? null : respuesta === "SI";

  const { error } = await supabase
    .from("journal_entries")
    .upsert({ user_id: userId, trade_id: tradeId, plan_id: planId, plan_followed: seguido }, { onConflict: "trade_id" });
  if (error) return fallo("No se pudo guardar la respuesta.", 500);

  if (seguido !== true) return ok();

  const { data: plan } = await supabase
    .from("trade_plans")
    .select("direction, stop_price, target_price, risk_amount, screenshot_path")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!plan) return ok();

  const { data: diario } = await supabase
    .from("journal_entries")
    .select("planned_direction, stop_loss_price, take_profit_price, risk_amount")
    .eq("trade_id", tradeId)
    .maybeSingle();

  const heredado = {
    ...(diario?.planned_direction == null && plan.direction
      ? { planned_direction: plan.direction }
      : {}),
    ...(diario?.stop_loss_price == null && plan.stop_price != null
      ? { stop_loss_price: plan.stop_price }
      : {}),
    ...(diario?.take_profit_price == null && plan.target_price != null
      ? { take_profit_price: plan.target_price }
      : {}),
    ...(diario?.risk_amount == null && plan.risk_amount != null
      ? { risk_amount: plan.risk_amount }
      : {}),
  };

  if (Object.keys(heredado).length > 0) {
    await supabase
      .from("journal_entries")
      .update(heredado)
      .eq("trade_id", tradeId)
      .eq("user_id", userId);
  }

  if (plan.screenshot_path) {
    // Una fila más apuntando al mismo objeto, no una copia del archivo: el plan
    // sigue enseñando su foto y la operación enseña la misma, que es lo
    // correcto porque *es* la misma.
    const { data: yaEsta } = await supabase
      .from("trade_screenshots")
      .select("id")
      .eq("trade_id", tradeId)
      .eq("storage_path", plan.screenshot_path)
      .maybeSingle();

    if (!yaEsta) {
      await supabase.from("trade_screenshots").insert({
        user_id: userId,
        trade_id: tradeId,
        storage_path: plan.screenshot_path,
        caption: "Del plan, antes de entrar",
        phase: "BEFORE",
      });
    }
  }

  return ok();
}

export async function guardarPaso(
  tradeId: string,
  input: unknown,
): Promise<ResultadoEncuesta> {
  const user = await requireUser();

  if (!tradeIdSchema.safeParse(tradeId).success) return fallo("Operación inválida.", 400);
  const parsed = stepSchema.safeParse(input);
  if (!parsed.success) return fallo("Respuesta no reconocida.", 400);

  const supabase = await createClient();
  if (!(await esTuya(supabase, tradeId, user.id))) return fallo("Operación no encontrada.", 404);

  const paso = parsed.data;

  if (paso.step === "plan_seguido") {
    return unirAlPlan(supabase, user.id, tradeId, paso.planId, paso.value);
  }

  if (paso.step === "setup") {
    // La nota del setup no es una columna del diario sino una etiqueta
    // («Setup: A+»), porque así la dejó la importación de Notion y una
    // operación no puede tener dos sitios distintos para lo mismo.
    const grade = isSetupGrade(paso.grade) ? paso.grade : null;
    await applySetupGrade({ userId: user.id, tradeIds: [tradeId], grade });
    return ok();
  }

  if (paso.step === "errores") {
    // Se sincroniza la lista entera: lo que ya no está marcado se borra. Sin
    // esto, desmarcar un error en la encuesta lo dejaría puesto, y la
    // siguiente vez que se abriera volvería a salir marcado.
    const { error: borrado } = await supabase
      .from("trade_mistakes")
      .delete()
      .eq("user_id", user.id)
      .eq("trade_id", tradeId);
    if (borrado) return fallo("No se pudieron guardar los errores.", 500);

    if (paso.mistakes.length > 0) {
      const { error } = await supabase.from("trade_mistakes").upsert(
        paso.mistakes.map((code) => ({ user_id: user.id, trade_id: tradeId, mistake_code: code })),
        { onConflict: "trade_id,mistake_code" },
      );
      if (error) return fallo("No se pudieron guardar los errores.", 500);
    }
    return ok();
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

  const { error } = await supabase.from("journal_entries").upsert(fila, { onConflict: "trade_id" });
  if (error) return fallo("No se pudo guardar la respuesta.", 500);

  return ok();
}

/**
 * Cerrar la encuesta de una operación: contestada entera, a medias o ni
 * empezada.
 *
 * Es lo mismo para las tres porque para decidir si vuelve a salir sola las
 * tres son lo mismo. Lo que se contestó ya está guardado paso a paso; esto
 * sólo apaga el automatismo.
 */
export async function cerrarEncuesta(tradeId: string): Promise<ResultadoEncuesta> {
  const user = await requireUser();
  if (!tradeIdSchema.safeParse(tradeId).success) return fallo("Operación inválida.", 400);

  const supabase = await createClient();
  if (!(await esTuya(supabase, tradeId, user.id))) return fallo("Operación no encontrada.", 404);

  const { error } = await supabase.from("journal_entries").upsert(
    { user_id: user.id, trade_id: tradeId, survey_closed_at: new Date().toISOString() },
    { onConflict: "trade_id" },
  );
  if (error) return fallo("No se pudo cerrar la encuesta.", 500);

  return ok();
}
