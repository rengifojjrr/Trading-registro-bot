import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { todayIn } from "@/core/today";
import { userTimezone } from "@/core/user-settings";
import { countTasks } from "@/modules/tasks/domain/tasks";
import type { Route } from "next";
import { fetchProjects, fetchTasks } from "@/modules/tasks/queries";
import { NewTask } from "@/modules/tasks/ui/new-task";
import { TaskList } from "@/modules/tasks/ui/task-list";
import { NotionImportCard } from "@/core/ui/notion-import-card";
import { runTasksFromNotion } from "@/modules/tasks/actions";
import { tasksDatabaseId } from "@/modules/tasks/notion-import";

/**
 * Tareas: hoy.
 *
 * Sólo lo vencido y lo de hoy. Enseñar aquí lo de dentro de un mes es
 * exactamente lo que convierte una lista de tareas en una lista que ya no se
 * mira: la pantalla de todos los días tiene que caber en la cabeza.
 */
export default async function TasksPage() {
  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const [tasks, projects] = await Promise.all([fetchTasks(), fetchProjects()]);

  // Sólo lo tuyo: las de otros son lo que esperas de ellos, no lo que te toca.
  // Y las subtareas suman con su madre, no aparte.
  const mias = tasks.filter((t) => t.mine);
  const counts = countTasks(
    mias
      .filter((t) => t.parent_id === null)
      .map((t) => ({ status: t.status, priority: t.priority, dueDate: t.due_date })),
    today,
  );
  const deOtros = tasks.filter((t) => !t.mine && t.parent_id === null && t.status !== "HECHA");
  const deOtrosVencidas = deOtros.filter((t) => t.due_date !== null && t.due_date < today).length;

  return (
    <>
      <PageHeader title="Hoy" description="Lo vencido primero, que es lo que hay que decidir." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile size="lg" label="Pendientes" value={String(counts.open)} sub="en total" />
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
          <TaskList
            tasks={mias}
            today={today}
            only={["VENCIDA", "HOY"]}
            showDone={false}
            emptyLabel="Nada vencido ni para hoy. Lo demás está en «Todas»."
          />
        </CardContent>
      </Card>

      {deOtros.length > 0 ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-5 text-sm">
            <span>
              <span className="font-medium">Esperando a otros:</span>{" "}
              {deOtros.length === 1 ? "1 tarea" : `${deOtros.length} tareas`}
              {deOtrosVencidas > 0 ? (
                <span className="text-negative">
                  {" "}
                  · {deOtrosVencidas === 1 ? "1 pasada de fecha" : `${deOtrosVencidas} pasadas de fecha`}
                </span>
              ) : null}
            </span>
            <Link
              href={"/tareas/todas?de=OTROS" as Route}
              className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground"
            >
              Ver de quién
            </Link>
          </CardContent>
        </Card>
      ) : null}

      <NotionImportCard
        title="Desde Notion"
        description="Trae la «✅ To-Do Base de Datos» con sus estados, prioridades y categorías. Los proyectos se crean sólo si alguna tarea los usa de verdad."
        label="Traer las tareas"
        configured={tasksDatabaseId() !== null}
        missingVariable="NOTION_TASKS_DATABASE_ID"
        onImport={runTasksFromNotion}
      />

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <Link href="/tareas/todas" className="underline underline-offset-4 hover:text-foreground">
          Ver todas
        </Link>
        <Link href="/tareas/proyectos" className="underline underline-offset-4 hover:text-foreground">
          Ver los proyectos
        </Link>
        <Link href="/tareas/analisis" className="underline underline-offset-4 hover:text-foreground">
          Ver el análisis
        </Link>
      </div>
    </>
  );
}
