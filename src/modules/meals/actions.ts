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

const schema = z.object({
  meal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida."),
  meal_type: z.enum(MEAL_TYPES),
  name: z.string().trim().min(1, "¿Qué comiste?").max(200),
  notes: emptyToNull(z.string().max(4000)),
  cook: emptyToNull(z.string().max(120)),
  icon: emptyToNull(z.string().max(8)),
  ingredients: emptyToNull(z.string().max(8000)),
});

/** Los campos del formulario, que crear y editar comparten. */
function readForm(formData: FormData) {
  return schema.safeParse({
    meal_date: formData.get("meal_date"),
    meal_type: formData.get("meal_type"),
    name: formData.get("name"),
    notes: formData.get("notes"),
    cook: formData.get("cook"),
    icon: formData.get("icon"),
    ingredients: formData.get("ingredients"),
  });
}

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

export async function saveMeal(_prev: MealFormState, formData: FormData): Promise<MealFormState> {
  const user = await requireUser();

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { data: meal, error } = await supabase
    .from("meals_entries")
    .insert({
      user_id: user.id,
      meal_date: parsed.data.meal_date,
      meal_type: parsed.data.meal_type,
      name: parsed.data.name,
      notes: parsed.data.notes,
      cook: parsed.data.cook,
      icon: parsed.data.icon,
    })
    .select("id")
    .maybeSingle();

  if (error || !meal) return { error: "No se pudo guardar la comida.", success: false };

  const lines = ingredientsFrom(parsed.data.ingredients);

  if (lines.length > 0) {
    await supabase.from("meals_ingredients").insert(
      lines.map((ingredient, index) => ({
        user_id: user.id,
        meal_id: meal.id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        sort_order: index,
      })),
    );
  }

  await republishDay(parsed.data.meal_date);
  revalidateMeals();
  return { error: null, success: true };
}

/**
 * Edita una comida.
 *
 * No existía: guardar sólo creaba, así que un ingrediente mal escrito se
 * arreglaba borrando la comida entera y tecleando los otros seis otra vez.
 *
 * Los ingredientes se reemplazan enteros en lugar de intentar casarlos uno a
 * uno con los que había. El bloque de texto no tiene identidad -- nadie
 * escribe «el tercero era cebolla» -- así que casarlos sería adivinar, y
 * adivinar mal borra el que no tocaba.
 */
export async function updateMeal(
  _prev: MealFormState,
  formData: FormData,
): Promise<MealFormState> {
  const user = await requireUser();

  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) {
    return { error: "Comida no encontrada.", success: false };
  }

  const parsed = readForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("meals_entries")
    .update({
      meal_date: parsed.data.meal_date,
      meal_type: parsed.data.meal_type,
      name: parsed.data.name,
      notes: parsed.data.notes,
      cook: parsed.data.cook,
      icon: parsed.data.icon,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: "No se pudo guardar la comida.", success: false };

  await supabase.from("meals_ingredients").delete().eq("meal_id", id).eq("user_id", user.id);

  const lines = ingredientsFrom(parsed.data.ingredients);
  if (lines.length > 0) {
    await supabase.from("meals_ingredients").insert(
      lines.map((ingredient, index) => ({
        user_id: user.id,
        meal_id: id,
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        sort_order: index,
      })),
    );
  }

  await republishDay(parsed.data.meal_date);
  revalidateMeals();
  revalidatePath(`/comidas/${id}`);
  return { error: null, success: true };
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
