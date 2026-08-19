/**
 * Tareas, en su forma pura.
 *
 * El módulo mejor montado de los que venían de Notion, así que aquí se
 * conserva lo que ya funcionaba -- estados, prioridades, proyectos y
 * categorías -- y sólo se añade lo que una base de datos puede hacer y una
 * tabla de Notion no: agrupar por urgencia real en lugar de por fecha.
 */

export const STATUSES = ["NO_INICIADA", "EN_CURSO", "HECHA"] as const;
export type TaskStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  NO_INICIADA: "Sin empezar",
  EN_CURSO: "En curso",
  HECHA: "Hecha",
};

export const PRIORITIES = ["ALTA", "MEDIA", "BAJA"] as const;
export type TaskPriority = (typeof PRIORITIES)[number];

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  ALTA: "Alta",
  MEDIA: "Media",
  BAJA: "Baja",
};

/** Las categorías tal cual están en la To-Do de Notion. */
export const CATEGORIES = [
  "Trabajo",
  "Estudio",
  "Familia",
  "Quehaceres domésticos",
  "Deporte",
  "Ocio",
  "Viaje",
  "Otro",
] as const;

export type Urgency = "VENCIDA" | "HOY" | "PRONTO" | "DESPUES" | "SIN_FECHA";

export const URGENCY_LABELS: Record<Urgency, string> = {
  VENCIDA: "Vencidas",
  HOY: "Para hoy",
  PRONTO: "Esta semana",
  DESPUES: "Más adelante",
  SIN_FECHA: "Sin fecha",
};

/**
 * En qué cubo cae una tarea.
 *
 * Comparación de cadenas ISO, no de objetos Date: las fechas de vencimiento
 * son días del calendario del usuario, y convertirlas a Date las ancla a una
 * zona horaria que no es necesariamente la suya, con lo que "hoy" se
 * convierte en "ayer" a partir de cierta hora.
 */
export function urgencyOf(dueDate: string | null, today: string): Urgency {
  if (!dueDate) return "SIN_FECHA";
  if (dueDate < today) return "VENCIDA";
  if (dueDate === today) return "HOY";

  // Siete días naturales, contando hoy.
  const soonLimit = addDaysIso(today, 7);
  return dueDate <= soonLimit ? "PRONTO" : "DESPUES";
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** El orden en que conviene mirarlas: primero lo vencido, luego lo de hoy. */
export const URGENCY_ORDER: Urgency[] = ["VENCIDA", "HOY", "PRONTO", "DESPUES", "SIN_FECHA"];

export interface TaskLike {
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
}

export interface TaskCounts {
  open: number;
  done: number;
  overdue: number;
  dueToday: number;
}

export function countTasks(tasks: TaskLike[], today: string): TaskCounts {
  const open = tasks.filter((t) => t.status !== "HECHA");
  return {
    open: open.length,
    done: tasks.filter((t) => t.status === "HECHA").length,
    overdue: open.filter((t) => urgencyOf(t.dueDate, today) === "VENCIDA").length,
    dueToday: open.filter((t) => urgencyOf(t.dueDate, today) === "HOY").length,
  };
}

/**
 * Cuántos días faltan, en negativo si ya pasó.
 *
 * Es la columna calculada «Días restantes» de tu base de Notion, que aparece
 * en cinco de tus siete vistas -- o sea, es la cifra que miras. La app
 * clasificaba por urgencia («vencida», «esta semana») pero nunca decía el
 * número, y «vencida» sin más no distingue entre ayer y hace tres meses.
 *
 * Aritmética sobre cadenas ISO en UTC, igual que `urgencyOf`: convertir a
 * `Date` en la zona del navegador desplaza el día y hace que «hoy» pase a ser
 * «ayer» a partir de cierta hora.
 */
export function daysLeft(dueDate: string | null, today: string): number | null {
  if (!dueDate) return null;

  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(due) || Number.isNaN(now)) return null;

  return Math.round((due - now) / 86_400_000);
}

