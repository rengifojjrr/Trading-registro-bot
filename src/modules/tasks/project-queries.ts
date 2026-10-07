import "server-only";

import { colorForName } from "@/core/notion-colors";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type {
  AuthorKind,
  CloudLevel,
  DuePrecision,
  FieldSrc,
  LogKind,
  MemberSide,
  MilestoneKind,
  MilestoneStatus,
  PersonCircle,
  ProjectColor,
  ProjectHealth,
  ProjectSourceKind,
  ProjectStatus,
  SourceKind,
  TaskOrigin,
} from "@/types/database";

import {
  computeHealth,
  dateIn,
  nextUp,
  progressOf,
  waitingOnOthers,
  type Health,
  type NextItem,
  type Progress,
  type ProjectLogFacts,
  type ProjectMilestoneFacts,
  type ProjectTaskFacts,
  type Waiting,
} from "./domain/projects";
import type { TaskPriority, TaskStatus } from "./domain/tasks";

/**
 * Lo que leen las pantallas de proyectos y personas.
 *
 * Todo pasa por la sesión del dueño (RLS): no hay rol de servicio aquí. Las
 * cuentas -- semáforo, avance, lo próximo -- se hacen en el servidor con las
 * funciones puras de `domain/projects.ts`, una vez, y la pantalla sólo pinta.
 */

// --------------------------------------------------------------------- filas

export interface ProjectV2 {
  id: string;
  name: string;
  slug: string | null;
  aliases: string[];
  color: ProjectColor;
  icon: string | null;
  is_active: boolean;
  status: ProjectStatus;
  health: ProjectHealth | null;
  health_until: string | null;
  objective: string | null;
  how_md: string | null;
  how_at: string | null;
  how_by: AuthorKind | null;
  cloud_level: CloudLevel;
  started_on: string | null;
  target_on: string | null;
  closed_on: string | null;
  field_src: FieldSrc;
  created_at: string;
  updated_at: string;
}

export interface PersonRow {
  id: string;
  name: string;
  aliases: string[];
  is_owner: boolean;
  relation: string | null;
  org: string | null;
  circle: PersonCircle | null;
  note: string | null;
  has_whatsapp: boolean;
  whatsapp_hint: "SI" | "NO" | null;
  phone_tail: string | null;
  color: ProjectColor | null;
  archived_at: string | null;
  field_src: FieldSrc;
  created_at: string;
}

export interface MemberRow {
  id: string;
  project_id: string;
  person_id: string;
  role: string | null;
  does_md: string | null;
  side: MemberSide | null;
  is_lead: boolean;
  active: boolean;
  sort_order: number;
  field_src: FieldSrc;
}

export interface StreamRow {
  id: string;
  project_id: string;
  name: string;
  lead_person_id: string | null;
  sort_order: number;
  active: boolean;
  field_src: FieldSrc;
}

export interface MilestoneRow {
  id: string;
  project_id: string;
  kind: MilestoneKind;
  stage_id: string | null;
  title: string;
  detail: string | null;
  starts_on: string | null;
  due_on: string | null;
  due_precision: DuePrecision;
  status: MilestoneStatus;
  blocked_why: string | null;
  done_at: string | null;
  owner_person_id: string | null;
  sort_order: number;
  field_src: FieldSrc;
  updated_at: string;
}

export interface ProjectTaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  due_time: string | null;
  project_id: string | null;
  assignee_id: string | null;
  stream_id: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  origin: TaskOrigin | null;
  source_kind: SourceKind | null;
  source_label: string | null;
  notes: string | null;
  notion_page_id: string | null;
  field_src: FieldSrc;
  created_at: string;
  completed_at: string | null;
}

export interface LogRow {
  id: string;
  project_id: string;
  at: string;
  kind: LogKind;
  title: string;
  body: string | null;
  origin: TaskOrigin;
  auto: boolean;
  created_at: string;
}

export interface SourceRow {
  id: string;
  project_id: string;
  kind: ProjectSourceKind;
  label: string;
  ref: string | null;
  lives: "NUBE" | "MAC";
  created_at: string;
}

export interface DocRow {
  id: string;
  project_id: string;
  kind: string;
  title: string;
  body_md: string;
  made_by: AuthorKind;
  version: number;
  updated_at: string;
}

