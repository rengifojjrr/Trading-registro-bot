import "server-only";

import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { DateTime } from "@/lib/fecha";
import { createClient } from "@/lib/supabase/server";
import type {
  ProjectColor,
  ReminderChannel,
  ReminderDoneVia,
  ReminderEntityKind,
  ReminderKind,
  ReminderOrigin,
} from "@/types/database";

import { ruleOf, type ReminderRule } from "./rule";

/**
 * Lo que leen las pantallas de recordatorios: la lista, «Ahora» en Hoy y el
 * calendario. Sólo lee; cuándo suena lo dice la base (`next_fire_at`,
 * `recordatorios_entre`), nunca se calcula aquí.
 *
 * Lo que va atado (proyecto, tarea, persona) se lee por el nombre de su tabla,
 * como hace `core/day.ts`: el núcleo no importa módulos.
 */

export interface ReminderView {
  id: string;
  text: string | null;
  kind: ReminderKind;
  entityKind: ReminderEntityKind | null;
  entityId: string | null;
  /** «Petróleo VZ», «Llamar al abogado», «Andrés». Nulo si lo atado ya no está. */
  entityLabel: string | null;
  entityColor: ProjectColor | null;
  rule: ReminderRule;
  tz: string;
  channels: ReminderChannel[];
  lockPrivate: boolean;
  quiet: boolean;
  active: boolean;
  snoozeUntil: string | null;
  nextFireAt: string | null;
  lastFiredAt: string | null;
  origin: ReminderOrigin;
  createdAt: string;
}

export interface FireView {
  reminderId: string;
  fireAt: string;
  missed: boolean;
  pushedAt: string | null;
  doneAt: string | null;
  doneVia: ReminderDoneVia | null;
  snoozedTo: string | null;
}

/** Una vez de hoy, para «Ahora»: lo que ya sonó y lo que falta. */
export interface NowItem {
  reminder: ReminderView;
  fireAt: string;
  estado: "PENDIENTE" | "SONO" | "HECHO" | "POSPUESTO";
  snoozedTo: string | null;
}

const COLUMNAS =
  "id, text, kind, entity_kind, entity_id, freq, at_time, days, monthday, every_n, on_date, until_date, tz, channels, lock_private, quiet, active, snooze_until, next_fire_at, last_fired_at, origin, created_at";

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface FilaRecordatorio {
  id: string;
  text: string | null;
  kind: ReminderKind;
  entity_kind: ReminderEntityKind | null;
  entity_id: string | null;
  freq: ReminderView["rule"]["freq"];
  at_time: string;
  days: number[];
  monthday: number | null;
  every_n: number | null;
  on_date: string | null;
  until_date: string | null;
  tz: string;
  channels: ReminderChannel[];
  lock_private: boolean;
  quiet: boolean;
  active: boolean;
  snooze_until: string | null;
  next_fire_at: string | null;
  last_fired_at: string | null;
  origin: ReminderOrigin;
  created_at: string;
}

async function etiquetas(
  supabase: Supabase,
  userId: string,
  filas: FilaRecordatorio[],
): Promise<Map<string, { label: string; color: ProjectColor | null }>> {
  const ids = (k: ReminderEntityKind) =>
    [...new Set(filas.filter((f) => f.entity_kind === k && f.entity_id).map((f) => f.entity_id!))];
  const [proyectos, tareas, personas] = await Promise.all([
    ids("PROYECTO").length > 0
      ? supabase.from("tasks_projects").select("id, name, color").eq("user_id", userId).in("id", ids("PROYECTO"))
      : Promise.resolve({ data: [] as { id: string; name: string; color: ProjectColor | null }[] }),
    ids("TAREA").length > 0
      ? supabase.from("tasks_items").select("id, title").eq("user_id", userId).in("id", ids("TAREA"))
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    ids("PERSONA").length > 0
      ? supabase.from("core_people").select("id, name, color").eq("user_id", userId).in("id", ids("PERSONA"))
      : Promise.resolve({ data: [] as { id: string; name: string; color: ProjectColor | null }[] }),
  ]);
  const mapa = new Map<string, { label: string; color: ProjectColor | null }>();
  for (const p of proyectos.data ?? []) mapa.set(p.id, { label: p.name, color: p.color ?? null });
  for (const t of tareas.data ?? []) mapa.set(t.id, { label: t.title, color: null });
  for (const p of personas.data ?? []) mapa.set(p.id, { label: p.name, color: p.color ?? null });
  return mapa;
}

