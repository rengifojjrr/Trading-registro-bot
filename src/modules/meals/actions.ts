"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { MEAL_TYPES, parseIngredientLine } from "@/modules/meals/domain/meals";
import type { ImportResult } from "@/lib/notion/read-database";
import { importMealsFromNotion } from "@/modules/meals/notion-import";

export type MealFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

/**
 * Interpreta el bloque de ingredientes.
 *
 * Una línea por ingrediente: escribir tres campos por cada uno es tedioso y
 * acaba en que no se apuntan.
 */
function ingredientsFrom(block: string | null) {
  return (block ?? "")
    .split("\n")
    .map(parseIngredientLine)
    .filter((i): i is NonNullable<typeof i> => i !== null);
}

/**
 * Las preguntas de la encuesta, que aquí son las columnas más los
 * ingredientes -- que no son una columna sino otra tabla.
 */
const CAMPOS_COMIDA = [
  "meal_date",
  "meal_type",
  "name",
  "ingredients",
  "cook",
  "notes",
  "icon",
] as const;

type CampoComida = (typeof CAMPOS_COMIDA)[number];

const valorSchema = z.union([
  z.string().max(8000),
  z.array(z.string().max(200)).max(40),
  z.number(),
  z.null(),
]);

const respuestaComidaSchema = z.object({
  meal_id: emptyToNull(z.string().uuid()),
  campo: z.enum(CAMPOS_COMIDA, { message: "Pregunta desconocida." }),
  valor: valorSchema,
  /**
   * Todo lo contestado hasta ahora, que sólo se usa para crear la fila.
   *
   * Hace falta porque `name` y `meal_type` son `not null`: la comida no puede
   * nacer de una respuesta suelta como nace una lectura. Y ya que se manda lo
   * mínimo, se manda todo -- así contestar el nombre en cuarto lugar no pierde
   * las tres respuestas anteriores, que es lo que pasaría creando la fila sólo
   * con el nombre.
   */
  respuestas: z.record(z.string(), valorSchema),
});

export type RespuestaComida = z.infer<typeof valorSchema>;

/** Un texto, o null si está en blanco. */
function texto(valor: unknown): string | null {
  const t = typeof valor === "string" ? valor.trim() : "";
  return t === "" ? null : t;
}

function tipoValido(valor: unknown): (typeof MEAL_TYPES)[number] | null {
  return (MEAL_TYPES as readonly string[]).includes(String(valor))
    ? (valor as (typeof MEAL_TYPES)[number])
    : null;
}

function diaValido(valor: unknown): string | null {
  const t = texto(valor);
  return t !== null && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

/** Reemplaza los ingredientes de una comida por los del bloque de texto. */
async function reescribirIngredientes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: { userId: string; mealId: string; bloque: unknown },
): Promise<void> {
  // Enteros y no casados uno a uno con los que había: el bloque de texto no
  // tiene identidad --nadie escribe «el tercero era cebolla»--, así que
  // casarlos sería adivinar, y adivinar mal borra el que no tocaba.
  await supabase
    .from("meals_ingredients")
    .delete()
    .eq("meal_id", params.mealId)
    .eq("user_id", params.userId);

  const lines = ingredientsFrom(texto(params.bloque));
  if (lines.length === 0) return;

  await supabase.from("meals_ingredients").insert(
    lines.map((ingredient, index) => ({
      user_id: params.userId,
      meal_id: params.mealId,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      sort_order: index,
    })),
  );
}

/**
 * Una respuesta de la encuesta de comidas, guardada en cuanto se contesta.
 *
 * Como en lecturas, la fila no existe de antemano: de comidas hay tres al día
 * y varias pueden compartir hueco. La diferencia es **cuándo puede nacer**. Una
 * lectura nace de cualquier respuesta, pero una comida necesita nombre --es
 * `not null`, y una comida sin nombre no se puede enseñar en la rejilla de la
 * semana--, así que hasta que lo haya no se crea nada.
 *
 * Por eso viaja todo lo contestado y no sólo la respuesta: cuando por fin
 * llega el nombre, la fila nace con lo que ya se había contestado antes en vez
 * de perderlo.
 */
