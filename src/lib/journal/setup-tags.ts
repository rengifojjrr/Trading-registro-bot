import "server-only";

import { createClient } from "@/lib/supabase/server";

import { gradeFromTagName, setupTagName, SETUP_TAG_PREFIX, type SetupGrade } from "./setup-grade";

/**
 * Leer y escribir la nota del setup, que vive como etiqueta.
 *
 * Estaba dentro de la acción de la ficha de una operación, y el cuadro de
 * apuntar varias a la vez no podía llegar a ella: por eso el setup era el único
 * campo del diario que había que poner de una en una. Sacarlo aquí es lo que
 * permite que los dos escriban lo mismo -- y que una sola implementación decida
 * qué pasa con la etiqueta anterior.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** La nota que tiene ahora cada operación, sólo para las que tienen alguna. */
export async function readSetupGrades(
  userId: string,
  tradeIds: string[],
): Promise<Map<string, SetupGrade>> {
  const notas = new Map<string, SetupGrade>();
  if (tradeIds.length === 0) return notas;

  const supabase = await createClient();

  const { data: etiquetas } = await supabase
    .from("tags")
    .select("id, name")
    .eq("user_id", userId)
    .like("name", `${SETUP_TAG_PREFIX}%`);

  const porId = new Map<string, SetupGrade>();
  for (const tag of etiquetas ?? []) {
    const grade = gradeFromTagName(tag.name);
    if (grade) porId.set(tag.id, grade);
  }
  if (porId.size === 0) return notas;

  const { data: puestas } = await supabase
    .from("trade_tags")
    .select("trade_id, tag_id")
    .eq("user_id", userId)
    .in("trade_id", tradeIds)
    .in("tag_id", [...porId.keys()]);

  for (const fila of puestas ?? []) {
    const grade = porId.get(fila.tag_id);
    if (grade) notas.set(fila.trade_id, grade);
  }

  return notas;
}

/**
 * Deja una sola nota de setup en cada operación de la lista.
 *
 * Quita antes cualquier «Setup: X» que tuvieran: una operación con dos notas a
 * la vez no significa nada, y la de antes seguiría contando en los informes.
 * Con `grade` a null sólo quita, que es como se borra la nota.
 */
export async function applySetupGrade(params: {
  userId: string;
  tradeIds: string[];
  grade: SetupGrade | null;
}): Promise<{ error: string | null }> {
  const { userId, tradeIds, grade } = params;
  if (tradeIds.length === 0) return { error: null };

  const supabase = await createClient();

  const { error: errorAlQuitar } = await quitarNotas(supabase, userId, tradeIds);
  if (errorAlQuitar) return { error: errorAlQuitar };

  if (!grade) return { error: null };

  const { data: tag, error: errorEtiqueta } = await supabase
    .from("tags")
    .upsert({ user_id: userId, name: setupTagName(grade) }, { onConflict: "user_id,name" })
    .select("id")
    .single();

  if (errorEtiqueta || !tag) {
    return { error: `No se pudo crear la etiqueta del setup: ${errorEtiqueta?.message ?? "sin id"}` };
  }

  const { error } = await supabase.from("trade_tags").upsert(
    tradeIds.map((trade_id) => ({ user_id: userId, trade_id, tag_id: tag.id })),
    { onConflict: "trade_id,tag_id" },
  );

  return { error: error ? `No se pudo poner la nota del setup: ${error.message}` : null };
}

async function quitarNotas(
  supabase: Supabase,
  userId: string,
  tradeIds: string[],
): Promise<{ error: string | null }> {
  const { data: existentes } = await supabase
    .from("tags")
    .select("id")
    .eq("user_id", userId)
    .like("name", `${SETUP_TAG_PREFIX}%`);

  const ids = (existentes ?? []).map((t) => t.id);
  if (ids.length === 0) return { error: null };

  const { error } = await supabase
    .from("trade_tags")
    .delete()
    .in("trade_id", tradeIds)
    .in("tag_id", ids);

  return { error: error ? `No se pudo quitar la nota anterior: ${error.message}` : null };
}
