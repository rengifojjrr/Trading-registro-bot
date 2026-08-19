import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { fetchModuleViews } from "@/core/module-views";
import { todayIn } from "@/core/today";
import { SearchBox } from "@/core/ui/search-box";
import { ViewBar } from "@/core/ui/view-bar";
import { userTimezone } from "@/core/user-settings";
import {
  inRange,
  isTaskGrouping,
  isTaskRange,
  matchesSearch,
  type TaskGrouping,
  type TaskRange,
} from "@/modules/tasks/domain/tasks";
import { fetchTasks } from "@/modules/tasks/queries";
import { TaskFilters } from "@/modules/tasks/ui/task-filters";
import { TaskList } from "@/modules/tasks/ui/task-list";

/**
 * Tareas: todas.
 *
 * Antes esta pantalla era una sola vista fija y decía, en un comentario, que
 * cubría las siete de Notion «porque el grupo ya es el filtro». No era verdad:
 * «Esta semana» y «Este año» son filtros vivos que se recalculan solos, y
 * agrupar por urgencia no los sustituye.
 *
 * Ahora la ventana, la agrupación y la búsqueda viven en la URL, que es lo que
 * permite guardarlas como vista con nombre y volver a ellas de un clic.
 */
export default async function AllTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; agrupar?: string; q?: string }>;
}) {
  const { rango, agrupar, q } = await searchParams;

  const range: TaskRange = isTaskRange(rango) ? rango : "TODO";
  const grouping: TaskGrouping = isTaskGrouping(agrupar) ? agrupar : "URGENCIA";
  const term = q ?? "";

  const timezone = await userTimezone();
  const today = todayIn(timezone);

  const [tasks, views] = await Promise.all([fetchTasks(), fetchModuleViews("tasks")]);

  const visible = tasks.filter(
    (task) => inRange(task.due_date, today, range) && matchesSearch(task, term),
  );

  return (
    <>
      <PageHeader
        title="Todas las tareas"
        description="Filtra por ventana de tiempo, agrupa por lo que quieras y guárdalo como vista."
      />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TaskFilters range={range} grouping={grouping} />
          <SearchBox placeholder="Buscar una tarea…" />
        </div>

        <ViewBar moduleId="tasks" views={views} colorToken="--mod-tasks" />
      </div>

      <Card>
        <CardContent className="pt-5">
          <TaskList
            tasks={visible}
            today={today}
            grouping={grouping}
            emptyLabel={
              term !== ""
                ? `Nada que coincida con «${term}».`
                : "No hay tareas en esta ventana."
            }
          />
        </CardContent>
      </Card>
    </>
  );
}
