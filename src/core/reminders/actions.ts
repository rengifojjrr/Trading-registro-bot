"use server";

import { revalidatePath } from "next/cache";

import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { quietFor, reminderInputSchema, type ReminderInput } from "./rule";

/**
 * Lo que se cambia de los recordatorios desde la aplicación.
 *
 * Nada de aquí calcula cuándo suena: la base pone `next_fire_at` al guardar
 * (disparador de `core_reminders`), «Hecho» y «En 1 h» son funciones de la
 * base (`recordatorio_hecho`, `recordatorio_posponer`) que usan también la
 * notificación del teléfono y, más adelante, el bot. Una sola forma de hacer
 * cada cosa.
 */

const RUTAS = ["/", "/tareas/recordatorios", "/tareas/calendario"];

function refrescar() {
  for (const r of RUTAS) revalidatePath(r);
}

export interface SaveResult {
  ok: boolean;
  error?: string;
  id?: string;
  nextFireAt?: string | null;
}

/** Crea o cambia un recordatorio. La zona es la de tus ajustes al crearlo. */
export async function saveReminderAction(input: unknown): Promise<SaveResult> {
  const user = await requireUser();
  const parsed = reminderInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisa los datos." };
  }
  const v: ReminderInput = parsed.data;
  const supabase = await createClient();

  // Lo atado tiene que ser tuyo: con un id ajeno el recordatorio colgaría de
  // algo que no ves.
  if (v.entityKind && v.entityId) {
    const tabla = v.entityKind === "PROYECTO" ? "tasks_projects" : v.entityKind === "TAREA" ? "tasks_items" : "core_people";
    const { data } = await supabase.from(tabla).select("id").eq("id", v.entityId).eq("user_id", user.id).maybeSingle();
    if (!data) return { ok: false, error: "Eso a lo que lo atas ya no está." };
  }

  const fila = {
    text: v.kind === "TEXTO" ? v.text.trim() : v.text.trim() || null,
    kind: v.kind,
    entity_kind: v.entityKind,
    entity_id: v.entityId,
    freq: v.freq,
    at_time: v.atTime,
    days: v.freq === "SEMANAL" ? [...new Set(v.days)].sort((a, b) => a - b) : [],
    monthday: v.freq === "MENSUAL" ? v.monthday : null,
    every_n: v.freq === "CADA_N_DIAS" ? v.everyN : null,
    on_date: v.onDate,
    until_date: v.freq === "UNA_VEZ" ? null : v.untilDate,
    channels: [...new Set(v.channels)],
    lock_private: v.lockPrivate,
    quiet: quietFor(v.atTime, v.timeSaid),
  };

  if (v.id) {
    const { data, error } = await supabase
      .from("core_reminders")
      .update({ ...fila, active: true })
      .eq("id", v.id)
      .eq("user_id", user.id)
      .select("id, next_fire_at")
      .maybeSingle();
    if (error || !data) return { ok: false, error: "No se pudo guardar." };
    refrescar();
    return { ok: true, id: data.id, nextFireAt: data.next_fire_at };
  }

  const { data, error } = await supabase
    .from("core_reminders")
    .insert({ ...fila, user_id: user.id, tz: await userTimezone(), origin: "A_MANO" })
    .select("id, next_fire_at")
    .single();
  if (error || !data) return { ok: false, error: "No se pudo guardar." };
  refrescar();
  return { ok: true, id: data.id, nextFireAt: data.next_fire_at };
}

/** Encender o apagar sin borrar. */
export async function setReminderActiveAction(id: string, active: boolean): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("core_reminders").update({ active }).eq("id", id).eq("user_id", user.id);
  refrescar();
  return { ok: !error };
}

/** «Hecho» desde la aplicación (también para una vez que todavía no ha sonado). */
export async function fireDoneAction(reminderId: string, fireAt: string): Promise<{ ok: boolean }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recordatorio_hecho", {
    p_reminder: reminderId,
    p_fire_at: fireAt,
    p_via: "APP",
  });
  refrescar();
  return { ok: !error && data === true };
}

/** «En 1 h» (o los minutos que digas) desde la aplicación. Devuelve cuándo vuelve. */
export async function fireSnoozeAction(
  reminderId: string,
  fireAt: string,
  minutes = 60,
): Promise<{ ok: boolean; until: string | null }> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recordatorio_posponer", {
    p_reminder: reminderId,
    p_fire_at: fireAt,
    p_minutos: Math.round(minutes),
  });
  refrescar();
  return { ok: !error && data !== null, until: data ?? null };
}

/**
 * «Las 5 próximas veces» de una regla que todavía no se ha guardado. Las
 * calcula la base con la misma función que el reloj.
 */
export async function previewReminderAction(input: unknown): Promise<{ ok: boolean; times: string[]; error?: string }> {
  await requireUser();
  const parsed = reminderInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, times: [], error: parsed.error.issues[0]?.message };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recordatorio_vista_previa", {
    p_freq: v.freq,
    p_at_time: v.atTime,
    p_days: v.freq === "SEMANAL" ? v.days : [],
    p_monthday: v.freq === "MENSUAL" ? v.monthday : null,
    p_every_n: v.freq === "CADA_N_DIAS" ? v.everyN : null,
    p_on_date: v.onDate,
    p_until_date: v.freq === "UNA_VEZ" ? null : v.untilDate,
    p_tz: await userTimezone(),
    p_quiet: quietFor(v.atTime, v.timeSaid),
    p_n: 5,
  });
  if (error) return { ok: false, times: [], error: "No pude calcular cuándo suena." };
  return { ok: true, times: (data ?? []) as string[] };
}
