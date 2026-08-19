import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { TaskPriority, TaskStatus } from "@/modules/tasks/domain/tasks";

export interface ProjectRow {
  id: string;
  name: string;
  is_active: boolean;
}

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  categories: string[];
  notes: string | null;
  project_id: string | null;
  projectName: string | null;
  created_at: string;
  /** Cuándo se marcó como hecha. Es lo que permite medir el ritmo de cierre. */
  completed_at: string | null;
}

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
    .select("id, name, is_active")
    .eq("user_id", user.id)
    .order("sort_order", { ascending: true });

  const { data } = await (includeArchived ? query : query.eq("is_active", true));
  return data ?? [];
}

export async function fetchTasks(): Promise<TaskRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: tasks }, projects] = await Promise.all([
    supabase
      .from("tasks_items")
      .select("id, title, status, priority, due_date, categories, notes, project_id, created_at, completed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    fetchProjects(),
  ]);

  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  return (tasks ?? []).map((t) => ({
    ...t,
    projectName: t.project_id ? (nameById.get(t.project_id) ?? null) : null,
  }));
}
