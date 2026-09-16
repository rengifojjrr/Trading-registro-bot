import "server-only";

import { z } from "zod";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { PLAN_VACIO, planVacio, type PlanAnswers, type TradePlan } from "./plan";

/**
 * Guardar el plan de antes de entrar, una respuesta a la vez.
 *
 * Como la encuesta del cierre y por lo mismo: contestas dos preguntas, te
 * llaman por teléfono, y las dos están guardadas. Y **fuera de una Server
 * Action**, también por lo mismo -- una acción refresca la ruta al terminar, el
 * panel vuelve a buscar el plan pendiente, y el cuadro se desmontaría a media
 * encuesta. Está escrito largo en `survey-store.ts`.
 *
 * El plan nace vacío en cuanto se pulsa el botón, para tener dónde ir
 * guardando. Cerrarlo sin contestar nada lo borra: un plan en blanco esperando
 * en el panel es ruido, y peor, enseña que el botón hace cosas que no pediste.
 */

const idSchema = z.uuid();

/** Cuánto puede ocupar la foto del gráfico. El mismo tope que las capturas. */
export const MAX_FOTO_BYTES = 5 * 1024 * 1024;

const EXTENSIONES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const pasoSchema = z.discriminatedUnion("step", [
  z.object({ step: z.literal("direccion"), value: z.enum(["LONG", "SHORT", ""]) }),
  z.object({ step: z.literal("idea"), value: z.string().max(2000) }),
  z.object({ step: z.literal("entrada"), value: z.number().finite().nullable() }),
  z.object({ step: z.literal("stop"), value: z.number().finite().nullable() }),
  z.object({ step: z.literal("objetivo"), value: z.number().finite().nullable() }),
  z.object({ step: z.literal("riesgo"), value: z.number().finite().nullable() }),
  z.object({ step: z.literal("animo"), value: z.array(z.string().max(200)).max(20) }),
  z.object({ step: z.literal("foto"), value: z.string().max(500) }),
]);

export type PlanStepInput = z.infer<typeof pasoSchema>;

export interface ResultadoPlan {
  error: string | null;
  estado: number;
}

const ok = (): ResultadoPlan => ({ error: null, estado: 200 });
const fallo = (error: string, estado: number): ResultadoPlan => ({ error, estado });

interface FilaPlan {
  id: string;
  created_at: string;
  product_id: string | null;
  direction: "LONG" | "SHORT" | null;
  idea: string | null;
  entry_price: string | null;
  stop_price: string | null;
  target_price: string | null;
  risk_amount: string | null;
  emotional_state: string | null;
  screenshot_path: string | null;
}

const COLUMNAS =
  "id, created_at, product_id, direction, idea, entry_price, stop_price, target_price, risk_amount, emotional_state, screenshot_path";

function respuestasDe(fila: FilaPlan): PlanAnswers {
  const numero = (v: string | null) => (v === null ? null : Number(v));
  return {
    direccion: fila.direction ?? "",
    idea: fila.idea ?? "",
    entrada: numero(fila.entry_price),
    stop: numero(fila.stop_price),
    objetivo: numero(fila.target_price),
    riesgo: numero(fila.risk_amount),
    // Separadas por comas, igual que en el diario: un solo formato para el
    // mismo vocabulario, se escriba antes o después de operar.
    animo: (fila.emotional_state ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== ""),
    foto: fila.screenshot_path ?? "",
  };
}

/**
 * Con qué enseñar una foto del bucket privado.
 *
 * Una hora basta y sobra: la dirección se usa para pintar la imagen en la
 * página que la acaba de pedir. Una dirección eterna sería un enlace público a
 * tu gráfico que cualquiera con la URL podría abrir.
 */
async function firmar(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ruta: string | null,
): Promise<string | null> {
  if (!ruta) return null;
  const { data } = await supabase.storage.from("trade-screenshots").createSignedUrl(ruta, 3600);
  return data?.signedUrl ?? null;
}

/** Empieza un plan en blanco y devuelve su identificador. */
export async function crearPlan(productId: string | null): Promise<{ id: string | null; error: string | null }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("trade_plans")
    .insert({ user_id: user.id, product_id: productId })
    .select("id")
    .single();

  if (error || !data) return { id: null, error: "No se pudo empezar el plan." };
  return { id: data.id, error: null };
}

