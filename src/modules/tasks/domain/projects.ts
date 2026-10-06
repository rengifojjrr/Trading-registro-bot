import { z } from "zod";

import { DateTime } from "@/lib/fecha";
import type {
  LogKind,
  MilestoneKind,
  MilestoneStatus,
  ProjectHealth,
  ProjectStatus,
  SourceKind,
  TaskOrigin,
} from "@/types/database";

import type { TaskPriority, TaskStatus } from "./tasks";

/**
 * Proyectos, en su forma pura.
 *
 * Todo lo que se calcula de un proyecto sin guardarlo y sin IA: el semáforo y
 * su porqué, el avance, lo próximo, quién falta y desde cuándo no pasa nada.
 * Lo calcula el servidor al pintar y lo prueban los tests de al lado; ninguna
 * pantalla lo recalcula a su manera.
 */

/**
 * Lo que cabe en el nombre de un proyecto.
 *
 * Lo manda la base: `tasks_projects.name` tiene `char_length(trim(name))
 * between 1 and 60`. El formulario aceptaba 120, así que un nombre de 61 a 120
 * pasaba la validación, llegaba a la base y volvía como «No se pudo crear el
 * proyecto», sin decir por qué. La prueba de al lado lee la migración y falla
 * si los dos números dejan de coincidir.
 */
export const PROJECT_NAME_MAX = 60;

/** El nombre de un proyecto, recortado, con el mismo tope que la base. */
export const projectNameSchema = z
  .string()
  .trim()
  .min(1, "Ponle nombre al proyecto.")
  .max(PROJECT_NAME_MAX, `Máximo ${PROJECT_NAME_MAX} caracteres.`);

/** Los demás topes de la base (`20261006120000_proyectos_de_verdad.sql`). */
export const PROJECT_LIMITS = {
  objective: 300,
  how: 1500,
  slug: 60,
  memberRole: 80,
  memberDoes: 600,
  streamName: 60,
  milestoneTitle: 160,
  milestoneDetail: 1000,
  logTitle: 160,
  logBody: 1500,
  docBody: 60000,
  sourceLabel: 120,
  sourceRef: 200,
  taskTitle: 300,
  sourceLabelTask: 120,
} as const;

// ------------------------------------------------------------------ estados

export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "IDEA",
  "EN_MARCHA",
  "ESPERANDO",
  "ATASCADO",
  "EN_PAUSA",
  "TERMINADO",
  "DESCARTADO",
];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  IDEA: "Idea",
  EN_MARCHA: "En marcha",
  ESPERANDO: "Esperando a otros",
  ATASCADO: "Atascado",
  EN_PAUSA: "En pausa",
  TERMINADO: "Terminado",
  DESCARTADO: "Descartado",
};

/** Los que ya no piden nada: van plegados al final de la lista. */
export const CLOSED_STATUSES: readonly ProjectStatus[] = ["TERMINADO", "DESCARTADO"];

export function isClosedStatus(status: ProjectStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

export const HEALTH_LABELS: Record<ProjectHealth, string> = {
  VERDE: "Bien",
  AMARILLO: "Atención",
  ROJO: "Riesgo",
};

export const MILESTONE_STATUSES: readonly MilestoneStatus[] = [
  "PENDIENTE",
  "EN_CURSO",
  "HECHO",
  "BLOQUEADO",
  "SALTADO",
];

export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  HECHO: "Hecho",
  BLOQUEADO: "Bloqueado",
  SALTADO: "Saltado",
};

export const LOG_KINDS_BY_HAND: readonly LogKind[] = ["NOTA", "AVANCE", "DECISION", "BLOQUEO"];

export const LOG_KIND_LABELS: Record<LogKind, string> = {
  NOTA: "Nota",
  AVANCE: "Avance",
  DECISION: "Decisión",
  BLOQUEO: "Bloqueo",
  LLAMADA: "Llamada",
  REUNION: "Reunión",
  MENSAJE: "Mensaje",
  ESTADO: "Estado",
};