function vista(f: FilaRecordatorio, mapa: Map<string, { label: string; color: ProjectColor | null }>): ReminderView {
  const atado = f.entity_id ? mapa.get(f.entity_id) : undefined;
  return {
    id: f.id,
    text: f.text,
    kind: f.kind,
    entityKind: f.entity_kind,
    entityId: f.entity_id,
    entityLabel: atado?.label ?? null,
    entityColor: atado?.color ?? null,
    rule: ruleOf(f),
    tz: f.tz,
    channels: f.channels,
    lockPrivate: f.lock_private,
    quiet: f.quiet,
    active: f.active,
    snoozeUntil: f.snooze_until,
    nextFireAt: f.next_fire_at,
    lastFiredAt: f.last_fired_at,
    origin: f.origin,
    createdAt: f.created_at,
  };
}

function disparo(f: {
  reminder_id: string;
  fire_at: string;
  missed: boolean;
  pushed_at: string | null;
  done_at: string | null;
  done_via: ReminderDoneVia | null;
  snoozed_to: string | null;
}): FireView {
  return {
    reminderId: f.reminder_id,
    fireAt: f.fire_at,
    missed: f.missed,
    pushedAt: f.pushed_at,
    doneAt: f.done_at,
    doneVia: f.done_via,
    snoozedTo: f.snoozed_to,
  };
}

/** El mismo instante escrito de dos maneras («…+00:00» y «…Z») es el mismo. */
export function sameInstant(a: string, b: string): boolean {
  return Date.parse(a) === Date.parse(b);
}

/** Todos los recordatorios, los disparos de los últimos 7 días y las veces de hoy. */
export async function fetchRemindersOverview(): Promise<{
  reminders: ReminderView[];
  fires: FireView[];
  now: NowItem[];
  today: string;
  timezone: string;
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const desde = DateTime.now().setZone(timezone).minus({ days: 7 }).startOf("day").toUTC().toISO()!;

  const [{ data: filas }, { data: disparos }] = await Promise.all([
    supabase.from("core_reminders").select(COLUMNAS).eq("user_id", user.id).order("created_at"),
    supabase
      .from("core_reminder_fires")
      .select("reminder_id, fire_at, missed, pushed_at, done_at, done_via, snoozed_to")
      .eq("user_id", user.id)
      .gte("fire_at", desde)
      .order("fire_at", { ascending: false })
      .limit(500),
  ]);

  const lista = (filas ?? []) as FilaRecordatorio[];
  const mapa = await etiquetas(supabase, user.id, lista);
  const reminders = lista.map((f) => vista(f, mapa));
  const fires = (disparos ?? []).map(disparo);
  const now = await nowItems(supabase, reminders, fires, timezone);

  return { reminders, fires, now, today, timezone };
}

/** Sólo lo de hoy, para «Ahora» en la portada. */
export async function fetchNowReminders(): Promise<{ items: NowItem[]; timezone: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const timezone = await userTimezone();
  const inicio = DateTime.now().setZone(timezone).startOf("day").toUTC().toISO()!;

  const [{ data: filas }, { data: disparos }] = await Promise.all([
    supabase.from("core_reminders").select(COLUMNAS).eq("user_id", user.id),
    supabase
      .from("core_reminder_fires")
      .select("reminder_id, fire_at, missed, pushed_at, done_at, done_via, snoozed_to")
      .eq("user_id", user.id)
      .gte("fire_at", inicio)
      .limit(200),
  ]);
  const lista = (filas ?? []) as FilaRecordatorio[];
  const mapa = await etiquetas(supabase, user.id, lista);
  const reminders = lista.map((f) => vista(f, mapa));
  const items = await nowItems(supabase, reminders, (disparos ?? []).map(disparo), timezone);
  return { items, timezone };
}

/**
 * Las veces de hoy: las de la regla (de la base, `recordatorios_entre`) más
 * los disparos que hubo (un «en 1 h» que volvió a sonar no está en la regla).
 */
