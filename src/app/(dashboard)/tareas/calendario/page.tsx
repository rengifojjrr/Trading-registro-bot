import Link from "next/link";
import type { Route } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { daysBetween, monthOf } from "@/core/calendar";
import { colorVars } from "@/core/notion-colors";
import { todayIn } from "@/core/today";
import { MonthCalendar } from "@/core/ui/month-calendar";
import { userTimezone } from "@/core/user-settings";
import { fetchTasks, type TaskRow } from "@/modules/tasks/queries";

/**
 * Tareas: calendario.
 *
 * Contenido tenía calendario y Comidas tenía semana, pero Tareas -- el único
 * módulo donde la fecha es una promesa y no un registro -- sólo tenía listas.
 * Una lista dice cuántas hay; no dice si están todas apelotonadas el jueves.
 *
 * Una tarea con rango sale todos sus días y no sólo el último. Aplanarla a la
 * fecha de fin es exactamente lo que hacía que el calendario mintiera sobre
 * cuándo hay trabajo.
 */
export default async function TasksCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;

  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const month = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : monthOf(today);

  const tasks = await fetchTasks();

  const byDate = new Map<string, TaskRow[]>();
  for (const task of tasks) {
    if (!task.due_date) continue;
    for (const day of daysBetween(task.due_date, task.due_end)) {
      byDate.set(day, [...(byDate.get(day) ?? []), task]);
    }
  }

  const pending = tasks.filter((t) => t.status !== "HECHA" && t.due_date !== null).length;

  return (
    <>
      <PageHeader
        title="Calendario de tareas"
        description={`${pending} ${pending === 1 ? "tarea con fecha" : "tareas con fecha"}. Las que duran varios días salen en todos.`}
      />

      <Card>
        <CardContent className="pt-5">
          <MonthCalendar
            month={month}
            today={today}
            basePath="/tareas/calendario"
            itemsByDate={byDate}
            colorToken="--mod-tasks"
            renderItem={(task) => <CalendarTask task={task} />}
          />
        </CardContent>
      </Card>
    </>
  );
}

function CalendarTask({ task }: { task: TaskRow }) {
  const done = task.status === "HECHA";

  return (
    <Link
      href={`/tareas/${task.id}` as Route}
      title={task.title}
      className="block truncate rounded px-1 py-0.5 text-[0.7rem] leading-tight transition-opacity hover:opacity-80"
      style={{
        ...colorVars(task.projectColor),
        backgroundColor: "color-mix(in srgb, var(--tag-color) 16%, transparent)",
        color: "var(--tag-color)",
        textDecorationLine: done ? "line-through" : undefined,
        opacity: done ? 0.6 : undefined,
      }}
    >
      {task.icon ? `${task.icon} ` : ""}
      {task.title}
    </Link>
  );
}
