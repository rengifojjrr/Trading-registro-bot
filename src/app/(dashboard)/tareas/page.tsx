import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { countTasks } from "@/modules/tasks/domain/tasks";
import { fetchProjects, fetchTasks } from "@/modules/tasks/queries";
import { NewTask } from "@/modules/tasks/ui/new-task";
import { TaskList } from "@/modules/tasks/ui/task-list";

/** Tareas, agrupadas por urgencia real en lugar de por fecha. */
export default async function TasksPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const [tasks, projects] = await Promise.all([fetchTasks(), fetchProjects()]);

  const counts = countTasks(
    tasks.map((t) => ({ status: t.status, priority: t.priority, dueDate: t.due_date })),
    today,
  );

  return (
    <>
      <PageHeader title="Tareas" description="Lo vencido primero, que es lo que hay que decidir." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile size="lg" label="Pendientes" value={String(counts.open)} />
        <StatTile
          size="lg"
          label="Vencidas"
          value={String(counts.overdue)}
          tone={counts.overdue > 0 ? "negative" : "neutral"}
        />
        <StatTile size="lg" label="Para hoy" value={String(counts.dueToday)} />
        <StatTile size="lg" label="Hechas" value={String(counts.done)} sub="en total" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva tarea</CardTitle>
          <CardDescription>Con el título basta. Lo demás es opcional.</CardDescription>
        </CardHeader>
        <CardContent>
          <NewTask projects={projects} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <TaskList tasks={tasks} today={today} />
        </CardContent>
      </Card>
    </>
  );
}
