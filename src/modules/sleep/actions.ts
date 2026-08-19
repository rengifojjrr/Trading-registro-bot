"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { resolveSleepTimestamps } from "@/modules/sleep/domain/sleep";

export type SleepFormState = { error: string | null; success: boolean };

const emptyToNull = <T extends z.ZodTypeAny>(inner: T) =>
  z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), inner.nullable());

const schema = z.object({
  sleep_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha no válida."),
  bedtime: emptyToNull(z.string()),
  wake_time: emptyToNull(z.string()),
  score: emptyToNull(z.coerce.number().min(0).max(10)),
  dream: emptyToNull(z.string().max(8000)),
  notes: emptyToNull(z.string().max(4000)),
  place: emptyToNull(z.string().max(120)),
});

/**
 * Guarda la noche.
 *
 * Una noche por fecha: volver a guardar la misma corrige en lugar de
 * duplicar, porque lo normal es apuntar la hora al levantarse y el sueño y
 * la puntuación más tarde.
 */
export async function saveSleepEntry(
  _prev: SleepFormState,
  formData: FormData,
): Promise<SleepFormState> {
  const user = await requireUser();

  const parsed = schema.safeParse({
    sleep_date: formData.get("sleep_date"),
    bedtime: formData.get("bedtime"),
    wake_time: formData.get("wake_time"),
    score: formData.get("score"),
    dream: formData.get("dream"),
    notes: formData.get("notes"),
    place: formData.get("place"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const timezone = await userTimezone();
  const { sleptAt, wokeAt } = resolveSleepTimestamps({
    sleepDate: parsed.data.sleep_date,
    bedtime: parsed.data.bedtime,
    wakeTime: parsed.data.wake_time,
    timezone,
  });

  const supabase = await createClient();
  const { data: saved, error } = await supabase
    .from("sleep_entries")
    .upsert(
      {
        user_id: user.id,
        sleep_date: parsed.data.sleep_date,
        slept_at: sleptAt,
        woke_at: wokeAt,
        score: parsed.data.score,
        mood_on_waking: formData.getAll("mood_on_waking").map(String),
        woke_how: formData.getAll("woke_how").map(String),
        before_bed: formData.getAll("before_bed").map(String),
        dream: parsed.data.dream,
        notes: parsed.data.notes,
        place: parsed.data.place,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,sleep_date" },
    )
    .select("duration_minutes, score")
    .maybeSingle();

  if (error) {
    return { error: "No se pudo guardar la noche.", success: false };
  }

  // La duración la calcula Postgres, así que se publica lo que quedó
  // guardado y no lo que creíamos haber guardado.
  const metrics = [];
  if (saved?.duration_minutes != null) {
    metrics.push({ module: "sleep" as const, key: "minutos", value: saved.duration_minutes, unit: "min" });
  }
  if (saved?.score != null) {
    metrics.push({ module: "sleep" as const, key: "puntaje", value: Number(saved.score) });
  }
  await publishDailyMetrics(parsed.data.sleep_date, metrics);

  revalidatePath("/sueno");
  revalidatePath("/");
  return { error: null, success: true };
}

export async function deleteSleepEntry(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("sleep_entries").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/sueno");
  revalidatePath("/");
}
