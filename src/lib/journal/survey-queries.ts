import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { isMistakeCode, type MistakeCode } from "./mistakes";
import { planPendiente } from "./plan-store";
import { resumenCorto, type TradePlan } from "./plan";
import { gradeFromTagName } from "./setup-grade";
import { RESPUESTAS_VACIAS, type SurveyAnswers, type SurveyTrade } from "./survey";
import { hasJournalContent } from "./written";

export type { SurveyTrade };

/**
 * A qué operación toca preguntarle.
 *
 * La encuesta sale sola, así que lo delicado no es encontrar una operación
 * sin apuntar -- de eso ya se encarga la bandeja -- sino no salir cuando no
 * toca. Tres condiciones:
 *
 * 1. **Cerrada hace poco.** `VENTANA_DIAS` es corto a propósito: la encuesta
 *    es «la que acabas de terminar», no una herramienta para vaciar atrasos.
 *    Preguntar de golpe por algo de hace doce días es pedir un recuerdo que
 *    ya no existe, y lo que se conteste entonces es inventado. Lo viejo sigue
 *    donde estaba, en la bandeja del diario, a su ritmo.
 * 2. **Sin apuntar.** Si ya escribiste algo, no hay nada que preguntar.
 * 3. **Sin cerrar antes.** Cerrarla una vez basta para que no vuelva a salir
 *    sola. Una encuesta que reaparece después de descartarla se cierra sin
 *    leer a la segunda, y a partir de ahí ya nunca se contesta.
 *
 * A diferencia del aviso de la sincronización, aquí **no** hay margen de
 * cortesía: el aviso molesta a las seis horas porque persigue, y la encuesta
 * aparece enseguida porque es justo cuando todavía te acuerdas.
 */

/** Cuánto hacia atrás mira la encuesta automática. */
export const VENTANA_DIAS = 3;

/** Cuántas cerradas recientes se examinan para encontrar la candidata. */
const LIMITE = 30;

interface FilaDiario {
  trade_id: string;
  notes: string | null;
  lesson_learned: string | null;
  emotional_state: string | null;
  mistake_tag: string | null;
  strategy_id: string | null;
  plan_adherence: number | null;
  entry_quality: number | null;
  survey_closed_at: string | null;
  plan_id: string | null;
  plan_followed: boolean | null;
}

const COLUMNAS =
  "trade_id, notes, lesson_learned, emotional_state, mistake_tag, strategy_id, plan_adherence, entry_quality, survey_closed_at, plan_id, plan_followed";

function respuestasDe(
  fila: FilaDiario | undefined,
  errores: MistakeCode[],
  setup: string,
): SurveyAnswers {
  if (!fila) return { ...RESPUESTAS_VACIAS, errores, setup };

  // Tres estados y no dos: null es «todavía no se ha preguntado», y eso es lo
  // que hace que la pregunta salga la primera vez y no vuelva a salir después.
  const planSeguido = fila.plan_followed === null ? "" : fila.plan_followed ? "SI" : "NO";

  return {
    plan_seguido: planSeguido,
    setup,
    plan: fila.plan_adherence,
    entrada: fila.entry_quality,
    // Se guardan unidas por comas, que es como las dejó la importación de
    // Notion y como las escriben los otros dos formularios.
    animo: (fila.emotional_state ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
    errores,
    leccion: fila.lesson_learned ?? "",
  };
}

/**
 * La nota del setup que ya tuviera puesta.
 *
 * Vive como etiqueta («Setup: A+») y no como columna del diario, porque así la
 * dejó la importación de Notion y una operación no puede tener dos sitios
 * distintos para lo mismo. Se lee de ahí para que la encuesta abra con lo que
 * ya estaba y no vuelva a preguntar lo contestado.
 */
async function setupPorOperacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tradeIds: string[],
): Promise<Map<string, string>> {
  const { data: enlaces } = await supabase
    .from("trade_tags")
    .select("trade_id, tag_id")
    .eq("user_id", userId)
    .in("trade_id", tradeIds);

  const idsDeEtiqueta = [...new Set((enlaces ?? []).map((e) => e.tag_id))];
  if (idsDeEtiqueta.length === 0) return new Map();

  const { data: etiquetas } = await supabase.from("tags").select("id, name").in("id", idsDeEtiqueta);
  const notaPorId = new Map<string, string>();
  for (const etiqueta of etiquetas ?? []) {
    const nota = gradeFromTagName(etiqueta.name);
    if (nota) notaPorId.set(etiqueta.id, nota);
  }

  const porOperacion = new Map<string, string>();
  for (const enlace of enlaces ?? []) {
    const nota = notaPorId.get(enlace.tag_id);
    if (nota) porOperacion.set(enlace.trade_id, nota);
  }
  return porOperacion;
}

async function erroresPorOperacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  tradeIds: string[],
): Promise<Map<string, MistakeCode[]>> {
  const { data } = await supabase
    .from("trade_mistakes")
    .select("trade_id, mistake_code")
    .eq("user_id", userId)
    .in("trade_id", tradeIds);

  const porOperacion = new Map<string, MistakeCode[]>();
  for (const fila of data ?? []) {
    if (!isMistakeCode(fila.mistake_code)) continue;
    const lista = porOperacion.get(fila.trade_id) ?? [];
    lista.push(fila.mistake_code);
    porOperacion.set(fila.trade_id, lista);
  }
  return porOperacion;
}

