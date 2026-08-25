"use client";

import { Check, Circle, CircleDot, Loader2, MessageSquare, Paperclip } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Route } from "next";

import { Badge } from "@/components/ui/badge";
import { colorVars } from "@/core/notion-colors";
import { DeleteButton } from "@/core/ui/delete-button";
import { cn } from "@/lib/utils";
import { afterTaskRemoved, setTaskStatus, setTasksStatus } from "@/modules/tasks/actions";
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  URGENCY_LABELS,
  URGENCY_ORDER,
  compareWithinGroup,
  daysLeftLabel,
  urgencyOf,
  type TaskGrouping,
  type TaskStatus,
  type Urgency,
} from "@/modules/tasks/domain/tasks";
import type { TaskRow } from "@/modules/tasks/queries";

/**
 * Las tareas agrupadas.
 *
 * Por urgencia de partida, porque una lista ordenada por fecha entierra lo
 * vencido debajo de lo de dentro de un mes. Pero ya no sólo por urgencia:
 * tus tableros de Notion agrupan también por Projectos y por categoría, y
 * fijar una sola agrupación es decidir por ti cuál es la pregunta.
 *
 * Se acabó el corte en veinte: de tus 42 tareas hechas, 22 no se veían desde
 * ninguna pantalla. Ahora las hechas empiezan plegadas -- que es lo que
 * resolvía el corte, no perder de vista lo pendiente -- y se abren enteras.
 */
export function TaskList({
  tasks,
  today,
  only,
  showDone = true,
  grouping = "URGENCIA",
  emptyLabel = "No hay tareas. Añade una arriba.",
}: {
  tasks: TaskRow[];
  today: string;
  /**
   * Qué grupos de urgencia mostrar. La pantalla de «Hoy» pide sólo lo vencido
   * y lo de hoy: enseñar ahí lo de dentro de un mes es exactamente lo que
   * convierte una lista de tareas en una lista que no se mira.
   */
  only?: readonly Urgency[];
  showDone?: boolean;
  grouping?: TaskGrouping;
  emptyLabel?: string;
}) {
  const [doneOpen, setDoneOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkPending, startBulk] = useTransition();

  const open = tasks.filter((t) => t.status !== "HECHA");
  const done = tasks.filter((t) => t.status === "HECHA");

  const groups = buildGroups(open, today, grouping, only);

  const toggleSelected = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  if (groups.length === 0 && (!showDone || done.length === 0)) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Doce tareas pasadas de fecha se despachan de una revisión, no de
          doce: las que ya no aplican se cierran juntas y las que siguen vivas
          se dejan. Ir una por una es lo que hace que la lista de vencidas
          crezca hasta que se ignora entera. */}
      {selected.length > 0 ? (
        <div className="sticky bottom-2 z-30 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg md:static md:bg-secondary/40 md:shadow-none">
          <span className="text-muted-foreground">
            {selected.length === 1
              ? "1 tarea seleccionada."
              : `${selected.length} tareas seleccionadas.`}
          </span>
          <button
            type="button"
            disabled={bulkPending}
            onClick={() =>
              startBulk(async () => {
                const result = await setTasksStatus(selected, "HECHA");
                if (result.error) toast.error(result.error);
                else toast.success(`${result.changed} marcada(s) como hecha(s).`);
                setSelected([]);
              })
            }
            className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            {bulkPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Check className="size-3.5" aria-hidden />
            )}
            Marcar hechas
          </button>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Quitar selección
          </button>
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada pendiente. Todo al día.</p>
      ) : null}

      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-2">
          <h3
            className={cn(
              "text-xs font-medium uppercase tracking-wide",
              group.key === "VENCIDA" ? "text-negative" : "text-muted-foreground",
            )}
          >
            {group.label} · {group.items.length}
          </h3>
          {group.items.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              today={today}
              selected={selected.includes(task.id)}
              onToggleSelected={() => toggleSelected(task.id)}
            />
          ))}
        </div>
      ))}

      {showDone && done.length > 0 ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setDoneOpen((o) => !o)}
            aria-expanded={doneOpen}
            className="flex w-fit items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            Hechas · {done.length}
            <span aria-hidden>{doneOpen ? "▾" : "▸"}</span>
          </button>
          {doneOpen
            ? done.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  today={today}
                  selected={selected.includes(task.id)}
                  onToggleSelected={() => toggleSelected(task.id)}
                />
              ))
            : null}
        </div>
      ) : null}
    </div>
  );
}

interface Group {
  key: string;
  label: string;
  items: TaskRow[];
}

/**
 * Reparte las tareas en grupos según la propiedad elegida.
 *
 * La urgencia lleva orden propio -- primero lo vencido -- y las demás se
 * ordenan alfabéticamente, con «Sin …» al final: un cubo de sobras al
 * principio empuja hacia abajo justo lo que sí está clasificado.
 */
