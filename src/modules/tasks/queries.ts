import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import type { TaskPriority, TaskStatus } from "@/modules/tasks/domain/tasks";

export interface ProjectRow {
  id: string;
  name: string;
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
}

export async function fetchProjects(): Promise<ProjectRow[]> {
  const user = await requireUser();
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks_projects")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export async function fetchTasks(): Promise<TaskRow[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: tasks }, projects] = await Promise.all([
    supabase
      .from("tasks_items")
      .select("id, title, status, priority, due_date, categories, notes, project_id")
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
