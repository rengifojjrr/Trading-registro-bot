"use client";

import { Circle, CircleCheck } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { colorVars } from "@/core/notion-colors";
import type { NowItem } from "@/core/reminders/queries";
import { NowReminderRow } from "@/core/reminders/ui/now-row";
import { cn } from "@/lib/utils";
import { setTaskStatus } from "@/modules/tasks/actions";
import type { ProjectColor } from "@/types/database";

export interface NowTask {
  id: string;
  title: string;
  projectName: string | null;
  projectColor: ProjectColor | null;
  /** «HH:MM» si tiene hora. */
  time: string | null;
  /** Para que «Deshacer» la deje como estaba. */
  status: "NO_INICIADA" | "EN_CURSO";
}

/**
 * «Ahora», en la portada: los recordatorios de hoy y lo que vence hoy, con
 * botones de un toque. Lo vencido de antes no va aquí: está en «Te está
 * esperando», que es donde se decide qué hacer con ello.
 */
export function NowPanel({ reminders, tasks, tz }: { reminders: NowItem[]; tasks: NowTask[]; tz: string }) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-[14px] border border-border bg-card px-3">
      {reminders.map((r) => (
        <NowReminderRow key={`${r.reminder.id}|${r.fireAt}|${r.estado}`} item={r} tz={tz} />
      ))}
      {tasks.map((t) => (
        <NowTaskRow key={t.id} task={t} />
      ))}
    </ul>
  );
}

function NowTaskRow({ task }: { task: NowTask }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [hecha, setHecha] = useState(false);

  const marcar = () =>
    start(async () => {
      setHecha(true);
      await setTaskStatus(task.id, "HECHA");
      toast.success("Hecha.", {
        action: {
          label: "Deshacer",
          onClick: () => {
            void setTaskStatus(task.id, task.status).then(() => {
              setHecha(false);
              router.refresh();
            });
          },
        },
      });
      router.refresh();
    });

  return (
    <li className={cn("flex items-center gap-2 py-1.5 text-sm", hecha && "opacity-60")}>
      <button
        type="button"
        onClick={marcar}
        disabled={pending || hecha}
        aria-label={`Marcar como hecha: ${task.title}`}
        className="flex size-11 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {hecha ? <CircleCheck className="size-4" aria-hidden /> : <Circle className="size-4" aria-hidden />}
      </button>
      <span className="w-11 shrink-0 tabular-nums text-muted-foreground">{task.time ?? "hoy"}</span>
      <Link href={`/tareas/${task.id}` as Route} className={cn("min-w-0 flex-1 hover:underline", hecha && "line-through")}>
        <span className="block truncate">{task.title}</span>
        {task.projectName ? (
          <span className="block truncate text-xs" style={{ ...colorVars(task.projectColor ?? "default"), color: "var(--tag-color)" }}>
            {task.projectName}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
