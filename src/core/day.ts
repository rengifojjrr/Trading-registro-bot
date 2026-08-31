import "server-only";

import { DateTime } from "luxon";

import { splitTradingDay, tradingDayWindow } from "@/lib/analytics/trading-day";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { Database, ProjectColor } from "@/types/database";

import { pieceTouches, taskDays, taskTouches } from "./day-rules";
import { userTimezone } from "./user-settings";

/**
 * Todo lo que pasó un día, de todos los módulos.
 *
 * Existe para que haya **una** ficha de día y no una por calendario. Contenido,
 * tareas, trading y la pantalla de inicio tienen cada uno su rejilla de mes, y
 * antes de esto pulsar un día no llevaba a ningún sitio en ninguno de los
 * cuatro. Tres vistas de día distintas habrían sido tres sitios donde arreglar
 * la misma cosa, y además ninguna habría respondido la pregunta real -- «qué
 * pasó el jueves» no distingue de qué módulo viene cada cosa.
 *
 * Vive en `core` y consulta las tablas por su nombre, sin importar ningún
 * módulo: si importara uno, core dejaría de poder existir sin él.
 */

export interface DaySleep {
  id: string;
  durationMinutes: number | null;
  score: number | null;
  sleptAt: string | null;
  wokeAt: string | null;
  beforeBed: string[];
  wokeHow: string[];
  moodOnWaking: string[];
  dream: string | null;
  place: string | null;
  icon: string | null;
}

export interface DayHabit {
  id: string;
  name: string;
  emoji: string | null;
  done: boolean;
}

export interface DayTask {
  id: string;
  title: string;
  status: "NO_INICIADA" | "EN_CURSO" | "HECHA";
  priority: "ALTA" | "MEDIA" | "BAJA";
  icon: string | null;
  projectName: string | null;
  projectColor: ProjectColor | null;
  /** Vence ese día, se cerró ese día, o ambas. */
  due: boolean;
  completed: boolean;
}

export interface DayMeal {
  id: string;
  name: string;
  mealType: "DESAYUNO" | "ALMUERZO" | "CENA";
  icon: string | null;
  ingredients: number;
}

export interface DayReading {
  id: string;
  bookTitle: string | null;
  minutes: number | null;
  pages: number | null;
  summary: string | null;
}

/** Los diez estados del calendario de contenido, tomados del esquema. */
type ContentStatus = Database["public"]["Tables"]["content_pieces"]["Row"]["status"];

export interface DayContent {
  id: string;
  title: string;
  status: ContentStatus;
  icon: string | null;
  /** Estaba prevista ese día, se publicó ese día, o ambas. */
  planned: boolean;
  published: boolean;
}

export interface DayTrade {
  id: string;
  productId: string;
  direction: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  netPnl: number | null;
  openedAt: string;
  closedAt: string | null;
  /**
   * Si cerró este día.
   *
   * Es lo que decide si su P&L cuenta en el total del día: una operación deja
   * dinero el día que se cierra. Sin esto, una operación abierta el lunes y
   * cerrada el jueves sumaría su resultado al lunes, y la ficha del día
   * contradiría al calendario de trading.
   */
  closedThisDay: boolean;
}

export interface DaySummary {
  date: string;
  sleep: DaySleep | null;
  habits: DayHabit[];
  tasks: DayTask[];
  meals: DayMeal[];
  reading: DayReading[];
  content: DayContent[];
  trades: DayTrade[];
}

/** Si el día tiene algo que enseñar. */
export function dayIsEmpty(day: DaySummary): boolean {
  return (
    day.sleep === null &&
    day.habits.every((h) => !h.done) &&
    day.tasks.length === 0 &&
    day.meals.length === 0 &&
    day.reading.length === 0 &&
    day.content.length === 0 &&
    day.trades.length === 0
  );
}

