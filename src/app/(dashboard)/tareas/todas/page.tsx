import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { fetchTasks } from "@/modules/tasks/queries";
import { TaskList } from "@/modules/tasks/ui/task-list";

/**
 * Tareas: todas.
 *
 * Los cinco grupos de urgencia y las hechas al final. Es el equivalente a las
 * siete vistas de la tabla de Notion, que en realidad respondían todas lo
 * mismo con distinto filtro -- aquí una sola pantalla las cubre porque el
 * grupo ya es el filtro.
 */
export default async function AllTasksPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const tasks = await fetchTasks();

  return (
    <>
      <PageHeader
        title="Todas las tareas"
        description="Agrupadas por urgencia real: vencidas, hoy, esta semana, más adelante y sin fecha."
      />

      <Card>
        <CardContent className="pt-5">
          <TaskList
            tasks={tasks}
            today={today}
            emptyLabel="No hay tareas todavía. Créalas desde «Hoy»."
          />
        </CardContent>
      </Card>
    </>
  );
}