export interface DocVersionRow {
  version: number;
  made_by: AuthorKind;
  created_at: string;
}

const PROJECT_COLUMNS =
  "id, name, slug, aliases, color, icon, is_active, status, health, health_until, objective, how_md, how_at, how_by, cloud_level, started_on, target_on, closed_on, field_src, created_at, updated_at";
const PERSON_COLUMNS =
  "id, name, aliases, is_owner, relation, org, circle, note, has_whatsapp, whatsapp_hint, phone_tail, color, archived_at, field_src, created_at";
const MEMBER_COLUMNS = "id, project_id, person_id, role, does_md, side, is_lead, active, sort_order, field_src";
const STREAM_COLUMNS = "id, project_id, name, lead_person_id, sort_order, active, field_src";
const MILESTONE_COLUMNS =
  "id, project_id, kind, stage_id, title, detail, starts_on, due_on, due_precision, status, blocked_why, done_at, owner_person_id, sort_order, field_src, updated_at";
const TASK_COLUMNS =
  "id, title, status, priority, due_date, due_time, project_id, assignee_id, stream_id, milestone_id, parent_id, origin, source_kind, source_label, notes, notion_page_id, field_src, created_at, completed_at";
const LOG_COLUMNS = "id, project_id, at, kind, title, body, origin, auto, created_at";
const SOURCE_COLUMNS = "id, project_id, kind, label, ref, lives, created_at";

function withColor<T extends { name: string; color: ProjectColor | null }>(p: T): T & { color: ProjectColor } {
  return { ...p, color: p.color ?? colorForName(p.name) };
}

// --------------------------------------------------------- de filas a hechos

export function taskFacts(t: ProjectTaskRow, timezone: string): ProjectTaskFacts {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.due_date,
    assigneeId: t.assignee_id,
    milestoneId: t.milestone_id,
    parentId: t.parent_id,
    createdOn: dateIn(t.created_at, timezone),
    completedOn: t.completed_at ? dateIn(t.completed_at, timezone) : null,
  };
}

export function milestoneFacts(m: MilestoneRow, timezone: string): ProjectMilestoneFacts {
  return {
    id: m.id,
    kind: m.kind,
    title: m.title,
    dueOn: m.due_on,
    status: m.status,
    updatedOn: dateIn(m.updated_at, timezone),
  };
}

export function logFacts(l: LogRow, timezone: string): ProjectLogFacts {
  return { on: dateIn(l.at, timezone), auto: l.auto };
}

export interface ProjectComputed {
  health: Health;
  progress: Progress;
  next: NextItem[];
  waiting: Waiting[];
  mine: number;
  others: number;
  unassigned: number;
  open: number;
  overdue: number;
}

export function computeProject(
  project: ProjectV2,
  tasks: ProjectTaskRow[],
  milestones: MilestoneRow[],
  log: LogRow[],
  ownerId: string | null,
  names: Record<string, string>,
  timezone: string,
  today: string,
  nextLimit = 3,
): ProjectComputed {
  const tf = tasks.map((t) => taskFacts(t, timezone));
  const mf = milestones.map((m) => milestoneFacts(m, timezone));
  const health = computeHealth({
    status: project.status,
    health: project.health,
    healthUntil: project.health_until,
    tasks: tf,
    milestones: mf,
    log: log.map((l) => logFacts(l, timezone)),
    ownerId,
    names,
    today,
    now: new Date().toISOString(),
    createdOn: dateIn(project.created_at, timezone),
  });
  const abiertas = tf.filter((t) => t.status !== "HECHA" && t.parentId === null);
  return {
    health,
    progress: progressOf(mf, tf),
    next: nextUp(tf, mf, nextLimit),
    waiting: waitingOnOthers(tf, ownerId, today),
    mine: abiertas.filter((t) => t.assigneeId !== null && t.assigneeId === ownerId).length,
    others: abiertas.filter((t) => t.assigneeId !== null && t.assigneeId !== ownerId).length,
    unassigned: abiertas.filter((t) => t.assigneeId === null).length,
    open: abiertas.length,
    overdue: abiertas.filter((t) => t.dueDate !== null && t.dueDate < today).length,
  };
}

// ------------------------------------------------------------------ la lista