/** Cuánto vale un semáforo puesto a mano antes de que la app te pida revisarlo. */
export const MANUAL_HEALTH_DAYS = 14;

// -------------------------------------------------------------------- slug

/** «Finca El Roble» → «finca-el-roble». Lo que se escribe en una orden o un archivo. */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PROJECT_LIMITS.slug)
    .replace(/-+$/g, "");
}

/** Un slug que no choca con los que ya hay: «casa», «casa-2», «casa-3»… */
export function freeSlug(base: string, taken: Iterable<string>): string {
  const ocupados = new Set(taken);
  const limpio = slugify(base) || "proyecto";
  if (!ocupados.has(limpio)) return limpio;
  for (let n = 2; n < 1000; n += 1) {
    const sufijo = `-${n}`;
    const candidato = `${limpio.slice(0, PROJECT_LIMITS.slug - sufijo.length)}${sufijo}`;
    if (!ocupados.has(candidato)) return candidato;
  }
  return `${limpio.slice(0, 40)}-${Date.now().toString(36)}`;
}

// ------------------------------------------------------------- calendario

/** Días entre dos fechas de calendario (`YYYY-MM-DD`), b - a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** La fecha de calendario de un instante, en una zona. */
export function dateIn(instant: string, timezone: string): string {
  const dt = DateTime.fromISO(instant, { zone: "utc" }).setZone(timezone);
  return (dt.isValid ? dt : DateTime.fromISO(instant, { zone: "utc" })).toISODate() ?? instant.slice(0, 10);
}

/** «15 oct», o «15 oct 2027» si no es de este año. */
export function shortDate(date: string, today: string): string {
  const dt = DateTime.fromISO(date);
  if (!dt.isValid) return date;
  return dt.year === DateTime.fromISO(today).year ? dt.toFormat("d LLL") : dt.toFormat("d LLL yyyy");
}

/** «jue 9» para lo de esta semana y la que viene; «15 oct» para lo demás. */
export function dayLabel(date: string, today: string): string {
  const dias = daysBetween(today, date);
  if (dias === 0) return "hoy";
  if (dias === 1) return "mañana";
  if (dias === -1) return "ayer";
  if (dias > 1 && dias < 7) return DateTime.fromISO(date).toFormat("ccc d");
  return shortDate(date, today);
}

/**
 * Cuánto lleva esperando algo, dicho en palabras: «desde hoy», «1 día», «9
 * días». Nunca «0 d»: un cero con una abreviatura no se entiende de un vistazo.
 */
export function waitingLabel(days: number): string {
  if (days <= 0) return "esperando desde hoy";
  return `esperando ${days} ${days === 1 ? "día" : "días"}`;
}

const PESO_PRIORIDAD = { ALTA: 0, MEDIA: 1, BAJA: 2 } as const;

/**
 * El orden de las tareas dentro de un grupo de un proyecto: lo vencido
 * primero, luego por fecha (sin fecha al final) y, a igual fecha, por
 * prioridad.
 */
