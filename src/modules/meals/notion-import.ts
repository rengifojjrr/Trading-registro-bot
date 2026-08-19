import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { EMPTY_RESULT, readNotionDatabase, type ImportResult } from "@/lib/notion/read-database";
import { createClient } from "@/lib/supabase/server";

import { mapNotionMeal, type NotionMappedMeal } from "./domain/notion-mapping";

/**
 * Trae las comidas del «🍳 Planificador de Comidas».
 *
 * El párrafo de ingredientes se parte en filas al entrar, que es toda la
 * razón de traerse este módulo: de un párrafo no sale una lista de la compra
 * con las cantidades sumadas.
 */

export function mealsDatabaseId(): string | null {
  return serverEnv().NOTION_MEALS_DATABASE_ID ?? null;
}

export async function importMealsFromNotion(): Promise<ImportResult> {
  const env = serverEnv();
  if (!env.NOTION_API_TOKEN) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_API_TOKEN en el servidor." };
  }
  if (!env.NOTION_MEALS_DATABASE_ID) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_MEALS_DATABASE_ID en el servidor." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const read = await readNotionDatabase(env.NOTION_MEALS_DATABASE_ID);
  if (!read.ok) return { ...EMPTY_RESULT, error: read.error };

  const warnings = new Set<string>();
  const meals: NotionMappedMeal[] = [];
  let skipped = 0;

  for (const page of read.pages) {
    const mapped = mapNotionMeal(page);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    for (const warning of mapped.warnings) warnings.add(warning);
    meals.push(mapped.meal);
  }

  if (meals.length === 0) {
    return { ...EMPTY_RESULT, skipped, warnings: [...warnings] };
  }

  const { data: existing } = await supabase
    .from("meals_entries")
    .select("notion_page_id")
    .eq("user_id", user.id)
    .not("notion_page_id", "is", null);
  const known = new Set((existing ?? []).map((row) => row.notion_page_id));

  const { data: saved, error } = await supabase
    .from("meals_entries")
    .upsert(
      meals.map((meal) => ({
        user_id: user.id,
        notion_page_id: meal.notion_page_id,
        meal_date: meal.meal_date,
        meal_type: meal.meal_type,
        name: meal.name,
        notes: meal.notes,
      })),
      { onConflict: "user_id,notion_page_id" },
    )
    .select("id, notion_page_id");

  if (error || !saved) {
    return { ...EMPTY_RESULT, error: "No se pudieron guardar las comidas importadas." };
  }

  // Los ingredientes se reemplazan enteros en lugar de fusionarse: si en
  // Notion se quitó uno, fusionar lo dejaría aquí para siempre y la lista de
  // la compra pediría algo que ya no lleva la receta.
  const idByPage = new Map(saved.map((row) => [row.notion_page_id, row.id]));
  const mealIds = saved.map((row) => row.id);
  if (mealIds.length > 0) {
    await supabase.from("meals_ingredients").delete().in("meal_id", mealIds);
  }

  const ingredients = meals.flatMap((meal) => {
    const mealId = idByPage.get(meal.notion_page_id);
    if (!mealId) return [];
    return meal.ingredients.map((ingredient, index) => ({
      user_id: user.id,
      meal_id: mealId,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      sort_order: index,
    }));
  });

  if (ingredients.length > 0) {
    const { error: ingredientError } = await supabase.from("meals_ingredients").insert(ingredients);
    if (ingredientError) {
      return { ...EMPTY_RESULT, error: "Las comidas se guardaron, pero no sus ingredientes." };
    }
  }

  const updated = meals.filter((meal) => known.has(meal.notion_page_id)).length;

  return {
    imported: meals.length - updated,
    updated,
    skipped,
    warnings: [...warnings],
    notes: [`${ingredients.length} ingredientes repartidos en ${meals.length} comidas.`],
    error: null,
  };
}