export interface ProjectCard {
  project: ProjectV2;
  computed: ProjectComputed;
  people: Pick<PersonRow, "id" | "name" | "is_owner" | "color" | "has_whatsapp" | "whatsapp_hint">[];
  lastLog: Pick<LogRow, "at" | "kind" | "title"> | null;
  /** «Sig.»: lo próximo, con el nombre de quién si no eres tú. */
  nextWho: string | null;
}

export interface ProjectsOverview {
  cards: ProjectCard[];
  timezone: string;
  today: string;
  ownerId: string | null;
}

/**
 * Todos los proyectos, con lo que su tarjeta enseña.
 *
 * Cinco consultas en paralelo para todos a la vez, no cinco por proyecto: con
 * diez proyectos serían cincuenta viajes para pintar una lista.
 */
export async function fetchProjectsOverview(): Promise<ProjectsOverview> {
  const user = await requireUser();
  const supabase = await createClient();
  const timezone = await userTimezone();
  const today = todayIn(timezone);

  const [projects, tasks, milestones, members, people, log] = await Promise.all([
    supabase.from("tasks_projects").select(PROJECT_COLUMNS).eq("user_id", user.id).order("sort_order"),
    supabase
      .from("tasks_items")
      .select(TASK_COLUMNS)
      .eq("user_id", user.id)
      .not("project_id", "is", null),
    supabase.from("tasks_milestones").select(MILESTONE_COLUMNS).eq("user_id", user.id),
    supabase.from("tasks_project_members").select(MEMBER_COLUMNS).eq("user_id", user.id).eq("active", true),
    supabase.from("core_people").select(PERSON_COLUMNS).eq("user_id", user.id),
    supabase
      .from("tasks_project_log")
      .select(LOG_COLUMNS)
      .eq("user_id", user.id)
      .order("at", { ascending: false })
      .limit(500),
  ]);

  const personas = (people.data ?? []) as PersonRow[];
  const ownerId = personas.find((p) => p.is_owner)?.id ?? null;
  const nombres = Object.fromEntries(personas.map((p) => [p.id, p.is_owner ? "Tú" : p.name]));
  const porId = new Map(personas.map((p) => [p.id, p]));

  const cards = ((projects.data ?? []) as ProjectV2[]).map((raw) => {
    const project = withColor(raw);
    const suyas = ((tasks.data ?? []) as ProjectTaskRow[]).filter((t) => t.project_id === project.id);
    const hitos = ((milestones.data ?? []) as MilestoneRow[]).filter((m) => m.project_id === project.id);
    const entradas = ((log.data ?? []) as LogRow[]).filter((l) => l.project_id === project.id);
    const computed = computeProject(project, suyas, hitos, entradas, ownerId, nombres, timezone, today, 1);
    const gente = ((members.data ?? []) as MemberRow[])
      .filter((m) => m.project_id === project.id)
      .sort((a, b) => Number(b.is_lead) - Number(a.is_lead) || a.sort_order - b.sort_order)
      .map((m) => porId.get(m.person_id))
      .filter((p): p is PersonRow => p !== undefined);
    const siguiente = computed.next[0];
    return {
      project,
      computed,
      people: gente,
      lastLog: entradas.find((l) => !l.auto) ?? entradas[0] ?? null,
      nextWho:
        siguiente && siguiente.assigneeId && siguiente.assigneeId !== ownerId
          ? (nombres[siguiente.assigneeId] ?? null)
          : null,
    };
  });

  return { cards, timezone, today, ownerId };
}

// ---------------------------------------------------------- un proyecto entero

export interface MemberView extends MemberRow {
  person: PersonRow;
  /** Tareas suyas abiertas en este proyecto. */
  openTasks: number;
  /** Días que lleva lo más viejo que se le espera, si se le espera algo. */
  waitingDays: number | null;
}

export interface ProjectFull {
  project: ProjectV2;
  computed: ProjectComputed;
  members: MemberView[];
  /** Todas tus personas, para elegir a quién añadir o asignar. */
  allPeople: PersonRow[];
  ownerId: string | null;
  streams: StreamRow[];
  milestones: MilestoneRow[];
  tasks: ProjectTaskRow[];
  log: LogRow[];
  sources: SourceRow[];
  ficha: DocRow | null;
  fichaVersions: DocVersionRow[];
  timezone: string;
  today: string;
}

