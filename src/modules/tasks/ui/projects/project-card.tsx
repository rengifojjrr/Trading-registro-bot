import Link from "next/link";
import type { Route } from "next";

import { PeopleStack } from "@/core/ui/person-avatar";
import { colorVars } from "@/core/notion-colors";
import { cn } from "@/lib/utils";
import {
  LOG_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  dateIn,
  dayLabel,
  progressLabel,
  shortDate,
} from "@/modules/tasks/domain/projects";
import type { ProjectCard as Card } from "@/modules/tasks/project-queries";

import { HealthDot, ProgressBar } from "./health-dot";

/**
 * La tarjeta de un proyecto en la lista.
 *
 * Responde, de arriba abajo, a lo que se pregunta al mirarla: cómo va (el
 * semáforo y su porqué), qué dijiste la última vez («Cómo va»), cuánto falta
 * (el avance y la meta), qué viene ahora y con quién. Toda la tarjeta es un
 * enlace: en el teléfono no hay que acertar con un botón pequeño.
 */
export function ProjectCard({ card, today, timezone }: { card: Card; today: string; timezone: string }) {
  const { project, computed, people, lastLog, nextWho } = card;
  const siguiente = computed.next[0];
  const reparto = [
    computed.mine > 0 ? `${computed.mine} ${computed.mine === 1 ? "tuya" : "tuyas"}` : null,
    computed.others > 0 ? `${computed.others} de otros` : null,
    computed.unassigned > 0 ? `${computed.unassigned} sin asignar` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/tareas/proyectos/${project.id}` as Route}
      className={cn(
        "group flex flex-col gap-2 rounded-[14px] border border-border bg-card p-4 pl-5 shadow-sm transition-colors hover:border-foreground/25",
        "relative overflow-hidden",
      )}
      style={colorVars(project.color)}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: "var(--tag-color)" }} />

      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 truncate text-base font-semibold text-foreground">
          {project.icon ? <span className="mr-1.5" aria-hidden>{project.icon}</span> : null}
          {project.name}
        </h3>
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          {PROJECT_STATUS_LABELS[project.status]}
        </span>
      </div>

      <HealthDot level={computed.health.level} why={computed.health.why} manual={computed.health.manual} />

      {project.how_md ? (
        <p className="line-clamp-2 text-sm text-foreground/90">
          «{project.how_md}»
          {project.how_at ? <span className="text-muted-foreground"> · {shortDate(dateIn(project.how_at, timezone), today)}</span> : null}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ProgressBar
          done={computed.progress.done}
          total={computed.progress.total}
          label={progressLabel(computed.progress)}
        />
        {project.target_on ? (
          <span className="text-xs text-muted-foreground">meta {shortDate(project.target_on, today)}</span>
        ) : null}
      </div>

      {siguiente ? (
        <p className="truncate text-xs text-muted-foreground">
          Próximo: <span className="text-foreground">{siguiente.title}</span> · {dayLabel(siguiente.date, today)}
          {nextWho ? ` · ${nextWho}` : ""}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <PeopleStack people={people} />
        {reparto.length > 0 ? <span>{reparto.join(" · ")}</span> : <span>Sin tareas abiertas</span>}
      </div>

      {lastLog ? (
        <p className="truncate text-xs text-muted-foreground">
          {dayLabel(dateIn(lastLog.at, timezone), today)}: {LOG_KIND_LABELS[lastLog.kind].toLowerCase()} · {lastLog.title}
        </p>
      ) : null}
    </Link>
  );
}