async function nowItems(
  supabase: Supabase,
  reminders: ReminderView[],
  fires: FireView[],
  timezone: string,
): Promise<NowItem[]> {
  const hoy = DateTime.now().setZone(timezone);
  const inicio = hoy.startOf("day");
  const fin = inicio.plus({ days: 1 });

  const { data: veces } = await supabase.rpc("recordatorios_entre", {
    p_desde: inicio.toUTC().toISO()!,
    p_hasta: fin.toUTC().toISO()!,
  });

  const porId = new Map(reminders.map((r) => [r.id, r]));
  const deHoy = fires.filter((f) => {
    const t = Date.parse(f.fireAt);
    return t >= inicio.toMillis() && t < fin.toMillis();
  });

  const items: NowItem[] = [];
  const vistos = new Set<string>();
  const clave = (id: string, at: string) => `${id}|${Date.parse(at)}`;

  for (const f of deHoy) {
    const r = porId.get(f.reminderId);
    if (!r || f.missed) continue;
    vistos.add(clave(f.reminderId, f.fireAt));
    items.push({
      reminder: r,
      fireAt: f.fireAt,
      estado: f.doneAt ? "HECHO" : f.snoozedTo ? "POSPUESTO" : "SONO",
      snoozedTo: f.snoozedTo,
    });
  }
  for (const v of (veces ?? []) as { reminder_id: string; fire_at: string }[]) {
    const r = porId.get(v.reminder_id);
    if (!r || vistos.has(clave(v.reminder_id, v.fire_at))) continue;
    vistos.add(clave(v.reminder_id, v.fire_at));
    items.push({ reminder: r, fireAt: v.fire_at, estado: "PENDIENTE", snoozedTo: null });
  }
  return items.sort((a, b) => Date.parse(a.fireAt) - Date.parse(b.fireAt));
}

/** Las veces que suenan entre dos días (para el calendario), con su recordatorio. */
export async function fetchReminderOccurrences(
  fromDate: string,
  toDate: string,
): Promise<{ date: string; fireAt: string; reminder: ReminderView }[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const timezone = await userTimezone();

  // Lo que ya pasó no se pinta con la regla: el calendario enseña lo que viene.
  const desdeDia = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day");
  const ahora = DateTime.now().setZone(timezone).startOf("day");
  const desde = desdeDia < ahora ? ahora : desdeDia;
  const hasta = DateTime.fromISO(toDate, { zone: timezone }).plus({ days: 1 }).startOf("day");
  if (hasta <= desde) return [];

  const [{ data: filas }, { data: veces }] = await Promise.all([
    supabase.from("core_reminders").select(COLUMNAS).eq("user_id", user.id).eq("active", true),
    supabase.rpc("recordatorios_entre", { p_desde: desde.toUTC().toISO()!, p_hasta: hasta.toUTC().toISO()! }),
  ]);
  const lista = (filas ?? []) as FilaRecordatorio[];
  const mapa = await etiquetas(supabase, user.id, lista);
  const porId = new Map(lista.map((f) => [f.id, vista(f, mapa)]));

  return ((veces ?? []) as { reminder_id: string; fire_at: string }[])
    .filter((v) => porId.has(v.reminder_id))
    .map((v) => ({
      date: DateTime.fromISO(v.fire_at).setZone(timezone).toISODate()!,
      fireAt: v.fire_at,
      reminder: porId.get(v.reminder_id)!,
    }));
}

/** Los proyectos, tareas y personas a los que se puede atar un recordatorio. */
export async function fetchReminderTargets(): Promise<{
  projects: { id: string; name: string; color: ProjectColor | null; icon: string | null }[];
  people: { id: string; name: string }[];
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: proyectos }, { data: personas }] = await Promise.all([
    supabase
      .from("tasks_projects")
      .select("id, name, color, icon, is_active")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("core_people")
      .select("id, name, is_owner, archived_at")
      .eq("user_id", user.id)
      .eq("is_owner", false)
      .is("archived_at", null)
      .order("name"),
  ]);
  return {
    projects: (proyectos ?? []).map((p) => ({ id: p.id, name: p.name, color: p.color ?? null, icon: p.icon ?? null })),
    people: (personas ?? []).map((p) => ({ id: p.id, name: p.name })),
  };
}
