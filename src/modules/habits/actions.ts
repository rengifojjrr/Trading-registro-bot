"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { completionFor } from "@/modules/habits/domain/habits";

/**
 * Marcar y desmarcar es la operación central del módulo, y tiene que costar
 * un toque. Por eso no hay formulario: el botón llama directamente.
 */
export async function toggleHabit(habitId: string, date: string, done: boolean): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  if (done) {
    await supabase
      .from("habits_entries")
      .upsert(
        { user_id: user.id, habit_id: habitId, entry_date: date, done: true },
        { onConflict: "user_id,habit_id,entry_date" },
      );
  } else {
    // Se borra la fila en lugar de marcarla como false: la ausencia ya
    // significa "no hecho", y dos formas de decir lo mismo acaban
    // discrepando.
    await supabase
      .from("habits_entries")
      .delete()
      .eq("user_id", user.id)
      .eq("habit_id", habitId)
      .eq("entry_date", date);
  }

  await republishDay(date);
  revalidateHabits();
}

/** Recalcula el día entero desde la base, no desde lo que creíamos tener. */
async function republishDay(date: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: definitions }, { data: entries }] = await Promise.all([
    supabase.from("habits_definitions").select("id").eq("user_id", user.id).is("archived_at", null),
    supabase.from("habits_entries").select("habit_id").eq("user_id", user.id).eq("entry_date", date),
  ]);

  const completion = completionFor(
    (definitions ?? []).map((d) => d.id),
    (entries ?? []).map((e) => ({ habitId: e.habit_id, date })),
  );

  await publishDailyMetrics(date, [
    { module: "habits", key: "completados", value: completion.done },
    { module: "habits", key: "total", value: completion.total },
    ...(completion.percent === null
      ? []
      : [{ module: "habits" as const, key: "porcentaje", value: completion.percent, unit: "%" }]),
  ]);
}

const habitSchema = z.object({
  name: z.string().trim().min(1, "Ponle nombre al hábito.").max(60),
  emoji: z.string().trim().max(8).optional(),
});

export type HabitFormState = { error: string | null; success: boolean };

export async function createHabit(
  _prev: HabitFormState,
  formData: FormData,
): Promise<HabitFormState> {
  const user = await requireUser();
  const parsed = habitSchema.safeParse({
    name: formData.get("name"),
    emoji: formData.get("emoji") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("habits_definitions").insert({
    user_id: user.id,
    name: parsed.data.name,
    emoji: parsed.data.emoji || null,
    sort_order: 999,
  });

  if (error) {
    return {
      error: error.code === "23505" ? "Ya tienes un hábito con ese nombre." : "No se pudo crear el hábito.",
      success: false,
    };
  }

  revalidateHabits();
  return { error: null, success: true };
}

/**
 * Archivar, no borrar.
 *
 * Las marcas de los meses en que sí lo hiciste siguen siendo ciertas, y
 * borrarlas reescribiría el pasado. Un hábito archivado deja de contar para
 * el porcentaje de hoy y se puede retomar.
 */
export async function archiveHabit(habitId: string, archived: boolean): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  await supabase
    .from("habits_definitions")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", habitId)
    .eq("user_id", user.id);

  revalidateHabits();
}

/** Las pantallas de Hábitos miran los mismos datos, así que caducan a la vez. */
function revalidateHabits(): void {
  revalidatePath("/habitos");
  revalidatePath("/habitos/calendario");
  revalidatePath("/habitos/rachas");
  revalidatePath("/");
}
