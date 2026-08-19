import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartFrame } from "@/core/ui/chart-frame";
import { RankSeries } from "@/core/ui/charts";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { openByProject, type AnalysableTask } from "@/modules/tasks/domain/tasks-analysis";
import { fetchProjects, fetchTasks } from "@/modules/tasks/queries";
import { ProjectManager } from "@/modules/tasks/ui/project-manager";
import { TaskList } from "@/modules/tasks/ui/task-list";

/**
 * Tareas: proyectos.
 *
 * Un proyecto es sólo un nombre bajo el que agrupar tareas -- fechas, avance
 * y carga se deducen de las tareas que cuelgan de él, así que no hay nada más
 * que rellenar. La gráfica de carga es la que dice si hay uno que se está
 * comiendo la lista entera.
 */
export default async function ProjectsPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const [tasks, projects] = await Promise.all([fetchTasks(), fetchProjects(true)]);

  const counts: Record<string, { open: number; done: number }> = {};
  for (const task of tasks) {
    if (!task.project_id) continue;
    const entry = counts[task.project_id] ?? { open: 0, done: 0 };
    if (task.status === "HECHA") entry.done += 1;
    else entry.open += 1;
    counts[task.project_id] = entry;
  }

  const analysable: AnalysableTask[] = tasks.map((t) => ({
    status: t.status,
    priority: t.priority,
    dueDate: t.due_date,
    createdAt: t.created_at,
    completedAt: t.completed_at,
    categories: t.categories,
    projectName: t.projectName,
  }));
  const load = openByProject(analysable);

  const unassigned = tasks.filter((t) => t.project_id === null && t.status !== "HECHA");

  return (
    <>
      <PageHeader title="Proyectos" description="Bajo qué se agrupan tus tareas y cuánto carga cada uno." />

      <ChartFrame
        title="Carga por proyecto"
        question="Tareas pendientes de cada uno."
        empty={load.length === 0}
        emptyLabel="Sin tareas pendientes que repartir."
      >
        <RankSeries
          data={load}
          colorToken="--mod-tasks"
          height={Math.max(160, load.length * 34 + 40)}
        />
      </ChartFrame>

      <Card>
        <CardHeader>
          <CardTitle>Tus proyectos</CardTitle>
          <CardDescription>
            Archivar no borra: las tareas que colgaban de él siguen ahí, con su historial intacto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectManager projects={projects} counts={counts} />
        </CardContent>
      </Card>

      {unassigned.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sin proyecto · {unassigned.length}</CardTitle>
            <CardDescription>
              No es un problema -- muchas tareas no pertenecen a nada -- pero si son demasiadas suele
              faltar un proyecto.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TaskList tasks={unassigned} today={today} showDone={false} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