/** «Faltan 3 días», «Vence hoy», «Hace 2 días». */
export function daysLeftLabel(dueDate: string | null, today: string): string | null {
  const days = daysLeft(dueDate, today);
  if (days === null) return null;

  if (days === 0) return "Vence hoy";
  if (days === 1) return "Falta 1 día";
  if (days === -1) return "Venció ayer";
  return days > 0 ? `Faltan ${days} días` : `Venció hace ${-days} días`;
}

/**
 * Las ventanas relativas de tus vistas de Notion.
 *
 * «Esta semana», «Este año» y «Próximas tareas» son filtros vivos allí: se
 * recalculan solos cada día. Aquí las únicas dos ventanas eran «Hoy» y
 * «Todas», y entre una y otra no había nada.
 */
export const RANGES = ["TODO", "HOY", "SEMANA", "MES", "ANO", "PROXIMAS"] as const;
export type TaskRange = (typeof RANGES)[number];

export const RANGE_LABELS: Record<TaskRange, string> = {
  TODO: "Todas",
  HOY: "Hoy",
  SEMANA: "Esta semana",
  MES: "Este mes",
  ANO: "Este año",
  PROXIMAS: "Próximas",
};

export function isTaskRange(value: string | undefined): value is TaskRange {
  return value !== undefined && (RANGES as readonly string[]).includes(value);
}

/**
 * Si una fecha cae dentro de la ventana.
 *
 * Una tarea sin fecha entra en «Todas» y en ninguna otra: meterla en «Esta
 * semana» sería afirmar algo que nadie ha dicho, y dejarla fuera de todo la
 * escondería para siempre.
 */
export function inRange(dueDate: string | null, today: string, range: TaskRange): boolean {
  if (range === "TODO") return true;
  if (!dueDate) return false;

  switch (range) {
    case "HOY":
      return dueDate === today;
    case "SEMANA": {
      const { start, end } = weekBounds(today);
      return dueDate >= start && dueDate <= end;
    }
    case "MES":
      return dueDate.slice(0, 7) === today.slice(0, 7);
    case "ANO":
      return dueDate.slice(0, 4) === today.slice(0, 4);
    case "PROXIMAS":
      return dueDate > today;
  }
}

/** De lunes a domingo, como tu calendario de Notion. */
export function weekBounds(today: string): { start: string; end: string } {
  const date = new Date(`${today}T00:00:00Z`);
  // `getUTCDay()` da 0 el domingo; se convierte a 6 para que la semana empiece
  // en lunes y el domingo cierre en lugar de abrir.
  const offset = (date.getUTCDay() + 6) % 7;
  return { start: addDaysIso(today, -offset), end: addDaysIso(today, 6 - offset) };
}

/** Por qué propiedad se agrupa la lista, como los tableros de Notion. */
export const GROUPINGS = ["URGENCIA", "PROYECTO", "PRIORIDAD", "CATEGORIA", "ESTADO"] as const;
export type TaskGrouping = (typeof GROUPINGS)[number];

export const GROUPING_LABELS: Record<TaskGrouping, string> = {
  URGENCIA: "Urgencia",
  PROYECTO: "Proyecto",
  PRIORIDAD: "Prioridad",
  CATEGORIA: "Categoría",
  ESTADO: "Estado",
};

export function isTaskGrouping(value: string | undefined): value is TaskGrouping {
  return value !== undefined && (GROUPINGS as readonly string[]).includes(value);
}

/**
 * Coincide con lo buscado.
 *
 * Mira título, notas, descripción y categorías: uno recuerda «lo del
 * inventario» sin recordar si lo escribió en el título o dentro.
 */
export function matchesSearch(
  task: { title: string; notes: string | null; description: string | null; categories: string[] },
  term: string,
): boolean {
  const needle = term.trim().toLowerCase();
  if (needle === "") return true;

  return [task.title, task.notes ?? "", task.description ?? "", ...task.categories]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

/**
 * Ordena dentro de un grupo: primero la prioridad, y a igual prioridad, lo
 * que vence antes. Sin fecha va al final -- no es urgente por definición.
 */
export function compareWithinGroup(a: TaskLike, b: TaskLike): number {
  const byPriority = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  if (byPriority !== 0) return byPriority;
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}