export async function fetchProjectFull(id: string): Promise<ProjectFull | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: raw } = await supabase
    .from("tasks_projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!raw) return null;

  const timezone = await userTimezone();
  const today = todayIn(timezone);

  const [members, people, streams, milestones, tasks, log, sources, docs] = await Promise.all([
    supabase.from("tasks_project_members").select(MEMBER_COLUMNS).eq("user_id", user.id).eq("project_id", id).order("sort_order"),
    supabase.from("core_people").select(PERSON_COLUMNS).eq("user_id", user.id).order("name"),
    supabase.from("tasks_streams").select(STREAM_COLUMNS).eq("user_id", user.id).eq("project_id", id).order("sort_order"),
    supabase.from("tasks_milestones").select(MILESTONE_COLUMNS).eq("user_id", user.id).eq("project_id", id).order("sort_order"),
    supabase.from("tasks_items").select(TASK_COLUMNS).eq("user_id", user.id).eq("project_id", id).order("created_at"),
    supabase.from("tasks_project_log").select(LOG_COLUMNS).eq("user_id", user.id).eq("project_id", id).order("at", { ascending: false }).limit(300),
    supabase.from("tasks_project_sources").select(SOURCE_COLUMNS).eq("user_id", user.id).eq("project_id", id).order("created_at", { ascending: false }),
    supabase
      .from("tasks_project_docs")
      .select("id, project_id, kind, title, body_md, made_by, version, updated_at")
      .eq("user_id", user.id)
      .eq("project_id", id)
      .eq("kind", "FICHA")
      .maybeSingle(),
  ]);

  const project = withColor(raw as ProjectV2);
  const allPeople = (people.data ?? []) as PersonRow[];
  const ownerId = allPeople.find((p) => p.is_owner)?.id ?? null;
  const nombres = Object.fromEntries(allPeople.map((p) => [p.id, p.is_owner ? "Tú" : p.name]));
  const porId = new Map(allPeople.map((p) => [p.id, p]));
  const taskRows = (tasks.data ?? []) as ProjectTaskRow[];
  const milestoneRows = (milestones.data ?? []) as MilestoneRow[];
  const logRows = (log.data ?? []) as LogRow[];
  const computed = computeProject(project, taskRows, milestoneRows, logRows, ownerId, nombres, timezone, today);
  const espera = new Map(computed.waiting.map((w) => [w.personId, w.days]));

  const ficha = (docs.data ?? null) as DocRow | null;
  let fichaVersions: DocVersionRow[] = [];
  if (ficha) {
    const { data } = await supabase
      .from("tasks_project_doc_versions")
      .select("version, made_by, created_at")
      .eq("user_id", user.id)
      .eq("doc_id", ficha.id)
      .order("version", { ascending: false })
      .limit(20);
    fichaVersions = (data ?? []) as DocVersionRow[];
  }

  const memberRows = (members.data ?? []) as MemberRow[];
  return {
    project,
    computed,
    members: memberRows
      .map((m) => {
        const person = porId.get(m.person_id);
        if (!person) return null;
        return {
          ...m,
          person,
          openTasks: taskRows.filter((t) => t.assignee_id === m.person_id && t.status !== "HECHA").length,
          waitingDays: espera.get(m.person_id) ?? null,
        };
      })
      .filter((m): m is MemberView => m !== null)
      .sort((a, b) => Number(b.person.is_owner) - Number(a.person.is_owner) || Number(b.is_lead) - Number(a.is_lead) || a.sort_order - b.sort_order),
    allPeople,
    ownerId,
    streams: (streams.data ?? []) as StreamRow[],
    milestones: milestoneRows,
    tasks: taskRows,
    log: logRows,
    sources: (sources.data ?? []) as SourceRow[],
    ficha,
    fichaVersions,
    timezone,
    today,
  };
}

// ------------------------------------------------------------------ personas

export interface PersonListItem extends PersonRow {
  projects: { id: string; name: string; color: ProjectColor; role: string | null }[];
  openTasks: number;
  /** Las abiertas en cada proyecto: agrupado por proyecto, «le toca» es de ése. */
  openByProject: Record<string, number>;
  /** Lo que se le espera: tareas suyas abiertas y la más vieja, en días. */
  waitingDays: number | null;
}

