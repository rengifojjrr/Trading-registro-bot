"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { MEAL_TYPES, parseIngredientLine } from "@/modules/meals/domain/meals";

export type MealFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

const schema = z.object({
  meal_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida."),
  meal_type: z.enum(MEAL_TYPES),
  name: z.string().trim().min(1, "¿Qué comiste?").max(200),
  notes: emptyToNull(z.string().max(4000)),
  cook: emptyToNull(z.string().max(120)),
  ingredients: emptyToNull(z.string().max(8000)),
});

export async function saveMeal(_prev: MealFormState, formData: FormData): Promise<MealFormState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    meal_date: formData.get("meal_date"),
    meal_type: formData.get("meal_type"),
    name: formData.get("name"),
    notes: formData.get("notes"),
    cook: formData.get("cook"),
    ingredients: formData.get("ingredients"),
  });
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
    })
    .select("id")
    .maybeSingle();

  if (error || !meal) return { error: "No se pudo guardar la comida.", success: false };

  // Una línea por ingrediente, interpretada. Escribir tres campos por
  // ingrediente es tedioso y acaba en que no se apuntan.
  const lines = (parsed.data.ingredients ?? "")
    .split("\n")
    .map(parseIngredientLine)
    .filter((i): i is NonNullable<typeof i> => i !== null);

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
  revalidatePath("/comidas");
  revalidatePath("/");
  return { error: null, success: true };
}

export async function deleteMeal(mealId: string, mealDate: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("meals_entries").delete().eq("id", mealId).eq("user_id", user.id);
  await republishDay(mealDate);
  revalidatePath("/comidas");
  revalidatePath("/");
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
