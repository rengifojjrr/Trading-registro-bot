import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { shiftDate, todayIn } from "@/core/today";
import { ChartFrame } from "@/core/ui/chart-frame";
import { MultiLineSeries, RankSeries } from "@/core/ui/charts";
import { userTimezone } from "@/core/user-settings";
import { countTasks } from "@/modules/tasks/domain/tasks";
import {
  averageDaysToDone,
  flowSeries,
  openByCategory,
  stalest,
  type AnalysableTask,
} from "@/modules/tasks/domain/tasks-analysis";
import { fetchTasks } from "@/modules/tasks/queries";

const WINDOW_DAYS = 45;

/**
 * Tareas: análisis.
 *
 * Las siete vistas de Notion respondían todas la misma pregunta con distinto
 * filtro: qué me queda. Ninguna respondía qué termino, ni cuánto tarda algo
 * en terminarse, ni qué se queda siempre atrás -- para eso hace falta la
 * fecha en que se completó, y una casilla marcada no la guarda.
 */
export default async function TasksAnalysisPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const from = shiftDate(today, -(WINDOW_DAYS - 1));

  const rows = await fetchTasks();
  const tasks: (AnalysableTask & { title: string })[] = rows.map((t) => ({
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.due_date,
    createdAt: t.created_at,
    completedAt: t.completed_at,
    categories: t.categories,
    projectName: t.projectName,
  }));

  const flow = flowSeries(tasks, from, today, timezone);
  const categories = openByCategory(tasks);
  const stale = stalest(tasks, today, timezone);
  const counts = countTasks(
    tasks.map((t) => ({ status: t.status, priority: t.priority, dueDate: t.dueDate })),
    today,
  );

  const created = flow.reduce((sum, r) => sum + r.creadas, 0);
  const completed = flow.reduce((sum, r) => sum + r.terminadas, 0);
  const average = averageDaysToDone(tasks);

  return (
    <>
      <PageHeader title="Análisis de tareas" description={`Los últimos ${WINDOW_DAYS} días.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile size="lg" label="Creadas" value={String(created)} sub="en la ventana" />
        <StatTile size="lg" label="Terminadas" value={String(completed)} sub="en la ventana" />
        <StatTile
          size="lg"
          label="Balance"
          value={`${completed - created >= 0 ? "+" : ""}${completed - created}`}
          tone={completed - created >= 0 ? "positive" : "negative"}
          sub={completed >= created ? "la lista mengua" : "la lista crece"}
          description="Terminadas menos creadas. Es la única cifra que dice si la lista va a algún sitio: cerrar cinco al día suena bien hasta que se ve que entran ocho."
        />
        <StatTile
          size="lg"
          label="Tarda en cerrarse"
          value={average === null ? "--" : `${average} días`}
          description="Días entre crear una tarea y marcarla. Sólo cuenta las terminadas, así que el número tira hacia abajo: las que llevan meses abiertas no han tardado nada todavía porque no han terminado."
        />
      </div>

      <ChartFrame
        title="Entra y sale"
        question="Tareas creadas y terminadas cada día."
        hint="Las dos líneas juntas contestan lo único que importa de una lista de tareas: si crece o mengua. Una sola de las dos no lo dice."
        empty={flow.every((r) => r.creadas === 0 && r.terminadas === 0)}
        emptyLabel="Crea y termina algunas tareas y aquí se verá el flujo."
      >
        <MultiLineSeries
          data={flow}
          height={250}
          series={[
            { key: "creadas", label: "Creadas", colorToken: "--negative" },
            { key: "terminadas", label: "Terminadas", colorToken: "--mod-tasks" },
          ]}
        />
      </ChartFrame>

      <ChartFrame
        title="En qué se te acumula"
        question="Pendientes por categoría."
        hint="Sólo lo pendiente: el reparto de lo hecho es historia, y el de lo pendiente es la semana que viene. Una tarea con dos categorías cuenta en las dos."
        empty={categories.length === 0}
        emptyLabel={counts.open === 0 ? "No tienes nada pendiente." : "Pon categorías a tus tareas."}
      >
        <RankSeries
          data={categories}
          colorToken="--mod-tasks"
          height={Math.max(160, categories.length * 34 + 40)}
        />
      </ChartFrame>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lo que lleva más tiempo abierto</CardTitle>
          <CardDescription>
            Una tarea que lleva meses abierta casi nunca es una tarea pendiente: es una decisión sin
            tomar. Hacerla, moverla o borrarla -- pero no dejarla ahí.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stale.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nada arrastrándose. Todo lo pendiente es de hoy o de ayer.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {stale.map((task) => (
                <li key={task.title} className="flex items-baseline gap-4 py-2.5">
                  <span className="text-sm">{task.title}</span>
                  <span className="ml-auto shrink-0 text-sm tabular-nums text-muted-foreground">
                    {task.days} días
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
