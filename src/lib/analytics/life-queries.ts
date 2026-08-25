import "server-only";

import { DateTime } from "luxon";

import { createClient } from "@/lib/supabase/server";

import type { DayRow } from "./life-correlation";

/**
 * Un día por fila, con lo que pasó en la vida y lo que pasó en la cuenta.
 *
 * El cruce se hace por fecha local, no por UTC. Una operación cerrada a las
 * 23:30 en Bogotá es del mismo día que la noche que dormiste antes; en UTC ya
 * es mañana, y el cruce quedaría desplazado un día entero -- que es la forma
 * más silenciosa de inventarse una correlación.
 *
 * El sueño se asigna al día en que **te levantas**, no a la noche en que te
 * acuestas, porque lo que se quiere comparar es cómo operaste con lo que
 * dormiste antes de operar. `sleep_date` ya guarda esa fecha.
 */
export async function fetchLifeTradingDays(params: {
  userId: string;
  timezone: string;
  /** Cuántos días atrás mirar. Un año da muestra sin traerse el histórico entero. */
  days?: number;
}): Promise<DayRow[]> {
  const supabase = await createClient();
  const { userId, timezone } = params;

  const desde = DateTime.now().setZone(timezone).minus({ days: params.days ?? 365 }).startOf("day");
  const desdeIso = desde.toUTC().toISO() ?? new Date(0).toISOString();
  const desdeFecha = desde.toISODate() ?? "1970-01-01";

  const [{ data: trades }, { data: sleep }, { data: habits }, { data: tasks }, { data: readings }] =
    await Promise.all([
    supabase
      .from("trades")
      .select("closed_at, net_pnl")
      .eq("user_id", userId)
      .is("orphaned_at", null)
      .not("closed_at", "is", null)
      .gte("closed_at", desdeIso),
    supabase
      .from("sleep_entries")
      .select("sleep_date, duration_minutes, score")
      .eq("user_id", userId)
      .gte("sleep_date", desdeFecha),
    supabase
      .from("habits_entries")
      .select("entry_date, done")
      .eq("user_id", userId)
      .gte("entry_date", desdeFecha),
    // Tareas cerradas y lecturas: los otros dos módulos con datos suficientes
    // para cruzar. Estaban guardando desde hace meses sin que nadie los mirara
    // contra la cuenta.
    supabase
      .from("tasks_items")
      .select("completed_at")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .gte("completed_at", desdeIso),
    supabase
      .from("reading_sessions")
      .select("session_date")
      .eq("user_id", userId)
      .gte("session_date", desdeFecha),
  ]);

  const porDia = new Map<string, DayRow>();
  const asegurar = (date: string): DayRow => {
    const existente = porDia.get(date);
    if (existente) return existente;
    const nuevo: DayRow = {
      date,
      sleepMinutes: null,
      sleepScore: null,
      habitsDone: 0,
      habitsTracked: 0,
      tasksDone: 0,
      didRead: false,
      netPnl: "0",
      tradeCount: 0,
    };
    porDia.set(date, nuevo);
    return nuevo;
  };

  for (const trade of trades ?? []) {
    if (!trade.closed_at) continue;
    const fecha = DateTime.fromISO(trade.closed_at, { zone: "utc" }).setZone(timezone).toISODate();
    if (!fecha) continue;
    const fila = asegurar(fecha);
    fila.netPnl = String(Number(fila.netPnl) + Number(trade.net_pnl ?? 0));
    fila.tradeCount += 1;
  }

  for (const noche of sleep ?? []) {
    const fila = asegurar(noche.sleep_date);
    fila.sleepMinutes = noche.duration_minutes;
    fila.sleepScore = noche.score === null ? null : Number(noche.score);
  }

  for (const marca of habits ?? []) {
    const fila = asegurar(marca.entry_date);
    fila.habitsTracked += 1;
    if (marca.done) fila.habitsDone += 1;
  }

  // La tarea se cuenta el día en que se cerró, en hora local, por el mismo
  // motivo que la operación: en UTC, cerrar a las 23:30 en Bogotá es mañana.
  for (const tarea of tasks ?? []) {
    if (!tarea.completed_at) continue;
    const fecha = DateTime.fromISO(tarea.completed_at, { zone: "utc" })
      .setZone(timezone)
      .toISODate();
    if (!fecha) continue;
    asegurar(fecha).tasksDone += 1;
  }

  for (const lectura of readings ?? []) {
    asegurar(lectura.session_date).didRead = true;
  }

  return [...porDia.values()].sort((a, b) => a.date.localeCompare(b.date));
}