/** La operación recién cerrada que todavía no se ha preguntado, si la hay. */
export async function fetchSurveyCandidate(): Promise<SurveyTrade | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const desde = new Date(Date.now() - VENTANA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { data: trades } = await supabase
    .from("trades")
    .select("id, product_id, direction, closed_at, net_pnl")
    .eq("user_id", user.id)
    .is("orphaned_at", null)
    .not("closed_at", "is", null)
    .gte("closed_at", desde)
    .order("closed_at", { ascending: false })
    .limit(LIMITE);

  if (!trades || trades.length === 0) return null;

  const ids = trades.map((t) => t.id);
  const [{ data: journals }, errores, setups, pendiente] = await Promise.all([
    supabase.from("journal_entries").select(COLUMNAS).eq("user_id", user.id).in("trade_id", ids),
    erroresPorOperacion(supabase, user.id, ids),
    setupPorOperacion(supabase, user.id, ids),
    // El plan que estaba esperando. Un extra: si falla, la encuesta sale sin la
    // pregunta del plan en vez de no salir.
    planPendiente().catch(() => null),
  ]);

  const porOperacion = new Map((journals ?? []).map((j) => [j.trade_id, j as FilaDiario]));

  for (const trade of trades) {
    const fila = porOperacion.get(trade.id);
    if (fila?.survey_closed_at) continue;
    if (hasJournalContent(fila)) continue;
    if ((errores.get(trade.id) ?? []).length > 0) continue;

    return {
      id: trade.id,
      productId: trade.product_id,
      direction: trade.direction,
      closedAt: trade.closed_at as string,
      netPnl: trade.net_pnl,
      answers: respuestasDe(fila, errores.get(trade.id) ?? [], setups.get(trade.id) ?? ""),
      plan: planParaLaOperacion(pendiente, fila, trade.closed_at as string),
    };
  }

  return null;
}

/**
 * Qué plan enseñarle a esta operación, si alguno.
 *
 * Dos reglas, y las dos son sobre no preguntar de más:
 *
 * 1. **Ya contestado, ya está.** Si el diario tiene un `plan_id`, la pregunta
 *    se hizo; reabrir la encuesta enseña ese mismo plan con la respuesta
 *    puesta, no uno nuevo.
 * 2. **El plan es anterior a la operación.** Un plan escrito *después* de
 *    cerrar no puede ser el de esa operación, y ofrecerlo sería invitar a
 *    decir que sí a algo imposible -- que es como una cuenta de «cuántos
 *    planes cumplo» acaba siendo una cuenta de nada.
 */
function planParaLaOperacion(
  pendiente: TradePlan | null,
  fila: FilaDiario | undefined,
  cerradaEn: string,
): { id: string; resumen: string } | null {
  if (fila?.plan_id) {
    // El que ya se ofreció. Si es el mismo que sigue pendiente se enseña con su
    // resumen; si no, basta con el identificador para no volver a preguntar.
    if (pendiente && pendiente.id === fila.plan_id) {
      return { id: pendiente.id, resumen: resumenCorto(pendiente.answers) };
    }
    return { id: fila.plan_id, resumen: "" };
  }

  if (!pendiente) return null;
  if (new Date(pendiente.createdAt).getTime() > new Date(cerradaEn).getTime()) return null;

  return { id: pendiente.id, resumen: resumenCorto(pendiente.answers) };
}

/**
 * La encuesta de una operación concreta, se haya cerrado antes o no.
 *
 * Es lo que hace que descartarla no sea definitivo: desde la ficha se puede
 * volver a abrir cuando de verdad apetezca contestarla, que es lo que
 * convierte «ahora no» en algo que se puede pulsar sin culpa.
 */
export async function fetchSurveyForTrade(tradeId: string): Promise<SurveyTrade | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: trade } = await supabase
    .from("trades")
    .select("id, product_id, direction, closed_at, net_pnl")
    .eq("id", tradeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!trade || !trade.closed_at) return null;

  const [{ data: fila }, errores, setups, pendiente] = await Promise.all([
    supabase.from("journal_entries").select(COLUMNAS).eq("trade_id", tradeId).maybeSingle(),
    erroresPorOperacion(supabase, user.id, [tradeId]),
    setupPorOperacion(supabase, user.id, [tradeId]),
    planPendiente().catch(() => null),
  ]);

  return {
    id: trade.id,
    productId: trade.product_id,
    direction: trade.direction,
    closedAt: trade.closed_at,
    netPnl: trade.net_pnl,
    plan: planParaLaOperacion(pendiente, (fila as FilaDiario | null) ?? undefined, trade.closed_at),
    answers: respuestasDe(
      (fila as FilaDiario | null) ?? undefined,
      errores.get(tradeId) ?? [],
      setups.get(tradeId) ?? "",
    ),
  };
}
