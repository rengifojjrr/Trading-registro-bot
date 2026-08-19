import { notFound } from "next/navigation";

import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEntityExtras } from "@/core/entity-extras";
import { colorCss } from "@/core/notion-colors";
import { todayIn } from "@/core/today";
import { DetailShell } from "@/core/ui/detail-shell";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import { countTasks } from "@/modules/tasks/domain/tasks";
import { fetchProject } from "@/modules/tasks/queries";
import { TaskList } from "@/modules/tasks/ui/task-list";

/**
 * La ficha de un proyecto.
 *
 * La pantalla de proyectos decía «4 pendientes · 0 hechas» y ahí se acababa:
 * para ver *cuáles* había que ir a la lista de tareas y filtrar a mano por un
 * filtro que no existía. Un proyecto es lo único de la aplicación que agrupa
 * trabajo a lo largo de meses, así que es justo donde hace falta poder entrar.
 *
 * Las tareas se agrupan por estado y no por urgencia: dentro de un proyecto la
 * pregunta no es «qué corre prisa» -- para eso está «Hoy» -- sino «por dónde
 * va esto», y para eso lo hecho y lo pendiente tienen que verse separados.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const found = await fetchProject(projectId);
  if (!found) notFound();

  const { project, tasks } = found;

  const [timezone, extras] = await Promise.all([
    userTimezone(),
    fetchEntityExtras("PROYECTO", project.id),
  ]);

  const today = todayIn(timezone);
  const counts = countTasks(
    tasks.map((t) => ({ status: t.status, priority: t.priority, dueDate: t.due_date })),
    today,
  );

  const closed = tasks
    .map((t) => t.completed_at)
    .filter((at): at is string => at !== null)
    .sort();

  const subtitle = [
    project.is_active ? null : "Archivado",
    `${tasks.length} ${tasks.length === 1 ? "tarea" : "tareas"} en total`,
    closed.length > 0
      ? `última cerrada el ${formatDate(closed[closed.length - 1], timezone)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailShell
      kind="PROYECTO"
      entityId={project.id}
      path={`/tareas/proyectos/${project.id}`}
      backHref="/tareas/proyectos"
      backLabel="Proyectos"
      icon={project.icon}
      title={project.name}
      subtitle={subtitle}
      colorToken="--mod-tasks"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Pendientes" value={String(counts.open)} />
        <StatTile
          label="Vencidas"
          value={String(counts.overdue)}
          tone={counts.overdue > 0 ? "negative" : "neutral"}
        />
        <StatTile label="Para hoy" value={String(counts.dueToday)} />
        <StatTile label="Hechas" value={String(counts.done)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base" style={{ color: colorCss(project.color) }}>
            Sus tareas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <TaskList
            tasks={tasks}
            today={today}
            grouping="ESTADO"
            emptyLabel="Este proyecto todavía no tiene tareas."
          />
        </CardContent>
      </Card>
    </DetailShell>
  );
}