export function compareProjectTasks(
  a: { due_date: string | null; priority: "ALTA" | "MEDIA" | "BAJA" },
  b: { due_date: string | null; priority: "ALTA" | "MEDIA" | "BAJA" },
  today: string,
): number {
  const vencida = (t: { due_date: string | null }) => t.due_date !== null && t.due_date < today;
  if (vencida(a) !== vencida(b)) return vencida(a) ? -1 : 1;
  if (a.due_date !== b.due_date) {
    if (a.due_date === null) return 1;
    if (b.due_date === null) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  return PESO_PRIORIDAD[a.priority] - PESO_PRIORIDAD[b.priority];
}

// ----------------------------------------------------------- lo que entra

export interface ProjectTaskFacts {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
  milestoneId: string | null;
  parentId: string | null;
  /** La fecha de calendario en que se creó, en tu zona. */
  createdOn: string;
  /** La fecha de calendario en que se cerró, en tu zona. */
  completedOn: string | null;
}

export interface ProjectMilestoneFacts {
  id: string;
  kind: MilestoneKind;
  title: string;
  dueOn: string | null;
  status: MilestoneStatus;
  /** Desde cuándo está como está, en tu zona. */
  updatedOn: string;
}

export interface ProjectLogFacts {
  /** La fecha de calendario de lo que pasó, en tu zona. */
  on: string;
  auto: boolean;
}

export interface HealthInput {
  status: ProjectStatus;
  health: ProjectHealth | null;
  /** Hasta cuándo vale el semáforo puesto a mano (instante ISO). */
  healthUntil: string | null;
  tasks: ProjectTaskFacts[];
  milestones: ProjectMilestoneFacts[];
  log: ProjectLogFacts[];
  /** Tu fila de personas; tus tareas no cuentan como «esperando a otros». */
  ownerId: string | null;
  /** Nombre corto de cada persona, para decir de quién se espera algo. */
  names: Record<string, string>;
  today: string;
  /** Ahora, como instante ISO. */
  now: string;
  /** Cuándo se creó el proyecto, en tu zona: lo nuevo no está «sin novedades». */
  createdOn: string;
}

export interface Health {
  level: ProjectHealth | null;
  /** El porqué, en una línea. Nunca el color solo. */
  why: string;
  /** Lo pusiste tú y aún vale. */
  manual: boolean;
  /** Lo pusiste tú y ya pasó su plazo: la app sugiere revisarlo. */
  review: boolean;
}

/** Una tarea cuenta para el proyecto si está abierta y no es una subtarea. */
function open(task: ProjectTaskFacts): boolean {
  return task.status !== "HECHA";
}

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/**
 * El semáforo de un proyecto y su porqué.
 *
 * - Rojo: un hito con la fecha pasada sin hacer, tres o más tareas
 *   atrasadas, un hito bloqueado hace más de siete días, o el estado
 *   «Atascado».
 * - Amarillo: una o dos tareas atrasadas, algo de otra persona esperando más
 *   de siete días, nada nuevo en catorce, o un hito en siete días o menos con
 *   tareas abiertas.
 * - Verde: lo demás.
 *
 * Si lo pusiste tú, manda lo tuyo durante catorce días. Un proyecto en pausa,
 * terminado o descartado no tiene semáforo: no pide nada.
 */
export function computeHealth(input: HealthInput): Health {
  const { today } = input;

  if (input.status === "EN_PAUSA" || input.status === "TERMINADO" || input.status === "DESCARTADO") {
    return { level: null, why: PROJECT_STATUS_LABELS[input.status], manual: false, review: false };
  }

  if (input.health !== null) {
    const vigente = input.healthUntil !== null && Date.parse(input.healthUntil) > Date.parse(input.now);
    if (vigente) {
      return { level: input.health, why: "Lo pusiste tú", manual: true, review: false };
    }
  }
  const review = input.health !== null;

  const topLevel = input.tasks.filter((t) => t.parentId === null);
  const atrasadas = topLevel.filter((t) => open(t) && t.dueDate !== null && t.dueDate < today);
  const hitos = input.milestones.filter((m) => m.kind === "HITO");
  const hitosPasados = hitos.filter(
    (m) => m.dueOn !== null && m.dueOn < today && m.status !== "HECHO" && m.status !== "SALTADO",
  );
  const bloqueadosViejos = hitos.filter(
    (m) => m.status === "BLOQUEADO" && daysBetween(m.updatedOn, today) > 7,
  );

  const deQuien = (tareas: ProjectTaskFacts[]): string => {
    const ids = new Set(tareas.map((t) => t.assigneeId));
    if (ids.size !== 1) return "";
    const [id] = [...ids];
    if (id === null || id === input.ownerId) return "";
    const nombre = input.names[id];
    return nombre ? ` de ${nombre}` : "";
  };

  const rojo = (why: string): Health => ({ level: "ROJO", why, manual: false, review });
  const amarillo = (why: string): Health => ({ level: "AMARILLO", why, manual: false, review });

  if (input.status === "ATASCADO") return rojo("Está atascado");
  if (hitosPasados.length > 0) {
    const [primero] = [...hitosPasados].sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""));
    return rojo(`El hito «${primero.title}» pasó de fecha`);
  }
  if (atrasadas.length >= 3) return rojo(`${atrasadas.length} tareas atrasadas${deQuien(atrasadas)}`);
  if (bloqueadosViejos.length > 0) {
    const dias = daysBetween(bloqueadosViejos[0].updatedOn, today);
    return rojo(`«${bloqueadosViejos[0].title}» lleva ${dias} días bloqueado`);
  }

  if (atrasadas.length > 0) return amarillo(`${plural(atrasadas.length, "tarea atrasada", "tareas atrasadas")}${deQuien(atrasadas)}`);

  const esperando = waitingOnOthers(input.tasks, input.ownerId, today).find((w) => w.days > 7);
  if (esperando) {
    const nombre = input.names[esperando.personId] ?? "alguien";
    return amarillo(`${nombre} lleva ${esperando.days} días con «${esperando.oldestTitle}»`);
  }

  const cercano = hitos
    .filter((m) => m.dueOn !== null && m.status !== "HECHO" && m.status !== "SALTADO")
    .filter((m) => {
      const faltan = daysBetween(today, m.dueOn as string);
      return faltan >= 0 && faltan <= 7;
    })
    .find((m) => topLevel.some((t) => t.milestoneId === m.id && open(t)));
  if (cercano) {
    const faltan = daysBetween(today, cercano.dueOn as string);
    const abiertas = topLevel.filter((t) => t.milestoneId === cercano.id && open(t)).length;
    const cuando = faltan === 0 ? "hoy" : faltan === 1 ? "mañana" : `en ${faltan} días`;
    return amarillo(`«${cercano.title}» es ${cuando} y le quedan ${plural(abiertas, "tarea", "tareas")}`);
  }

  const ultima = lastNewsOn(input);
  const desde = ultima ?? input.createdOn;
  const quieto = daysBetween(desde, today);
  if (quieto > 14) return amarillo(`Nada nuevo en ${quieto} días`);

  // Sin tareas ni hitos no hay nada que vaya bien ni mal: un verde aquí decía
  // «Va bien» de un proyecto recién creado y vacío.
  if (input.tasks.length === 0 && hitos.length === 0) {
    return { level: null, why: "Aún sin plan", manual: false, review };
  }

  return { level: "VERDE", why: "Va bien", manual: false, review };
}

