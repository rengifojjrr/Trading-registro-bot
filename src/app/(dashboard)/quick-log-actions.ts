"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

/**
 * Apuntar en cinco segundos desde «Hoy», sin cambiar de pantalla.
 *
 * Sólo lo que cabe en un número. Una comida son varios ingredientes y una
 * operación es una decisión con contexto: meter eso aquí sería mover la
 * fricción, no quitarla, y para eso está el enlace a la pantalla completa.
 */

const horasSchema = z.number().positive().max(24);
const minutosSchema = z.number().int().positive().max(1440);

/**
 * «Dormí 7 h».
 *
 * `duration_minutes` la calcula Postgres a partir de los dos instantes, así
 * que hay que dar instantes y no una duración. Se **infiere** que te acabas de
 * despertar: hora de levantarse = ahora, hora de dormirse = ahora menos las
 * horas. Es correcto en el caso normal --se apunta al levantarse-- y aproximado
 * si se apunta por la noche.
 *
 * Se dice, no se disimula: la pantalla completa tiene los dos campos y está a
 * un toque desde el mismo panel. Un dato aproximado que se presenta como
 * exacto es peor que uno que pide diez segundos más.
 */
export async function quickLogSleep(hours: number): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!horasSchema.safeParse(hours).success) {
    return { error: "Pon unas horas entre 0 y 24." };
  }

  const timezone = await userTimezone();
  const ahora = new Date();
  const dormido = new Date(ahora.getTime() - hours * 60 * 60 * 1000);

  const supabase = await createClient();
  // `upsert` por (usuario, fecha): apuntar dos veces la misma noche corrige la
  // primera en vez de crear una segunda, que es lo que se espera al darse
  // cuenta de que se puso mal.
  const { error } = await supabase.from("sleep_entries").upsert(
    {
      user_id: user.id,
      sleep_date: todayIn(timezone),
      slept_at: dormido.toISOString(),
      woke_at: ahora.toISOString(),
    },
    { onConflict: "user_id,sleep_date" },
  );

  if (error) return { error: "No se pudo apuntar." };

  revalidatePath("/");
  revalidatePath("/sueno");
  return { error: null };
}

/** «Leí 30 min». Sin libro: se elige en la pantalla completa si hace falta. */
export async function quickLogReading(minutes: number): Promise<{ error: string | null }> {
  const user = await requireUser();
  if (!minutosSchema.safeParse(minutes).success) {
    return { error: "Pon unos minutos entre 1 y 1440." };
  }

  const timezone = await userTimezone();
  const supabase = await createClient();

  const { error } = await supabase.from("reading_sessions").insert({
    user_id: user.id,
    session_date: todayIn(timezone),
    minutes,
  });

  if (error) return { error: "No se pudo apuntar." };

  revalidatePath("/");
  revalidatePath("/lecturas");
  return { error: null };
}
