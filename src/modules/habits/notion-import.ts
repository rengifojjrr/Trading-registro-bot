import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { serverEnv } from "@/lib/env";
import { EMPTY_RESULT, readNotionDatabase, type ImportResult } from "@/lib/notion/read-database";
import { createClient } from "@/lib/supabase/server";

import { HABIT_COLUMNS, countMarksByHabit, mapNotionHabitDay } from "./domain/notion-mapping";

/**
 * Trae los hábitos de la base «📆Hábitos 2026».
 *
 * Es la importación que más cambia de forma: allí cada hábito es una columna
 * y un día es una fila; aquí un hábito es una fila y una marca es otra. Ese
 * giro es justo lo que permite añadir, archivar o retomar un hábito sin tocar
 * el esquema ni perder el histórico -- que es lo que le pasó a 📵 y 🔞, dos
 * hábitos que el rollup mensual de Notion sigue calculando aunque ya no
 * existan en la tabla.
 */

export function habitsDatabaseId(): string | null {
  return serverEnv().NOTION_HABITS_DATABASE_ID ?? null;
}

export async function importHabitsFromNotion(): Promise<ImportResult> {
  const env = serverEnv();
  if (!env.NOTION_API_TOKEN) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_API_TOKEN en el servidor." };
  }
  if (!env.NOTION_HABITS_DATABASE_ID) {
    return { ...EMPTY_RESULT, error: "Falta configurar NOTION_HABITS_DATABASE_ID en el servidor." };
  }

  const user = await requireUser();
  const supabase = await createClient();

  const read = await readNotionDatabase(env.NOTION_HABITS_DATABASE_ID);
  if (!read.ok) return { ...EMPTY_RESULT, error: read.error };

  // Los diez hábitos primero: las marcas necesitan su identificador. Se
  // reutiliza el que ya exista con ese nombre en vez de crear un duplicado,
  // porque importar dos veces no debe dejar dos «7am».
  const { data: current } = await supabase
    .from("habits_definitions")
    .select("id, name")
    .eq("user_id", user.id);

  const idByName = new Map((current ?? []).map((h) => [h.name, h.id]));
  const missing = HABIT_COLUMNS.filter((habit) => !idByName.has(habit.name));

  if (missing.length > 0) {
    const { data: created, error } = await supabase
      .from("habits_definitions")
      .insert(
        missing.map((habit, index) => ({
          user_id: user.id,
          name: habit.name,
          emoji: habit.emoji,
          sort_order: HABIT_COLUMNS.indexOf(habit) + index,
        })),
      )
      .select("id, name");
    if (error) return { ...EMPTY_RESULT, error: "No se pudieron crear los hábitos." };
    for (const habit of created ?? []) idByName.set(habit.name, habit.id);
  }

  const days = [];
  let skipped = 0;
  for (const page of read.pages) {
    const day = mapNotionHabitDay(page);
    if (!day) {
      skipped += 1;
      continue;
    }
    days.push(day);
  }

  const rows = days.flatMap((day) =>
    day.marks
      .map((mark) => ({
        user_id: user.id,
        habit_id: idByName.get(mark.habit),
        entry_date: mark.date,
        done: true,
      }))
      .filter((row): row is typeof row & { habit_id: string } => row.habit_id !== undefined),
  );

  if (rows.length === 0) {
    return {
      ...EMPTY_RESULT,
      skipped,
      notes: [`Se leyeron ${days.length} días, pero ninguno tenía casillas marcadas.`],
    };
  }

  const { count: before } = await supabase
    .from("habits_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Las marcas se van en tandas: seis mil filas en una sola petición no
  // pasan del límite de tamaño de PostgREST.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("habits_entries")
      .upsert(rows.slice(i, i + 500), { onConflict: "user_id,habit_id,entry_date" });
    if (error) {
      return { ...EMPTY_RESULT, error: "No se pudieron guardar las marcas importadas." };
    }
  }

  const { count: after } = await supabase
    .from("habits_entries")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const imported = (after ?? 0) - (before ?? 0);
  const counts = countMarksByHabit(days);
  const never = HABIT_COLUMNS.filter((habit) => counts[habit.name] === 0).map((h) => h.name);

  const notes = [`${days.length} días leídos, del ${days[0]?.date} al ${days[days.length - 1]?.date}.`];
  if (never.length > 0) {
    notes.push(`Sin ninguna marca en todo el histórico: ${never.join(", ")}.`);
  }

  return {
    imported,
    updated: rows.length - imported,
    skipped,
    warnings: [],
    notes,
    error: null,
  };
}
