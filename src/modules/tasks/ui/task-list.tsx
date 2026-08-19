"use client";

import { Check, Circle, CircleDot, Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { deleteTask, setTaskStatus } from "@/modules/tasks/actions";
import {
  PRIORITY_LABELS,
  URGENCY_LABELS,
  URGENCY_ORDER,
  compareWithinGroup,
  urgencyOf,
  type TaskStatus,
} from "@/modules/tasks/domain/tasks";
import type { TaskRow } from "@/modules/tasks/queries";

/**
 * Las tareas agrupadas por urgencia real, no por fecha.
 *
 * Una lista ordenada por fecha entierra lo vencido debajo de lo de dentro de
 * un mes. Aquí lo vencido va primero siempre, porque es lo que hay que
 * decidir: hacerlo, moverlo o borrarlo.
 */
export function TaskList({ tasks, today }: { tasks: TaskRow[]; today: string }) {
  const open = tasks.filter((t) => t.status !== "HECHA");
  const done = tasks.filter((t) => t.status === "HECHA");

  const groups = URGENCY_ORDER.map((urgency) => ({
    urgency,
    items: open
      .filter((t) => urgencyOf(t.due_date, today) === urgency)
      .sort((a, b) =>
        compareWithinGroup(
          { status: a.status, priority: a.priority, dueDate: a.due_date },
          { status: b.status, priority: b.priority, dueDate: b.due_date },
        ),
      ),
  })).filter((g) => g.items.length > 0);

  if (open.length === 0 && done.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay tareas. Añade una arriba.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {open.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada pendiente. Todo al día.</p>
      ) : null}

      {groups.map((group) => (
        <div key={group.urgency} className="flex flex-col gap-2">
          <h3
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              group.urgency === "VENCIDA" ? "text-negative" : "text-muted-foreground",
            )}
          >
            {URGENCY_LABELS[group.urgency]} · {group.items.length}
          </h3>
          {group.items.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      ))}

      {done.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Hechas · {done.length}
          </h3>
          {done.slice(0, 20).map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskItem({ task }: { task: TaskRow }) {
  const [pending, startTransition] = useTransition();
  const isDone = task.status === "HECHA";

  function cycle() {
    const next: TaskStatus =
      task.status === "NO_INICIADA" ? "EN_CURSO" : task.status === "EN_CURSO" ? "HECHA" : "NO_INICIADA";
    startTransition(async () => {
      await setTaskStatus(task.id, next);
    });
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
      <button
        type="button"
        onClick={cycle}
        disabled={pending}
        aria-label={`Cambiar estado de ${task.title}`}
        title="Sin empezar → En curso → Hecha"
        className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : isDone ? (
          <Check className="size-5" style={{ color: "var(--mod-tasks)" }} aria-hidden />
        ) : task.status === "EN_CURSO" ? (
          <CircleDot className="size-5" style={{ color: "var(--mod-tasks)" }} aria-hidden />
        ) : (
          <Circle className="size-5" aria-hidden />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn("text-sm", isDone && "text-muted-foreground line-through")}>{task.title}</span>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {task.projectName ? <Badge variant="outline">{task.projectName}</Badge> : null}
          {task.priority !== "MEDIA" ? (
            <Badge variant={task.priority === "ALTA" ? "warning" : "outline"}>
              {PRIORITY_LABELS[task.priority]}
            </Badge>
          ) : null}
          {task.due_date ? <span className="tabular-nums">{task.due_date}</span> : null}
          {task.categories.map((c) => (
            <span key={c} className="rounded-full border border-border px-2 py-0.5">
              {c}
            </span>
          ))}
        </div>
        {task.notes ? <p className="text-xs text-muted-foreground">{task.notes}</p> : null}
      </div>

      <button
        type="button"
        onClick={() =>
          startTransition(async () => {
            await deleteTask(task.id);
            toast.success("Tarea borrada.");
          })
        }
        disabled={pending}
        aria-label={`Borrar ${task.title}`}
        className="shrink-0 text-muted-foreground transition-colors hover:text-negative disabled:opacity-50"
      >
        <Trash2 className="size-4" aria-hidden />
      </button>
    </div>
  );
}
