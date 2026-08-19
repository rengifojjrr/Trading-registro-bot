"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { publishDailyMetrics } from "@/core/metrics";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  SLEEP_PART_FIELDS,
  isSleepPart,
  resolveSleepTimestamps,
  type SleepPart,
} from "@/modules/sleep/domain/sleep";
import type { ImportResult } from "@/lib/notion/read-database";
import { importSleepFromNotion } from "@/modules/sleep/notion-import";

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
  // Tu estimación de cuánto dormiste, la propiedad «Cuanto tiempo Dormí?» de
  // Notion. Se guarda aparte de la duración calculada precisamente porque la
  // diferencia entre las dos es el dato interesante.
  self_reported: emptyToNull(z.string().max(60)),
  icon: emptyToNull(z.string().max(8)),
});

/**
 * Las dos mitades de una noche.
 *
 * Se registran en momentos distintos: la primera antes de acostarse y la
 * segunda al levantarse, con horas de sueño de por medio. Por eso cada
 * guardado escribe **sólo sus columnas**: antes bastaba un guardado para pisar
 * con nulos todo lo que la otra mitad había dejado escrito, y el resultado era
 * una noche vacía después de haberla rellenado dos veces.
 */
async function saveSleepPart(
  part: SleepPart,
  _prev: SleepFormState,
  formData: FormData,
): Promise<SleepFormState> {
  const user = await requireUser();

  if (!isSleepPart(part)) {
    return { error: "Parte desconocida.", success: false };
  }

  const parsed = schema.safeParse({
    sleep_date: formData.get("sleep_date"),
    bedtime: formData.get("bedtime"),
    wake_time: formData.get("wake_time"),
    score: formData.get("score"),
    dream: formData.get("dream"),
    notes: formData.get("notes"),
    place: formData.get("place"),
    self_reported: formData.get("self_reported"),
    icon: formData.get("icon"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos.", success: false };
  }

  const { sleep_date } = parsed.data;
  const timezone = await userTimezone();
  const supabase = await createClient();

  // La hora ya guardada hace de referencia para la de la mañana: sin ella, las
  // 07:00 no sabrían si fueron antes o después de haberse acostado.
  const { data: current } = await supabase
    .from("sleep_entries")
    .select("slept_at")
    .eq("user_id", user.id)
    .eq("sleep_date", sleep_date)
    .maybeSingle();

  const { sleptAt, wokeAt } = resolveSleepTimestamps({
    sleepDate: sleep_date,
    bedtime: parsed.data.bedtime,
    wakeTime: parsed.data.wake_time,
    timezone,
    sleptAtIso: current?.slept_at ?? null,
  });

  const owns = (field: string) => SLEEP_PART_FIELDS[part].includes(field);

  const patch = {
    user_id: user.id,
    sleep_date,
    ...(owns("bedtime") ? { slept_at: sleptAt } : {}),
    ...(owns("wake_time") ? { woke_at: wokeAt } : {}),
    ...(owns("before_bed") ? { before_bed: formData.getAll("before_bed").map(String) } : {}),
    ...(owns("woke_how") ? { woke_how: formData.getAll("woke_how").map(String) } : {}),
    ...(owns("mood_on_waking")
      ? { mood_on_waking: formData.getAll("mood_on_waking").map(String) }
      : {}),
    ...(owns("score") ? { score: parsed.data.score } : {}),
    ...(owns("dream") ? { dream: parsed.data.dream } : {}),
    ...(owns("notes") ? { notes: parsed.data.notes } : {}),
    ...(owns("place") ? { place: parsed.data.place } : {}),
    ...(owns("self_reported") ? { self_reported: parsed.data.self_reported } : {}),
    ...(owns("icon") ? { icon: parsed.data.icon } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data: saved, error } = await supabase
    .from("sleep_entries")
    .upsert(patch, { onConflict: "user_id,sleep_date" })
    .select("duration_minutes, score")
    .maybeSingle();

  if (error) {
    return { error: "No se pudo guardar la noche.", success: false };
  }

  // La duración la calcula Postgres, así que se publica lo que quedó guardado
  // y no lo que creíamos haber guardado.
  const metrics = [];
  if (saved?.duration_minutes != null) {
    metrics.push({ module: "sleep" as const, key: "minutos", value: saved.duration_minutes, unit: "min" });
  }
  if (saved?.score != null) {
    metrics.push({ module: "sleep" as const, key: "puntaje", value: Number(saved.score) });
  }
  await publishDailyMetrics(sleep_date, metrics);

  revalidateSleep();
  return { error: null, success: true };
}

/** Las dos mitades, atadas para que `useActionState` las pueda usar. */
export async function saveNightHalf(
  prev: SleepFormState,
  formData: FormData,
): Promise<SleepFormState> {
  return saveSleepPart("ANTES", prev, formData);
}

export async function saveMorningHalf(
  prev: SleepFormState,
  formData: FormData,
): Promise<SleepFormState> {
  return saveSleepPart("DESPERTAR", prev, formData);
}

/**
 * Refresca después de borrar.
 *
 * Borrar ya no vive aquí: lo hace `DeleteButton` contra la papelera común, que
 * es lo que da el «deshacer». Esto sólo repinta las tres pantallas.
 */
export async function afterSleepRemoved(): Promise<void> {
  await requireUser();
  revalidateSleep();
}

/**
 * Las tres pantallas del módulo miran las mismas noches, así que las tres se
 * quedan viejas a la vez. Y «Hoy» también, que lee la métrica publicada.
 */
function revalidateSleep(): void {
  revalidatePath("/sueno");
  revalidatePath("/sueno/historial");
  revalidatePath("/sueno/analisis");
  revalidatePath("/sueno/calendario");
  revalidatePath("/");
}

/**
 * Trae los datos desde Notion.
 *
 * Se dispara a mano y no por cron: la importación es de sentido único y pisa
 * lo que haya, así que una automática que cambie algo mientras se está
 * mirando la pantalla hace que la aplicación parezca embrujada.
 */
export async function runSleepFromNotion(): Promise<ImportResult> {
  await requireUser();
  const result = await importSleepFromNotion();
  if (result.error === null) revalidateSleep();
  return result;
}
