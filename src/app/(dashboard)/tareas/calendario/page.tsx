import Link from "next/link";
import type { Route } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { daysBetween, monthGrid, monthOf } from "@/core/calendar";
import { colorVars } from "@/core/notion-colors";
import { fetchReminderOccurrences, type ReminderView } from "@/core/reminders/queries";
import { reminderTitle } from "@/core/reminders/rule";
import { todayIn } from "@/core/today";
import { MonthCalendar } from "@/core/ui/month-calendar";
import { userTimezone } from "@/core/user-settings";
import { DateTime } from "@/lib/fecha";
import { fetchMilestonesBetween } from "@/modules/tasks/project-queries";
import { fetchTasks, type TaskRow } from "@/modules/tasks/queries";
import type { MilestoneStatus, ProjectColor } from "@/types/database";

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
 *
 * Con los proyectos, el mes junta tres cosas, cada una con su marca y el color
 * de su proyecto: tareas (○), hitos (◆) y recordatorios (🔔). Los recordatorios
 * salen de la base con la misma regla con la que suenan, y sólo desde hoy: lo
 * que ya pasó no se pinta con la regla.
 */

type Cosa =
  | { tipo: "TAREA"; task: TaskRow }
  | { tipo: "HITO"; id: string; title: string; status: MilestoneStatus; color: ProjectColor; projectName: string }
  | { tipo: "RECORDATORIO"; reminder: ReminderView; hora: string };

export default async function TasksCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const { mes } = await searchParams;

  const timezone = await userTimezone();
  const today = todayIn(timezone);
  const month = /^\d{4}-\d{2}$/.test(mes ?? "") ? mes! : monthOf(today);
  const rejilla = monthGrid(month).flat();
  const desde = rejilla[0]?.date ?? `${month}-01`;
  const hasta = rejilla[rejilla.length - 1]?.date ?? `${month}-28`;

  const [tasks, hitos, veces] = await Promise.all([
    fetchTasks(),
    fetchMilestonesBetween(desde, hasta).catch(() => []),
    fetchReminderOccurrences(desde, hasta).catch(() => []),
  ]);

  const byDate = new Map<string, Cosa[]>();
  const poner = (dia: string, cosa: Cosa) => byDate.set(dia, [...(byDate.get(dia) ?? []), cosa]);

  for (const v of veces) {
    poner(v.date, { tipo: "RECORDATORIO", reminder: v.reminder, hora: DateTime.fromISO(v.fireAt).setZone(timezone).toFormat("HH:mm") });
  }
  for (const h of hitos) {
    poner(h.due_on, { tipo: "HITO", id: h.id, title: h.title, status: h.status, color: h.projectColor, projectName: h.projectName });
  }
  for (const task of tasks) {
    if (!task.due_date) continue;
    for (const day of daysBetween(task.due_date, task.due_end)) poner(day, { tipo: "TAREA", task });
  }

  const pending = tasks.filter((t) => t.status !== "HECHA" && t.due_date !== null).length;

  return (
    <>
      <PageHeader
        title="Calendario"
        description={`${pending} ${pending === 1 ? "tarea con fecha" : "tareas con fecha"}, ${hitos.length} ${hitos.length === 1 ? "hito" : "hitos"} y lo que suena este mes. ○ tarea · ◆ hito · 🔔 recordatorio.`}
      />

      <Card>
        <CardContent className="pt-5">
          <MonthCalendar
            month={month}
            today={today}
            basePath="/tareas/calendario"
            itemsByDate={byDate}
            colorToken="--mod-tasks"
            renderItem={(cosa) => <Pieza cosa={cosa} />}
          />
        </CardContent>
      </Card>
    </>
  );
}

const pieza = "block truncate rounded px-1 py-0.5 text-[0.7rem] leading-tight transition-opacity hover:opacity-80";

function Pieza({ cosa }: { cosa: Cosa }) {
  if (cosa.tipo === "RECORDATORIO") {
    const r = cosa.reminder;
    return (
      <Link
        href={`/tareas/recordatorios?r=${r.id}` as Route}
        title={`${cosa.hora} · ${reminderTitle(r)}`}
        className={pieza}
        style={{
          ...colorVars(r.entityColor ?? "gray"),
          backgroundColor: "color-mix(in srgb, var(--tag-color) 10%, transparent)",
          color: "var(--tag-color)",
        }}
      >
        <span aria-hidden>🔔 </span>
        {cosa.hora} {reminderTitle(r)}
      </Link>
    );
  }
  if (cosa.tipo === "HITO") {
    const hecho = cosa.status === "HECHO" || cosa.status === "SALTADO";
    return (
      <Link
        href={`/tareas/hitos/${cosa.id}` as Route}
        title={`Hito de ${cosa.projectName}: ${cosa.title}`}
        className={`${pieza} font-medium`}
        style={{
          ...colorVars(cosa.color),
          backgroundColor: "color-mix(in srgb, var(--tag-color) 22%, transparent)",
          color: "var(--tag-color)",
          textDecorationLine: hecho ? "line-through" : undefined,
          opacity: hecho ? 0.6 : undefined,
        }}
      >
        <span aria-hidden>◆ </span>
        {cosa.title}
      </Link>
    );
  }
  const task = cosa.task;
  const done = task.status === "HECHA";
  return (
    <Link
      href={`/tareas/${task.id}` as Route}
      title={task.title}
      className={pieza}
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