/**
 * La última novedad: la entrada de bitácora más reciente que escribiste o la
 * última tarea cerrada. Lo automático (un cambio de estado) no cuenta como
 * novedad: que la app apunte algo no es que el proyecto se mueva.
 */
export function lastNewsOn(input: Pick<HealthInput, "tasks" | "log">): string | null {
  const fechas = [
    ...input.log.filter((l) => !l.auto).map((l) => l.on),
    ...input.tasks.map((t) => t.completedOn).filter((d): d is string => d !== null),
  ];
  if (fechas.length === 0) return null;
  return fechas.sort()[fechas.length - 1];
}

// ------------------------------------------------------------------ avance

export interface Progress {
  done: number;
  total: number;
  /** Se cuenta por hitos; si no hay ninguno, por tareas. */
  unit: "hitos" | "tareas";
}

/** «3 de 7 hitos». Los saltados no cuentan; sin hitos, se cuenta por tareas. */
export function progressOf(
  milestones: Pick<ProjectMilestoneFacts, "kind" | "status">[],
  tasks: Pick<ProjectTaskFacts, "status" | "parentId">[],
): Progress {
  const hitos = milestones.filter((m) => m.kind === "HITO" && m.status !== "SALTADO");
  if (hitos.length > 0) {
    return { done: hitos.filter((m) => m.status === "HECHO").length, total: hitos.length, unit: "hitos" };
  }
  const tareas = tasks.filter((t) => t.parentId === null);
  return { done: tareas.filter((t) => t.status === "HECHA").length, total: tareas.length, unit: "tareas" };
}