export async function fetchPeopleList(): Promise<{ people: PersonListItem[]; today: string }> {
  const user = await requireUser();
  const supabase = await createClient();
  const timezone = await userTimezone();
  const today = todayIn(timezone);

  const [people, members, projects, tasks] = await Promise.all([
    supabase.from("core_people").select(PERSON_COLUMNS).eq("user_id", user.id).order("name"),
    supabase.from("tasks_project_members").select(MEMBER_COLUMNS).eq("user_id", user.id),
    supabase.from("tasks_projects").select("id, name, color, is_active").eq("user_id", user.id),
    supabase
      .from("tasks_items")
      .select("id, title, status, priority, due_date, project_id, assignee_id, milestone_id, parent_id, created_at, completed_at")
      .eq("user_id", user.id)
      .not("assignee_id", "is", null)
      .neq("status", "HECHA"),
  ]);

  const proyectos = new Map((projects.data ?? []).map((p) => [p.id, withColor(p as { id: string; name: string; color: ProjectColor | null; is_active: boolean })]));
  const personas = (people.data ?? []) as PersonRow[];
  const ownerId = personas.find((p) => p.is_owner)?.id ?? null;
  const facts = ((tasks.data ?? []) as ProjectTaskRow[]).map((t) => taskFacts(t, timezone));
  const espera = new Map(waitingOnOthers(facts, ownerId, today).map((w) => [w.personId, w.days]));

  return {
    today,
    people: personas.map((p) => ({
      ...p,
      projects: ((members.data ?? []) as MemberRow[])
        .filter((m) => m.person_id === p.id)
        .map((m) => {
          const proyecto = proyectos.get(m.project_id);
          return proyecto ? { id: proyecto.id, name: proyecto.name, color: proyecto.color, role: m.role } : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null),
      openTasks: facts.filter((t) => t.assigneeId === p.id).length,
      openByProject: ((tasks.data ?? []) as ProjectTaskRow[])
        .filter((t) => t.assignee_id === p.id && t.project_id !== null)
        .reduce<Record<string, number>>((acc, t) => {
          acc[t.project_id as string] = (acc[t.project_id as string] ?? 0) + 1;
          return acc;
        }, {}),
      waitingDays: espera.get(p.id) ?? null,
    })),
  };
}

export interface PersonFull {
  person: PersonRow;
  memberships: (MemberRow & { project: Pick<ProjectV2, "id" | "name" | "color" | "icon" | "status"> })[];
  /** Sus tareas (abiertas y hechas), con el proyecto. */
  tasks: (ProjectTaskRow & { projectName: string | null; projectColor: ProjectColor | null })[];
  ownerId: string | null;
  timezone: string;
  today: string;
}

export async function fetchPersonFull(id: string): Promise<PersonFull | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: person } = await supabase
    .from("core_people")
    .select(PERSON_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!person) return null;

  const timezone = await userTimezone();
  const [members, projects, tasks, owner] = await Promise.all([
    supabase.from("tasks_project_members").select(MEMBER_COLUMNS).eq("user_id", user.id).eq("person_id", id),
    supabase.from("tasks_projects").select("id, name, color, icon, status").eq("user_id", user.id),
    supabase.from("tasks_items").select(TASK_COLUMNS).eq("user_id", user.id).eq("assignee_id", id).order("created_at"),
    supabase.from("core_people").select("id").eq("user_id", user.id).eq("is_owner", true).maybeSingle(),
  ]);

  const proyectos = new Map(
    (projects.data ?? []).map((p) => [p.id, withColor(p as Pick<ProjectV2, "id" | "name" | "icon" | "status"> & { color: ProjectColor | null })]),
  );

  return {
    person: person as PersonRow,
    memberships: ((members.data ?? []) as MemberRow[])
      .map((m) => {
        const project = proyectos.get(m.project_id);
        return project ? { ...m, project } : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null),
    tasks: ((tasks.data ?? []) as ProjectTaskRow[]).map((t) => {
      const project = t.project_id ? proyectos.get(t.project_id) : undefined;
      return { ...t, projectName: project?.name ?? null, projectColor: project?.color ?? null };
    }),
    ownerId: owner.data?.id ?? null,
    timezone,
    today: todayIn(timezone),
  };
}

