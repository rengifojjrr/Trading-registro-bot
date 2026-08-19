import { shiftDate } from "@/core/today";

import { MEAL_TYPES, type IngredientLike, type MealType } from "./meals";

/**
 * Lo que se puede preguntar a un histórico de comidas.
 *
 * El planificador de Notion contesta «qué toca el martes». Lo que no contesta
 * -- porque los ingredientes son un párrafo de texto libre y los platos se
 * escriben a mano cada semana -- es qué repites, qué compras siempre y qué
 * huecos dejas sin planificar.
 */

export interface AnalysableMeal {
  mealDate: string;
  mealType: MealType;
  name: string;
  ingredients: IngredientLike[];
}

export interface Point {
  label: string;
  value: number;
}

/**
 * Los platos que más repites.
 *
 * Agrupa ignorando mayúsculas y espacios de más, porque «Arroz con pollo» y
 * «arroz con pollo» son la misma cena escrita dos noches distintas.
 */
export function repeatedMeals(meals: AnalysableMeal[], minimum = 2): Point[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const meal of meals) {
    const key = meal.name.trim().toLowerCase().replace(/\s+/g, " ");
    if (key === "") continue;
    const entry = counts.get(key) ?? { label: meal.name.trim(), count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }

  return [...counts.values()]
    .filter((entry) => entry.count >= minimum)
    .map((entry) => ({ label: entry.label, value: entry.count }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Los ingredientes que aparecen en más comidas.
 *
 * Cuenta comidas, no cantidades: la pregunta es qué compras siempre, y para
 * eso «en catorce de veinte comidas» dice más que «tres kilos», que además no
 * se puede sumar entre gramos y unidades.
 */
export function commonIngredients(meals: AnalysableMeal[]): Point[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const meal of meals) {
    const seen = new Set<string>();
    for (const ingredient of meal.ingredients) {
      const key = ingredient.name.trim().toLowerCase();
      if (key === "" || seen.has(key)) continue;
      seen.add(key);
      const entry = counts.get(key) ?? { label: titleCase(ingredient.name), count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
  }

  return [...counts.values()]
    .map((entry) => ({ label: entry.label, value: entry.count }))
    .sort((a, b) => b.value - a.value);
}

function titleCase(name: string): string {
  const trimmed = name.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export interface DaySlots {
  date: string;
  /** Una entrada por tipo de comida; null cuando ese hueco está sin planificar. */
  slots: { type: MealType; meals: AnalysableMeal[] }[];
}

/**
 * La rejilla de la semana: siete días por tres comidas.
 *
 * Devuelve siempre los veintiún huecos, incluidos los vacíos, porque el hueco
 * vacío es la información: es donde hay que decidir algo. Una rejilla que
 * sólo enseñara lo planificado se vería llena estando medio vacía.
 */
export function weekGrid(meals: AnalysableMeal[], fromDate: string, days = 7): DaySlots[] {
  const grid: DaySlots[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const date = shiftDate(fromDate, offset);
    grid.push({
      date,
      slots: MEAL_TYPES.map((type) => ({
        type,
        meals: meals.filter((m) => m.mealDate === date && m.mealType === type),
      })),
    });
  }

  return grid;
}

/** Cuántos de los huecos de la semana están planificados, de 0 a 100. */
export function planningCoverage(grid: DaySlots[]): number | null {
  const total = grid.reduce((sum, day) => sum + day.slots.length, 0);
  if (total === 0) return null;

  const filled = grid.reduce(
    (sum, day) => sum + day.slots.filter((slot) => slot.meals.length > 0).length,
    0,
  );
  return Math.round((filled / total) * 100);
}

/** Cuántas comidas hay registradas de cada tipo, para ver cuál se te olvida. */
export function countsByType(meals: AnalysableMeal[]): Point[] {
  return MEAL_TYPES.map((type) => ({
    label: type.charAt(0) + type.slice(1).toLowerCase(),
    value: meals.filter((m) => m.mealType === type).length,
  }));
}