export async function saveMealAnswer(entrada: {
  mealId: string | null;
  campo: string;
  valor: RespuestaComida;
  respuestas: Record<string, RespuestaComida>;
}): Promise<MealFormState & { id: string | null }> {
  const user = await requireUser();

  const parsed = respuestaComidaSchema.safeParse({
    meal_id: entrada.mealId,
    campo: entrada.campo,
    valor: entrada.valor,
    respuestas: entrada.respuestas,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Datos inválidos.",
      success: false,
      id: entrada.mealId,
    };
  }

  const { meal_id, campo, valor, respuestas } = parsed.data;
  const supabase = await createClient();

  if (meal_id === null) {
    const nombre = texto(respuestas.name);
    const dia = diaValido(respuestas.meal_date);
    const tipo = tipoValido(respuestas.meal_type);
    // Sin nombre no hay comida que crear. Saltárselo todo no puede dejar una
    // fila en blanco, igual que en lecturas.
    if (nombre === null || dia === null || tipo === null) {
      return { error: null, success: true, id: null };
    }

    const { data: meal, error } = await supabase
      .from("meals_entries")
      .insert({
        user_id: user.id,
        meal_date: dia,
        meal_type: tipo,
        name: nombre,
        cook: texto(respuestas.cook),
        notes: texto(respuestas.notes),
        icon: texto(respuestas.icon),
      })
      .select("id")
      .maybeSingle();

    if (error || !meal) return { error: "No se pudo guardar la comida.", success: false, id: null };

    await reescribirIngredientes(supabase, {
      userId: user.id,
      mealId: meal.id,
      bloque: respuestas.ingredients,
    });

    await republishDay(dia);
    revalidateMeals();
    return { error: null, success: true, id: meal.id };
  }

  if (campo === "ingredients") {
    await reescribirIngredientes(supabase, {
      userId: user.id,
      mealId: meal_id,
      bloque: valor,
    });
    revalidateMeals();
    revalidatePath(`/comidas/${meal_id}`);
    return { error: null, success: true, id: meal_id };
  }

  const parche = columnaDeComida(campo, valor);
  // Una respuesta que no escribe nada --el nombre borrado, un tipo que no
  // existe-- no puede vaciar una columna obligatoria.
  if (Object.keys(parche).length === 0) return { error: null, success: true, id: meal_id };

  const { data: antes } = await supabase
    .from("meals_entries")
    .select("meal_date")
    .eq("id", meal_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("meals_entries")
    .update(parche)
    .eq("id", meal_id)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo guardar la comida.", success: false, id: meal_id };

  // Mover una comida de día cambia la cuenta de los dos, y recontar sólo el
  // nuevo dejaría el viejo inflado para siempre.
  const ahora = parche.meal_date ?? antes?.meal_date ?? null;
  if (ahora) await republishDay(ahora);
  if (antes && ahora && antes.meal_date !== ahora) await republishDay(antes.meal_date);

  revalidateMeals();
  revalidatePath(`/comidas/${meal_id}`);
  return { error: null, success: true, id: meal_id };
}

type ParcheComida = Partial<{
  meal_date: string;
  meal_type: (typeof MEAL_TYPES)[number];
  name: string;
  cook: string | null;
  notes: string | null;
  icon: string | null;
}>;

/**
 * La columna que toca esta respuesta, y sólo ella.
 *
 * Las obligatorias --nombre, tipo, día-- devuelven un parche vacío cuando la
 * respuesta no vale, en vez de escribir null: son `not null`, así que el
 * `update` fallaría entero y la respuesta buena de al lado se perdería con él.
 */
function columnaDeComida(campo: Exclude<CampoComida, "ingredients">, valor: RespuestaComida): ParcheComida {
  switch (campo) {
    case "name": {
      const nombre = texto(valor);
      return nombre === null ? {} : { name: nombre };
    }
    case "meal_type": {
      const tipo = tipoValido(valor);
      return tipo === null ? {} : { meal_type: tipo };
    }
    case "meal_date": {
      const dia = diaValido(valor);
      return dia === null ? {} : { meal_date: dia };
    }
    case "cook":
      return { cook: texto(valor) };
    case "notes":
      return { notes: texto(valor) };
    case "icon":
      return { icon: texto(valor) };
  }
}

/** Rehace la cuenta del día después de que la papelera se lleve una comida. */
export async function afterMealRemoved(mealDate: string): Promise<void> {
  await requireUser();
  await republishDay(mealDate);
  revalidateMeals();
}

async function republishDay(date: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("meals_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("meal_date", date);

  await publishDailyMetrics(date, [{ module: "meals", key: "comidas", value: count ?? 0 }]);
}

/** Las pantallas de Comidas miran los mismos datos, así que caducan a la vez. */
function revalidateMeals(): void {
  revalidatePath("/comidas");
  revalidatePath("/comidas/semana");
  revalidatePath("/comidas/compra");
  revalidatePath("/");
}

/**
 * Trae los datos desde Notion.
 *
 * Se dispara a mano y no por cron: la importación es de sentido único y pisa
 * lo que haya, así que una automática que cambie algo mientras se está
 * mirando la pantalla hace que la aplicación parezca embrujada.
 */
export async function runMealsFromNotion(): Promise<ImportResult> {
  await requireUser();
  const result = await importMealsFromNotion();
  if (result.error === null) revalidateMeals();
  return result;
}