export async function fetchDay(date: string): Promise<DaySummary> {
  const user = await requireUser();
  const supabase = await createClient();

  /**
   * El día del usuario, en instantes UTC.
   *
   * Antes se comparaba `opened_at` -- que es `timestamptz` -- contra
   * `"2026-08-25T00:00:00"` a secas, o sea contra la medianoche del servidor.
   * En cualquier zona que no sea UTC eso corre el día unas horas y las
   * operaciones del principio o del final caían en el día de al lado.
   */
  const timezone = await userTimezone();
  const window = tradingDayWindow(date, timezone);

  const [
    sleep,
    habits,
    marks,
    tasks,
    projects,
    meals,
    ingredients,
    reading,
    books,
    content,
    tradesAbiertas,
    tradesCerradas,
  ] = await Promise.all([
      supabase
        .from("sleep_entries")
        .select(
          "id, duration_minutes, score, slept_at, woke_at, before_bed, woke_how, mood_on_waking, dream, place, icon",
        )
        .eq("user_id", user.id)
        .eq("sleep_date", date)
        .maybeSingle(),

      supabase
        .from("habits_definitions")
        .select("id, name, emoji, archived_at")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true }),

      supabase
        .from("habits_entries")
        .select("habit_id")
        .eq("user_id", user.id)
        .eq("entry_date", date)
        .eq("done", true),

      supabase
        .from("tasks_items")
        .select("id, title, status, priority, icon, project_id, due_date, due_end, completed_at")
        .eq("user_id", user.id),

      supabase.from("tasks_projects").select("id, name, color").eq("user_id", user.id),

      supabase
        .from("meals_entries")
        .select("id, name, meal_type, icon")
        .eq("user_id", user.id)
        .eq("meal_date", date),

      supabase.from("meals_ingredients").select("meal_id").eq("user_id", user.id),

      supabase
        .from("reading_sessions")
        .select("id, book_id, minutes, pages, summary")
        .eq("user_id", user.id)
        .eq("session_date", date),

      supabase.from("reading_books").select("id, title").eq("user_id", user.id),

      supabase
        .from("content_pieces")
        .select("id, title, status, icon, planned_date, published_at")
        .eq("user_id", user.id),

      // Dos consultas, porque un día lo tocan dos cosas distintas: lo que se
      // abrió y lo que se cerró. Buscar sólo por apertura escondía del jueves
      // la operación que ese día se cerró -- justo la que puso la cifra en la
      // celda del calendario de trading que te trajo aquí.
      supabase
        .from("trades")
        .select(TRADE_COLUMNS)
        .eq("user_id", user.id)
        .is("orphaned_at", null)
        .gte("opened_at", window.from)
        .lte("opened_at", window.to),

      supabase
        .from("trades")
        .select(TRADE_COLUMNS)
        .eq("user_id", user.id)
        .is("orphaned_at", null)
        .gte("closed_at", window.from)
        .lte("closed_at", window.to),
    ]);

  const doneHabits = new Set((marks.data ?? []).map((m) => m.habit_id));
  const projectById = new Map((projects.data ?? []).map((p) => [p.id, p]));

  const ingredientCount = new Map<string, number>();
  for (const row of ingredients.data ?? []) {
    ingredientCount.set(row.meal_id, (ingredientCount.get(row.meal_id) ?? 0) + 1);
  }

  const bookTitle = new Map((books.data ?? []).map((b) => [b.id, b.title]));

  return {
    date,

    sleep: sleep.data
      ? {
          id: sleep.data.id,
          durationMinutes: sleep.data.duration_minutes,
          score: sleep.data.score === null ? null : Number(sleep.data.score),
          sleptAt: sleep.data.slept_at,
          wokeAt: sleep.data.woke_at,
          beforeBed: sleep.data.before_bed,
          wokeHow: sleep.data.woke_how,
          moodOnWaking: sleep.data.mood_on_waking,
          dream: sleep.data.dream,
          place: sleep.data.place,
          icon: sleep.data.icon,
        }
      : null,

    // Los archivados sólo salen si ese día estaban marcados: enseñar un hábito
    // que ya no llevas, y encima sin marcar, es ruido en la ficha de un día.
    habits: (habits.data ?? [])
      .filter((h) => h.archived_at === null || doneHabits.has(h.id))
      .map((h) => ({ id: h.id, name: h.name, emoji: h.emoji, done: doneHabits.has(h.id) })),

    tasks: (tasks.data ?? [])
      .map((t) => {
        const { due, done: completed } = taskTouches(t, date);
        if (!due && !completed) return null;

        const project = t.project_id ? projectById.get(t.project_id) : undefined;
        return {
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          icon: t.icon,
          projectName: project?.name ?? null,
          projectColor: project?.color ?? null,
          due,
          completed,
        };
      })
      .filter((t): t is DayTask => t !== null),

    meals: (meals.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      mealType: m.meal_type,
      icon: m.icon,
      ingredients: ingredientCount.get(m.id) ?? 0,
    })),

    reading: (reading.data ?? []).map((r) => ({
      id: r.id,
      bookTitle: r.book_id ? (bookTitle.get(r.book_id) ?? null) : null,
      minutes: r.minutes,
      pages: r.pages,
      summary: r.summary,
    })),

    content: (content.data ?? [])
      .map((c) => {
        const { due: planned, done: published } = pieceTouches(c, date);
        if (!planned && !published) return null;
        return {
          id: c.id,
          title: c.title,
          status: c.status,
          icon: c.icon,
          planned,
          published,
        };
      })
      .filter((c): c is DayContent => c !== null),

    trades: dayTrades(
      [...(tradesAbiertas.data ?? []), ...(tradesCerradas.data ?? [])],
      window,
    ),
  };
}

const TRADE_COLUMNS = "id, product_id, direction, status, net_pnl, opened_at, closed_at";

type TradeRow = Pick<
  Database["public"]["Tables"]["trades"]["Row"],
  "id" | "product_id" | "direction" | "status" | "net_pnl" | "opened_at" | "closed_at"
>;

/**
 * Las operaciones del día, sin repetir y sabiendo cuáles lo cierran.
 *
 * Una operación abierta y cerrada el mismo día viene en las dos consultas, así
 * que primero se quitan las repetidas por id -- si no, la ficha del día
 * enseñaría dos veces la misma y su P&L contaría doble.
 */
