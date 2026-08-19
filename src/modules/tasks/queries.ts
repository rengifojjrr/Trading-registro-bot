import "server-only";

import { colorForName } from "@/core/notion-colors";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { TaskPriority, TaskStatus } from "@/modules/tasks/domain/tasks";
import type { ProjectColor } from "@/types/database";

export interface ProjectRow {
  id: string;
  name: string;
  is_active: boolean;
  color: ProjectColor | null;
  icon: string | null;
}

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  /** El último día, cuando la tarea dura más de uno. */
  due_end: string | null;
  /** `HH:MM:SS`, cuando la tarea tiene hora. */
  due_time: string | null;
  categories: string[];
  notes: string | null;
  /** El cuerpo de la página de Notion: lo que la tarea explica. */
  description: string | null;
  icon: string | null;
  project_id: string | null;
  projectName: string | null;
  projectColor: ProjectColor | null;
  created_at: string;
  /** Cuándo se marcó como hecha. Es lo que permite medir el ritmo de cierre. */
  completed_at: string | null;
}

const TASK_COLUMNS =
  "id, title, status, priority, due_date, due_end, due_time, categories, notes, description, icon, project_id, created_at, completed_at";

/**
 * Los proyectos.
 *
 * Por defecto sólo los activos, que es lo que va en un desplegable de «a qué
 * proyecto pertenece esta tarea». La pantalla de proyectos pide también los
 * archivados, porque ahí sí hay que poder reactivarlos.
 */
export async function fetchProjects(includeArchived = false): Promise<ProjectRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const query = supabase
    .from("tasks_projects")
    .select("id, name, is_active, color, icon")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  const { data } = await (includeArchived ? query : query.eq("is_active", true));

  // Un proyecto sin color elegido se queda con uno derivado de su nombre, en
  // lugar de gris. Los diez que llegaron de Notion nacieron sin color, y una
  // lista entera del mismo tono es exactamente lo que hacía que todas las
  // tarjetas se parecieran. Se deriva al leer y no se guarda: así hay una sola
  // implementación, y elegir uno a mano lo sigue pisando.
  return (data ?? []).map((project) => ({
    ...project,
    color: project.color ?? colorForName(project.name),
  }));
}

export async function fetchTasks(): Promise<TaskRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: tasks }, projects] = await Promise.all([
    supabase
      .from("tasks_items")
      .select(TASK_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    // Con los archivados: una tarea vieja puede colgar de un proyecto que ya
    // se archivó, y sin él la tarjeta perdería la etiqueta que la sitúa.
    fetchProjects(true),
  ]);

  const byId = new Map(projects.map((p) => [p.id, p]));
  return (tasks ?? []).map((t) => {
    const project = t.project_id ? byId.get(t.project_id) : undefined;
    return {
      ...t,
      projectName: project?.name ?? null,
      projectColor: project?.color ?? null,
    };
  });
}

/** Una tarea sola, para su ficha. */
export async function fetchTask(id: string): Promise<TaskRow | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("tasks_items")
    .select(TASK_COLUMNS)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return null;

  const projects = await fetchProjects(true);
  const project = data.project_id ? projects.find((p) => p.id === data.project_id) : undefined;

  return {
    ...data,
    projectName: project?.name ?? null,
    projectColor: project?.color ?? null,
  };
}

/** Un proyecto solo, con sus tareas, para su ficha. */
export async function fetchProject(
  id: string,
): Promise<{ project: ProjectRow; tasks: TaskRow[] } | null> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("tasks_projects")
    .select("id, name, is_active, color, icon")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!project) return null;

  const { data: tasks } = await supabase
    .from("tasks_items")
    .select(TASK_COLUMNS)
    .eq("user_id", user.id)
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const withColor: ProjectRow = { ...project, color: project.color ?? colorForName(project.name) };

  return {
    project: withColor,
    tasks: (tasks ?? []).map((t) => ({
      ...t,
      projectName: withColor.name,
      projectColor: withColor.color,
    })),
  };
}