/** Un hito, con su proyecto y sus tareas. */
export async function fetchMilestone(id: string): Promise<{
  milestone: MilestoneRow;
  project: Pick<ProjectV2, "id" | "name" | "color" | "icon">;
  stage: Pick<MilestoneRow, "id" | "title"> | null;
  tasks: ProjectTaskRow[];
  people: PersonRow[];
  timezone: string;
  today: string;
} | null> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: milestone } = await supabase
    .from("tasks_milestones")
    .select(MILESTONE_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!milestone) return null;
  const m = milestone as MilestoneRow;
  const timezone = await userTimezone();
  const [project, stage, tasks, people] = await Promise.all([
    supabase.from("tasks_projects").select("id, name, color, icon").eq("id", m.project_id).eq("user_id", user.id).maybeSingle(),
    m.stage_id
      ? supabase.from("tasks_milestones").select("id, title").eq("id", m.stage_id).eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("tasks_items").select(TASK_COLUMNS).eq("user_id", user.id).eq("milestone_id", id).order("created_at"),
    supabase.from("core_people").select(PERSON_COLUMNS).eq("user_id", user.id),
  ]);
  if (!project.data) return null;
  return {
    milestone: m,
    project: withColor(project.data as Pick<ProjectV2, "id" | "name" | "icon"> & { color: ProjectColor | null }),
    stage: (stage.data ?? null) as Pick<MilestoneRow, "id" | "title"> | null,
    tasks: (tasks.data ?? []) as ProjectTaskRow[],
    people: (people.data ?? []) as PersonRow[],
    timezone,
    today: todayIn(timezone),
  };
}

// ------------------------------------------------------------ orden rápida

/**
 * Lo que necesita la orden rápida para entender «en petróleo, Andrés tiene
 * que…»: los proyectos con sus otros nombres, las personas y quién está en
 * cada proyecto. Sólo nombres e ids: el lector corre en el navegador.
 */
export async function fetchOrderContext(): Promise<{
  projects: { id: string; name: string; slug: string | null; aliases: string[] }[];
  people: { id: string; name: string; aliases: string[]; is_owner: boolean }[];
  members: { projectId: string; personId: string }[];
}> {
  const user = await requireUser();
  const supabase = await createClient();
  const [projects, people, members] = await Promise.all([
    supabase
      .from("tasks_projects")
      .select("id, name, slug, aliases, is_active, status")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("core_people").select("id, name, aliases, is_owner, archived_at").eq("user_id", user.id).is("archived_at", null),
    supabase.from("tasks_project_members").select("project_id, person_id").eq("user_id", user.id).eq("active", true),
  ]);
  return {
    projects: (projects.data ?? [])
      .filter((p) => p.status !== "TERMINADO" && p.status !== "DESCARTADO")
      .map((p) => ({ id: p.id, name: p.name, slug: p.slug ?? null, aliases: p.aliases ?? [] })),
    people: (people.data ?? []).map((p) => ({ id: p.id, name: p.name, aliases: p.aliases ?? [], is_owner: p.is_owner })),
    members: (members.data ?? []).map((m) => ({ projectId: m.project_id, personId: m.person_id })),
  };
}

// ------------------------------------------------------------- calendario

/** Los hitos con fecha entre dos días, con el color de su proyecto (para el calendario). */
export async function fetchMilestonesBetween(
  fromDate: string,
  toDate: string,
): Promise<{ id: string; title: string; due_on: string; status: MilestoneStatus; projectName: string; projectColor: ProjectColor }[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: hitos }, { data: proyectos }] = await Promise.all([
    supabase
      .from("tasks_milestones")
      .select("id, title, due_on, status, project_id, kind")
      .eq("user_id", user.id)
      .eq("kind", "HITO")
      .gte("due_on", fromDate)
      .lte("due_on", toDate),
    supabase.from("tasks_projects").select("id, name, color").eq("user_id", user.id),
  ]);
  const porId = new Map((proyectos ?? []).map((p) => [p.id, p]));
  return (hitos ?? [])
    .filter((h): h is typeof h & { due_on: string } => h.due_on !== null)
    .map((h) => {
      const p = porId.get(h.project_id);
      return {
        id: h.id,
        title: h.title,
        due_on: h.due_on,
        status: h.status,
        projectName: p?.name ?? "",
        projectColor: p?.color ?? colorForName(p?.name ?? ""),
      };
    });
}