function dayTrades(rows: TradeRow[], window: { from: string; to: string }): DayTrade[] {
  const porId = new Map<string, TradeRow>();
  for (const row of rows) porId.set(row.id, row);

  const { closed, opened } = splitTradingDay([...porId.values()], window);
  const cerradaHoy = new Set(closed.map((t) => t.id));

  return [...closed, ...opened].map((t) => ({
    id: t.id,
    productId: t.product_id,
    direction: t.direction,
    status: t.status,
    netPnl: t.net_pnl === null ? null : Number(t.net_pnl),
    openedAt: t.opened_at,
    closedAt: t.closed_at,
    closedThisDay: cerradaHoy.has(t.id),
  }));
}

/**
 * Qué módulos tienen algo en cada día de un rango.
 *
 * Es lo que pinta los puntos de colores del calendario general: una consulta
 * por módulo para todo el mes, en lugar de treinta consultas por día.
 */
export type DayMarkers = Map<string, Set<string>>;

export async function fetchMarkers(fromDate: string, toDate: string): Promise<DayMarkers> {
  const user = await requireUser();
  const supabase = await createClient();
  const timezone = await userTimezone();

  // El rango entero en instantes UTC, por lo mismo que en `fetchDay`: los
  // instantes de trading no se pueden comparar contra fechas a secas.
  const rango = {
    from: tradingDayWindow(fromDate, timezone).from,
    to: tradingDayWindow(toDate, timezone).to,
  };

  const markers: DayMarkers = new Map();
  const mark = (date: string | null | undefined, module: string) => {
    if (!date) return;
    const day = date.slice(0, 10);
    if (day < fromDate || day > toDate) return;
    const set = markers.get(day) ?? new Set<string>();
    set.add(module);
    markers.set(day, set);
  };

  /**
   * Igual, pero para una marca de tiempo con hora.
   *
   * Cortar los diez primeros caracteres de `2026-08-26T01:00:00+00:00` da el
   * día en UTC, no el del usuario: en Bogotá eso es todavía la noche del 25, y
   * el punto de trading salía en el día de al lado.
   */
  const markInstant = (instant: string | null | undefined, module: string) => {
    if (!instant) return;
    const dt = DateTime.fromISO(instant, { zone: "utc" }).setZone(timezone);
    if (dt.isValid) mark(dt.toISODate(), module);
  };

  const [sleep, habits, tasks, meals, reading, content, tradesAbiertas, tradesCerradas] =
    await Promise.all([
    supabase
      .from("sleep_entries")
      .select("sleep_date")
      .eq("user_id", user.id)
      .gte("sleep_date", fromDate)
      .lte("sleep_date", toDate),

    supabase
      .from("habits_entries")
      .select("entry_date")
      .eq("user_id", user.id)
      .eq("done", true)
      .gte("entry_date", fromDate)
      .lte("entry_date", toDate),

    supabase
      .from("tasks_items")
      .select("due_date, due_end, completed_at")
      .eq("user_id", user.id),

    supabase
      .from("meals_entries")
      .select("meal_date")
      .eq("user_id", user.id)
      .gte("meal_date", fromDate)
      .lte("meal_date", toDate),

    supabase
      .from("reading_sessions")
      .select("session_date")
      .eq("user_id", user.id)
      .gte("session_date", fromDate)
      .lte("session_date", toDate),

    supabase.from("content_pieces").select("planned_date, published_at").eq("user_id", user.id),

    // Abiertas y cerradas por separado: el punto de trading tiene que salir
    // también el día en que se cerró algo, que es el día que dejó dinero.
    supabase
      .from("trades")
      .select("opened_at")
      .eq("user_id", user.id)
      .is("orphaned_at", null)
      .gte("opened_at", rango.from)
      .lte("opened_at", rango.to),

    supabase
      .from("trades")
      .select("closed_at")
      .eq("user_id", user.id)
      .is("orphaned_at", null)
      .gte("closed_at", rango.from)
      .lte("closed_at", rango.to),
  ]);

  for (const row of sleep.data ?? []) mark(row.sleep_date, "sleep");
  for (const row of habits.data ?? []) mark(row.entry_date, "habits");
  for (const row of meals.data ?? []) mark(row.meal_date, "meals");
  for (const row of reading.data ?? []) mark(row.session_date, "reading");
  for (const row of tradesAbiertas.data ?? []) markInstant(row.opened_at, "trading");
  for (const row of tradesCerradas.data ?? []) markInstant(row.closed_at, "trading");

  for (const row of content.data ?? []) {
    mark(row.planned_date, "content");
    mark(row.published_at, "content");
  }

  // Una tarea con rango marca todos sus días, igual que en el calendario de
  // tareas: aplanarla a su último día escondería el trabajo de los otros dos.
  for (const row of tasks.data ?? []) {
    mark(row.completed_at, "tasks");
    for (const day of taskDays(row, toDate)) mark(day, "tasks");
  }

  return markers;
}
