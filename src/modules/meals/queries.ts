import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { IngredientLike, MealType } from "@/modules/meals/domain/meals";

export interface MealRow {
  id: string;
  meal_date: string;
  meal_type: MealType;
  name: string;
  notes: string | null;
  cook: string | null;
  ingredients: IngredientLike[];
}

export async function fetchMeals(fromDate: string, toDate: string): Promise<MealRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: meals } = await supabase
    .from("meals_entries")
    .select("id, meal_date, meal_type, name, notes, cook")
    .eq("user_id", user.id)
    .gte("meal_date", fromDate)
    .lte("meal_date", toDate)
    .order("meal_date", { ascending: false });

  const rows = meals ?? [];
  if (rows.length === 0) return [];

  const { data: ingredients } = await supabase
    .from("meals_ingredients")
    .select("meal_id, name, quantity, unit")
    .in(
      "meal_id",
      rows.map((m) => m.id),
    )
    .order("sort_order", { ascending: true });

  const byMeal = new Map<string, IngredientLike[]>();
  for (const ingredient of ingredients ?? []) {
    const list = byMeal.get(ingredient.meal_id) ?? [];
    list.push({
      name: ingredient.name,
      // numeric llega como cadena.
      quantity: ingredient.quantity === null ? null : Number(ingredient.quantity),
      unit: ingredient.unit,
    });
    byMeal.set(ingredient.meal_id, list);
  }

  return rows.map((m) => ({ ...m, ingredients: byMeal.get(m.id) ?? [] }));
}