export function progressLabel(progress: Progress): string {
  if (progress.total === 0) return progress.unit === "hitos" ? "Sin hitos" : "Sin tareas";
  return `${progress.done} de ${progress.total} ${progress.unit}`;
}

// -------------------------------------------------------------- lo próximo

export interface NextItem {
  kind: "TAREA" | "HITO";
  id: string;
  title: string;
  date: string;
  assigneeId: string | null;
}

const PRIORITY_RANK: Record<TaskPriority, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

/**
 * Las cosas más cercanas con fecha: tareas abiertas e hitos sin hacer.
 *
 * Por fecha y, en empate, por prioridad. Lo atrasado entra también -- va
 * primero, que es justo lo que hay que ver --; lo que no tiene fecha no entra,
 * porque «lo próximo» sin fecha no es lo próximo de nada.
 */
export function nextUp(
  tasks: ProjectTaskFacts[],
  milestones: ProjectMilestoneFacts[],
  limit = 3,
): NextItem[] {
  const items: (NextItem & { rank: number })[] = [
    ...tasks
      .filter((t) => open(t) && t.dueDate !== null && t.parentId === null)
      .map((t) => ({
        kind: "TAREA" as const,
        id: t.id,
        title: t.title,
        date: t.dueDate as string,
        assigneeId: t.assigneeId,
        rank: PRIORITY_RANK[t.priority],
      })),
    ...milestones
      .filter((m) => m.kind === "HITO" && m.dueOn !== null && m.status !== "HECHO" && m.status !== "SALTADO")
      .map((m) => ({
        kind: "HITO" as const,
        id: m.id,
        title: m.title,
        date: m.dueOn as string,
        assigneeId: null,
        rank: 1,
      })),
  ];
  return items
    .sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank || a.title.localeCompare(b.title, "es"))
    .slice(0, limit)
    .map(({ rank: _rank, ...item }) => item);
}

// ------------------------------------------------------ esperando a otros

export interface Waiting {
  personId: string;
  /** Tareas suyas abiertas en este proyecto. */
  count: number;
  /** Días desde que se apuntó la más vieja. */
  days: number;
  oldestTitle: string;
}

/**
 * Lo que esperas de otros: tareas abiertas cuyo responsable no eres tú.
 *
 * Por persona y ordenado por días de espera, la más larga primero. Las sin
 * asignar no cuentan: no se le puede esperar nada a nadie.
 */
export function waitingOnOthers(
  tasks: ProjectTaskFacts[],
  ownerId: string | null,
  today: string,
): Waiting[] {
  const porPersona = new Map<string, ProjectTaskFacts[]>();
  for (const task of tasks) {
    if (!open(task) || task.assigneeId === null || task.assigneeId === ownerId) continue;
    porPersona.set(task.assigneeId, [...(porPersona.get(task.assigneeId) ?? []), task]);
  }
  return [...porPersona]
    .map(([personId, suyas]) => {
      const vieja = [...suyas].sort((a, b) => a.createdOn.localeCompare(b.createdOn))[0];
      return {
        personId,
        count: suyas.length,
        days: Math.max(0, daysBetween(vieja.createdOn, today)),
        oldestTitle: vieja.title,
      };
    })
    .sort((a, b) => b.days - a.days || b.count - a.count);
}

// ----------------------------------------------------------------- origen