/**
 * Qué columna toca cada respuesta.
 *
 * Un `switch` con tipo de vuelta y no un objeto con la clave calculada: lo
 * segundo se escribe en una línea y le quita al compilador la única
 * oportunidad de avisar de que una respuesta nueva se está guardando en una
 * columna que no existe.
 *
 * Vacío va como null y no como cadena vacía, porque lo que decide si un plan
 * tiene algo dentro mira si hay algo escrito, y "" no lo es.
 */
type ParchePlan = Partial<{
  direction: "LONG" | "SHORT" | null;
  idea: string | null;
  entry_price: number | null;
  stop_price: number | null;
  target_price: number | null;
  risk_amount: number | null;
  emotional_state: string | null;
  screenshot_path: string | null;
}>;

function columnaDe(paso: PlanStepInput): ParchePlan {
  switch (paso.step) {
    case "direccion":
      return { direction: paso.value === "" ? null : paso.value };
    case "idea":
      return { idea: paso.value.trim() || null };
    case "entrada":
      return { entry_price: paso.value };
    case "stop":
      return { stop_price: paso.value };
    case "objetivo":
      return { target_price: paso.value };
    case "riesgo":
      return { risk_amount: paso.value };
    case "animo":
      return { emotional_state: paso.value.length > 0 ? paso.value.join(", ") : null };
    case "foto":
      return { screenshot_path: paso.value || null };
  }
}

export async function guardarPasoDelPlan(planId: string, entrada: unknown): Promise<ResultadoPlan> {
  const user = await requireUser();

  if (!idSchema.safeParse(planId).success) return fallo("Plan inválido.", 400);
  const parsed = pasoSchema.safeParse(entrada);
  if (!parsed.success) return fallo("Respuesta no reconocida.", 400);

  const parche = { ...columnaDe(parsed.data), updated_at: new Date().toISOString() };

  const supabase = await createClient();
  const { error } = await supabase
    .from("trade_plans")
    .update(parche)
    .eq("id", planId)
    .eq("user_id", user.id);

  if (error) return fallo("No se pudo guardar la respuesta.", 500);
  return ok();
}

