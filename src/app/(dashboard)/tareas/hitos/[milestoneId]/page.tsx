import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { colorVars } from "@/core/notion-colors";
import { isUuid } from "@/core/ids";
import { displayName } from "@/core/people";
import { MILESTONE_STATUS_LABELS, shortDate } from "@/modules/tasks/domain/projects";
import { fetchMilestone } from "@/modules/tasks/project-queries";
import { ProjectTasks } from "@/modules/tasks/ui/projects/project-tasks";

/**
 * Un hito de la hoja de ruta y sus tareas.
 *
 * Es lo que se abre al tocar un hito: qué es, para cuándo, de qué etapa y quién
 * responde, y debajo las tareas que cuelgan de él, con las mismas acciones que
 * en el proyecto.
 */
export default async function MilestonePage({ params }: { params: Promise<{ milestoneId: string }> }) {
  const { milestoneId } = await params;
  if (!isUuid(milestoneId)) notFound();
  const datos = await fetchMilestone(milestoneId);
  if (!datos) notFound();

  const { milestone, project, stage, tasks, people, today } = datos;
  const responsable = milestone.owner_person_id ? people.find((p) => p.id === milestone.owner_person_id) : null;
  const atrasado =
    milestone.due_on !== null && milestone.due_on < today && milestone.status !== "HECHO" && milestone.status !== "SALTADO";
  const owner = people.find((p) => p.is_owner)?.id ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/tareas/proyectos/${project.id}?tab=ruta` as Route}
        className="flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {project.name}
      </Link>

      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-4 pl-5" style={colorVars(project.color)}>
        <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: "var(--tag-color)" }} />
        <p className="text-xs text-muted-foreground">{milestone.kind === "ETAPA" ? "Etapa" : "Hito"}{stage ? ` · ${stage.title}` : ""}</p>
        <h1 className="text-xl font-semibold">{milestone.title}</h1>
        <p className={atrasado ? "text-sm text-negative" : "text-sm text-muted-foreground"}>
          {[
            MILESTONE_STATUS_LABELS[milestone.status],
            milestone.due_on ? shortDate(milestone.due_on, today) : null,
            responsable ? displayName(responsable) : null,
            atrasado ? "atrasado" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {milestone.detail ? <p className="mt-2 text-sm">{milestone.detail}</p> : null}
        {milestone.blocked_why ? <p className="mt-2 text-sm text-negative">Bloqueado: {milestone.blocked_why}</p> : null}
      </div>

      <ProjectTasks
        projectId={project.id}
        tasks={tasks}
        members={[]}
        people={people}
        ownerId={owner}
        streams={[]}
        milestones={[milestone]}
        today={today}
        defaultMilestoneId={milestone.kind === "HITO" ? milestone.id : undefined}
      />
    </div>
  );
}