const SUSTANTIVOS_DE_ORIGEN: Record<string, string> = {
  llamada: "una llamada",
  reunion: "una reunión",
  reunión: "una reunión",
  videollamada: "una videollamada",
  mensaje: "un mensaje",
  mensajes: "unos mensajes",
  chat: "un chat",
  audio: "un audio",
  correo: "un correo",
  documento: "un documento",
  nota: "una nota",
};

/**
 * La etiqueta de origen tal como la escribió el archivo, dicha como la app:
 * «llamada 2026-09-28» → «una llamada del 28 sept»; una fecha ISO suelta pasa
 * a «28 sept». Lo que no encaja se deja como está.
 */
export function humanSourceLabel(label: string, today?: string): string {
  const fecha = (iso: string) => (today ? shortDate(iso, today) : shortDate(iso, iso));
  const m = label.trim().match(/^(\p{L}+)\s+(?:del?\s+)?(\d{4}-\d{2}-\d{2})$/u);
  if (m && SUSTANTIVOS_DE_ORIGEN[m[1].toLowerCase()]) {
    return `${SUSTANTIVOS_DE_ORIGEN[m[1].toLowerCase()]} del ${fecha(m[2])}`;
  }
  return label.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (iso) => fecha(iso));
}

export type OriginKey =
  | "LLAMADA"
  | "REUNION"
  | "MENSAJE"
  | "DICTADO"
  | "DOCUMENTO"
  | "A_MANO"
  | "CLAUDE"
  | "BOT"
  | "NOTION";

export const ORIGIN_LABELS: Record<OriginKey, string> = {
  LLAMADA: "una llamada",
  REUNION: "una reunión",
  MENSAJE: "un mensaje",
  DICTADO: "un dictado",
  DOCUMENTO: "un documento",
  A_MANO: "lo escribiste tú",
  CLAUDE: "Claude",
  BOT: "el bot",
  NOTION: "Notion",
};

/**
 * De dónde salió una tarea, para su icono y su frase.
 *
 * Manda la evidencia (`source_kind`) cuando la hay: una tarea que Claude
 * apuntó a partir de una llamada «salió de la llamada». Si no, el camino por
 * el que entró. Las de antes de que existiera el campo salen como Notion si
 * vinieron de allí, o como tuyas.
 */
export function originOf(
  task: {
    origin: TaskOrigin | null;
    source_kind: SourceKind | null;
    source_label: string | null;
    notion_page_id?: string | null;
  },
  today?: string,
): { key: OriginKey; text: string } {
  const kind = task.source_kind;
  const label = task.source_label ? humanSourceLabel(task.source_label, today) : null;
  if (kind && kind !== "CLAUDE") {
    const key = kind as OriginKey;
    return { key, text: label ? `Salió de ${label}` : `Salió de ${ORIGIN_LABELS[key]}` };
  }
  switch (task.origin) {
    case "CLAUDE":
    case "IMPORTAR":
      return { key: "CLAUDE", text: label ? `La apuntó Claude: ${label}` : "La apuntó Claude" };
    case "WHATSAPP":
    case "ANALISIS":
      return { key: "BOT", text: "La propuso el bot y la aceptaste" };
    case "VOZ":
      return { key: "DICTADO", text: "La dictaste" };
    case "REUNION":
      return { key: "REUNION", text: "Salió de una reunión" };
    case "LLAMADA":
      return { key: "LLAMADA", text: "Salió de una llamada" };
    case "NOTION":
      return { key: "NOTION", text: "Vino de Notion" };
    case "A_MANO":
      // Las que trajo la importación de Notion antes de marcar su origen nacían
      // con el valor por defecto: su enlace a Notion dice la verdad.
      return task.notion_page_id
        ? { key: "NOTION", text: "Vino de Notion" }
        : { key: "A_MANO", text: "La escribiste tú" };
    default:
      return task.notion_page_id
        ? { key: "NOTION", text: "Vino de Notion" }
        : { key: "A_MANO", text: "La escribiste tú" };
  }
}
