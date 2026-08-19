import "server-only";

import { shiftDate } from "@/core/today";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

export interface HabitWithHistory {
  id: string;
  name: string;
  emoji: string | null;
  archivedAt: string | null;
  /** Fechas ISO marcadas, dentro de la ventana consultada. */
  dates: string[];
  doneToday: boolean;
}

/**
 * Los hábitos con su historial reciente.
 *
 * Una sola consulta de marcas para todos los hábitos y luego agrupación en
 * memoria: son decenas de filas por mes, no miles, y hacerlo así evita una
 * consulta por hábito.
 */
export async function fetchHabits(today: string, windowDays = 120): Promise<HabitWithHistory[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const from = shiftDate(today, -windowDays);

  const [{ data: definitions }, { data: entries }] = await Promise.all([
    supabase
      .from("habits_definitions")
      .select("id, name, emoji, archived_at")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("habits_entries")
      .select("habit_id, entry_date")
      .eq("user_id", user.id)
      .gte("entry_date", from)
      .lte("entry_date", today),
  ]);

  const byHabit = new Map<string, string[]>();
  for (const entry of entries ?? []) {
    const list = byHabit.get(entry.habit_id) ?? [];
    list.push(entry.entry_date);
    byHabit.set(entry.habit_id, list);
  }

  return (definitions ?? []).map((d) => {
    const dates = byHabit.get(d.id) ?? [];
    return {
      id: d.id,
      name: d.name,
      emoji: d.emoji,
      archivedAt: d.archived_at,
      dates,
      doneToday: dates.includes(today),
    };
  });
}