function buildGroups(
  tasks: TaskRow[],
  today: string,
  grouping: TaskGrouping,
  only?: readonly Urgency[],
): Group[] {
  const sort = (items: TaskRow[]) =>
    [...items].sort((a, b) =>
      compareWithinGroup(
        { status: a.status, priority: a.priority, dueDate: a.due_date },
        { status: b.status, priority: b.priority, dueDate: b.due_date },
      ),
    );

  if (grouping === "URGENCIA") {
    return (only ?? URGENCY_ORDER)
      .map((urgency) => ({
        key: urgency,
        label: URGENCY_LABELS[urgency],
        items: sort(tasks.filter((t) => urgencyOf(t.due_date, today) === urgency)),
      }))
      .filter((group) => group.items.length > 0);
  }

  const buckets = new Map<string, TaskRow[]>();
  const push = (key: string, task: TaskRow) =>
    buckets.set(key, [...(buckets.get(key) ?? []), task]);

  for (const task of tasks) {
    if (grouping === "PROYECTO") push(task.projectName ?? "Sin proyecto", task);
    else if (grouping === "PRIORIDAD") push(PRIORITY_LABELS[task.priority], task);
    else if (grouping === "ESTADO") push(STATUS_LABELS[task.status], task);
    else if (task.categories.length === 0) push("Sin categoría", task);
    // Una tarea con tres categorías sale en los tres grupos, igual que en un
    // tablero de Notion agrupado por multi-select.
    else for (const category of task.categories) push(category, task);
  }

  return [...buckets]
    .map(([key, items]) => ({ key, label: key, items: sort(items) }))
    .sort((a, b) => {
      const aSpare = a.label.startsWith("Sin ");
      const bSpare = b.label.startsWith("Sin ");
      if (aSpare !== bSpare) return aSpare ? 1 : -1;
      return a.label.localeCompare(b.label, "es");
    });
}

function TaskItem({
  task,
  today,
  selected,
  onToggleSelected,
}: {
  task: TaskRow;
  today: string;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const isDone = task.status === "HECHA";
  const remaining = isDone ? null : daysLeftLabel(task.due_date, today);
  const overdue = !isDone && task.due_date !== null && task.due_date < today;

  /**
   * Marcar y desmarcar, sin pasar por «en curso».
   *
   * Antes el círculo giraba entre los tres estados, así que el primer toque
   * dejaba la tarea «en curso» y seguía en la lista. Tachar algo y verlo
   * quedarse ahí es lo que hace que uno deje de tachar: un toque tiene que
   * quitarla de la vista.
   *
   * «En curso» no desaparece -- se elige en la ficha, que es donde uno está
   * cuando de verdad quiere decir «esto lo empecé pero no lo terminé».
   */
  function toggleDone() {
    const next: TaskStatus = isDone ? "NO_INICIADA" : "HECHA";
    startTransition(async () => {
      await setTaskStatus(task.id, next);
    });
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5",
        selected ? "border-primary bg-primary/5" : "border-border",
      )}
    >
      {/* La casilla es para seleccionar varias; el círculo de al lado sigue
          siendo el toque rápido de una sola. Dos gestos distintos porque son
          dos intenciones distintas, y fundirlos haría que marcar una tarea
          hecha exigiera confirmar. */}
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelected}
        aria-label={`Seleccionar ${task.title}`}
        className="mt-1 size-4 shrink-0"
      />
      <button
        type="button"
        onClick={toggleDone}
        disabled={pending}
        aria-pressed={isDone}
        aria-label={isDone ? `Desmarcar ${task.title}` : `Marcar ${task.title} como hecha`}
        title={isDone ? "Desmarcar" : "Marcar como hecha"}
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
        <Link
          href={`/tareas/${task.id}` as Route}
          className={cn(
            "text-sm hover:underline",
            isDone && "text-muted-foreground line-through",
          )}
        >
          {task.icon ? `${task.icon} ` : ""}
          {task.title}
        </Link>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {task.projectName ? (
            <span
              className="rounded-full border px-2 py-0.5"
              style={{
                ...colorVars(task.projectColor),
                borderColor: "var(--tag-color)",
                color: "var(--tag-color)",
              }}
            >
              {task.projectName}
            </span>
          ) : null}

          {task.priority !== "MEDIA" ? (
            <Badge variant={task.priority === "ALTA" ? "warning" : "outline"}>
              {PRIORITY_LABELS[task.priority]}
            </Badge>
          ) : null}

          {remaining ? (
            <span className={cn("tabular-nums", overdue && "text-negative")}>{remaining}</span>
          ) : null}

          {task.due_time ? (
            <span className="tabular-nums">{task.due_time.slice(0, 5)}</span>
          ) : null}

          {task.categories.map((category) => (
            <span key={category} className="rounded-full border border-border px-2 py-0.5">
              {category}
            </span>
          ))}

          {task.description ? (
            <MessageSquare className="size-3" aria-label="Tiene descripción" />
          ) : null}
          {task.notes ? <Paperclip className="size-3" aria-label="Tiene nota" /> : null}
        </div>
      </div>

      <DeleteButton
        kind="TAREA"
        entityId={task.id}
        path="/tareas"
        label={task.title}
        onRemoved={afterTaskRemoved}
      />
    </div>
  );
}
