import { notFound } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchEntityExtras } from "@/core/entity-extras";
import { todayIn } from "@/core/today";
import { DetailShell } from "@/core/ui/detail-shell";
import { userTimezone } from "@/core/user-settings";
import { formatDate } from "@/lib/format";
import { PRIORITY_LABELS, STATUS_LABELS, daysLeftLabel } from "@/modules/tasks/domain/tasks";
import { fetchProjects, fetchTask } from "@/modules/tasks/queries";
import { TaskForm } from "@/modules/tasks/ui/task-form";

/**
 * La ficha de una tarea.
 *
 * No existía ninguna: el módulo entero era una lista donde sólo se podía
 * marcar y borrar, y la descripción que traen tus tareas de Notion -- «Hacer
 * inventario de trendy sports» -- no tenía dónde verse.
 *
 * El formulario va arriba y no detrás de un botón de «editar». Una ficha que
 * hay que desbloquear para tocar convierte cada corrección en dos pasos, y
 * aquí casi todo lo que se viene a hacer es corregir.
 */
export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  const { taskId } = await params;

  const [task, projects] = await Promise.all([fetchTask(taskId), fetchProjects(true)]);
  if (!task) notFound();

  const [timezone, extras] = await Promise.all([
    userTimezone(),
    fetchEntityExtras("TAREA", task.id),
  ]);

  const today = todayIn(timezone);
  const remaining = daysLeftLabel(task.due_date, today);

  const subtitle = [
    STATUS_LABELS[task.status],
    PRIORITY_LABELS[task.priority] !== "Media" ? `prioridad ${PRIORITY_LABELS[task.priority].toLowerCase()}` : null,
    remaining,
    task.completed_at ? `cerrada el ${formatDate(task.completed_at, timezone)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <DetailShell
      kind="TAREA"
      entityId={task.id}
      path={`/tareas/${task.id}`}
      backHref="/tareas/todas"
      backLabel="Todas las tareas"
      icon={task.icon}
      title={task.title}
      subtitle={subtitle}
      colorToken="--mod-tasks"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Datos</CardTitle>
        </CardHeader>
        <CardContent>
          <TaskForm task={task} projects={projects} />
        </CardContent>
      </Card>
    </DetailShell>
  );
}