/** Sube la foto del gráfico y la deja apuntada en el plan. */
export async function guardarFotoDelPlan(
  planId: string,
  file: File,
): Promise<{ error: string | null; ruta: string | null; url: string | null; estado: number }> {
  const user = await requireUser();

  if (!idSchema.safeParse(planId).success) {
    return { error: "Plan inválido.", ruta: null, url: null, estado: 400 };
  }
  if (file.size === 0) return { error: "Elige una imagen.", ruta: null, url: null, estado: 400 };
  if (file.size > MAX_FOTO_BYTES) {
    return { error: "La imagen no puede superar 5 MB.", ruta: null, url: null, estado: 400 };
  }
  const extension = EXTENSIONES[file.type];
  if (!extension) {
    return { error: "Formato no soportado -- usa PNG, JPG o WEBP.", ruta: null, url: null, estado: 400 };
  }

  const supabase = await createClient();
  const { data: plan } = await supabase
    .from("trade_plans")
    .select("id, screenshot_path")
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!plan) return { error: "Plan no encontrado.", ruta: null, url: null, estado: 404 };

  // Bajo la carpeta del usuario, que es lo único que mira la política del
  // bucket. `planes/` para distinguirlas de las capturas de una operación, que
  // van bajo el identificador de la operación.
  const ruta = `${user.id}/planes/${planId}/${crypto.randomUUID()}.${extension}`;
  const { error: subida } = await supabase.storage
    .from("trade-screenshots")
    .upload(ruta, file, { contentType: file.type });
  if (subida) return { error: "No se pudo subir la imagen.", ruta: null, url: null, estado: 500 };

  const { error: guardado } = await supabase
    .from("trade_plans")
    .update({ screenshot_path: ruta, updated_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("user_id", user.id);
  if (guardado) {
    await supabase.storage.from("trade-screenshots").remove([ruta]);
    return { error: "No se pudo guardar la imagen.", ruta: null, url: null, estado: 500 };
  }

  // La anterior se va del almacén. Cambiar la foto tres veces no puede dejar
  // tres imágenes pagando sitio que ya nadie va a mirar.
  if (plan.screenshot_path && plan.screenshot_path !== ruta) {
    await supabase.storage.from("trade-screenshots").remove([plan.screenshot_path]);
  }

  return { error: null, ruta, url: await firmar(supabase, ruta), estado: 200 };
}

/**
 * El plan que está esperando, si lo hay.
 *
 * Esperando significa tres cosas: que no lo descartaste, que ninguna operación
 * ha dicho todavía «sí, soy yo», y que tiene algo dentro. El último filtro es
 * el que evita que abrir el botón y cerrarlo sin contestar deje un plan
 * fantasma en el panel.
 *
 * El más reciente y sólo uno. Podría haber varios --nada lo impide-- pero el
 * panel enseña el último: planificar dos operaciones a la vez es raro, y una
 * lista de planes pendientes en el panel principal sería una bandeja de tareas
 * más, que es justo lo que este diario intenta no ser.
 */
export async function planPendiente(): Promise<TradePlan | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: filas } = await supabase
    .from("trade_plans")
    .select(COLUMNAS)
    .eq("user_id", user.id)
    .is("discarded_at", null)
    .order("created_at", { ascending: false })
    .limit(10);

  if (!filas || filas.length === 0) return null;

  // Cuáles ya se ejecutaron. Se pregunta por los diez de golpe en vez de uno a
  // uno, que serían diez viajes para enseñar como mucho uno.
  const ids = filas.map((f) => f.id);
  const { data: usados } = await supabase
    .from("journal_entries")
    .select("plan_id")
    .eq("user_id", user.id)
    .in("plan_id", ids)
    .eq("plan_followed", true);

  const ejecutados = new Set((usados ?? []).map((u) => u.plan_id));

  for (const fila of filas as FilaPlan[]) {
    if (ejecutados.has(fila.id)) continue;
    const answers = respuestasDe(fila);
    if (planVacio(answers)) continue;
    return {
      id: fila.id,
      createdAt: fila.created_at,
      answers,
      fotoUrl: await firmar(supabase, fila.screenshot_path),
    };
  }

  return null;
}

/** Un plan concreto, para seguir contestándolo. */
export async function leerPlan(planId: string): Promise<TradePlan | null> {
  const user = await requireUser();
  if (!idSchema.safeParse(planId).success) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("trade_plans")
    .select(COLUMNAS)
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;
  const fila = data as FilaPlan;
  return {
    id: fila.id,
    createdAt: fila.created_at,
    answers: respuestasDe(fila),
    fotoUrl: await firmar(supabase, fila.screenshot_path),
  };
}

/**
 * Cierra el cuadro del plan.
 *
 * Si no se contestó nada, el plan se borra en vez de quedarse: abrir el botón,
 * mirar y cerrar no puede dejar rastro. Con algo dentro se queda esperando,
 * aunque esté a medias -- media planificación sigue siendo planificación.
 */
export async function cerrarPlan(planId: string): Promise<ResultadoPlan> {
  const user = await requireUser();
  if (!idSchema.safeParse(planId).success) return fallo("Plan inválido.", 400);

  const supabase = await createClient();
  const { data } = await supabase
    .from("trade_plans")
    .select(COLUMNAS)
    .eq("id", planId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return fallo("Plan no encontrado.", 404);
  if (!planVacio(respuestasDe(data as FilaPlan))) return ok();

  await supabase.from("trade_plans").delete().eq("id", planId).eq("user_id", user.id);
  return ok();
}

/** Descartarlo: deja de esperar, pero no se borra. */
export async function descartarPlan(planId: string): Promise<ResultadoPlan> {
  const user = await requireUser();
  if (!idSchema.safeParse(planId).success) return fallo("Plan inválido.", 400);

  const supabase = await createClient();
  const { error } = await supabase
    .from("trade_plans")
    .update({ discarded_at: new Date().toISOString() })
    .eq("id", planId)
    .eq("user_id", user.id);

  if (error) return fallo("No se pudo descartar el plan.", 500);
  return ok();
}

export { PLAN_VACIO };
