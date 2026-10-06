import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { StatTile } from "@/components/dashboard/stat-tile";
import { fetchEntityExtras } from "@/core/entity-extras";
import { isUuid } from "@/core/ids";
import { displayName } from "@/core/people";
import { DetailShell } from "@/core/ui/detail-shell";
import { PersonAvatar } from "@/core/ui/person-avatar";
import { cn } from "@/lib/utils";
import {
  LOG_KIND_LABELS,
  dateIn,
  dayLabel,
  originOf,
  progressLabel,
} from "@/modules/tasks/domain/projects";
import { fetchProjectFull } from "@/modules/tasks/project-queries";
import { FichaPanel, HowCard, LogPanel, SourcesPanel } from "@/modules/tasks/ui/projects/project-panels";
import { ProjectHeader } from "@/modules/tasks/ui/projects/project-header";
import { ProjectPeople } from "@/modules/tasks/ui/projects/project-people";
import { ProjectRoadmap } from "@/modules/tasks/ui/projects/project-roadmap";
import { ProjectTasks } from "@/modules/tasks/ui/projects/project-tasks";
import { OriginIcon } from "@/modules/tasks/ui/projects/origin-icon";

/**
 * La página de un proyecto: la pieza central.
 *
 * Arriba, la cabecera con el estado y el semáforo (que se cambian de un
 * toque), el objetivo, las fechas, la gente y el avance; debajo, «Cómo va».
 * Luego las pestañas: Resumen, Tareas (por persona), Personas, Hoja de ruta,
 * Ficha, Bitácora y Fuentes. Son enlaces (`?tab=`), así que cada una se puede
 * abrir directamente y el botón de atrás del teléfono funciona.
 *
 * Al pie, lo de todas las fichas: vínculos, ficheros y comentarios.
 */
const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "tareas", label: "Tareas" },
  { id: "personas", label: "Personas" },
  { id: "ruta", label: "Hoja de ruta", corta: "Ruta" },
  { id: "ficha", label: "Ficha" },
  { id: "bitacora", label: "Bitácora" },
  { id: "fuentes", label: "Fuentes" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  if (!isUuid(projectId)) notFound();

  const datos = await fetchProjectFull(projectId);
  if (!datos) notFound();

  const tabParam = typeof query.tab === "string" ? query.tab : "resumen";
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "resumen";
  const para = typeof query.para === "string" ? query.para : null;

  const { project, computed, members, today, timezone } = datos;
  const extras = await fetchEntityExtras("PROYECTO", project.id);
  const nombres = new Map(datos.allPeople.map((p) => [p.id, displayName(p)]));
  const gente = members.filter((m) => m.active).map((m) => m.person);
  const base = `/tareas/proyectos/${project.id}`;

  return (
    <DetailShell
      kind="PROYECTO"
      entityId={project.id}
      path={base}
      backHref="/tareas/proyectos"
      backLabel="Proyectos"
      icon={project.icon}
      title={project.name}
      colorToken="--mod-tasks"
      comments={extras.comments}
      attachments={extras.attachments}
      related={extras.related}
      header={
        <div className="flex flex-col gap-3">
          <ProjectHeader
            project={project}
            health={computed.health}
            progress={{ ...computed.progress, label: progressLabel(computed.progress) }}
            people={gente}
            today={today}
          />
          <HowCard
            projectId={project.id}
            how={project.how_md}
            howAt={project.how_at}
            howBy={project.how_by}
            today={today}
            timezone={timezone}
          />
        </div>
      }
    >
      {/* En el teléfono las siete pestañas pasan a dos filas en vez de
          desplazarse de lado: a 375 px sólo se veían cuatro y nada decía que
          había más (Ficha, Bitácora y Fuentes no existían para quien no lo
          supiera). */}
      <nav
        aria-label="Secciones del proyecto"
        className="flex flex-wrap gap-1 border-b border-border pb-2 md:flex-nowrap md:gap-1.5 md:overflow-x-auto"
      >
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={(t.id === "resumen" ? base : `${base}?tab=${t.id}`) as Route}
            scroll={false}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm whitespace-nowrap transition-colors",
              tab === t.id ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {"corta" in t ? (
              <>
                <span className="md:hidden">{t.corta}</span>
                <span className="hidden md:inline">{t.label}</span>
              </>
            ) : (
              t.label
            )}
          </Link>
        ))}
      </nav>

      {tab === "resumen" ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Pendientes" value={String(computed.open)} />
            <StatTile label="Atrasadas" value={String(computed.overdue)} tone={computed.overdue > 0 ? "negative" : "neutral"} />
            <StatTile label="De otros" value={String(computed.others)} />
            <StatTile label="Avance" value={progressLabel(computed.progress)} />
          </div>

          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Lo próximo</h2>
            {computed.next.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada con fecha. Pon fecha a lo que corra prisa.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {computed.next.map((n) => {
                  const tarea = n.kind === "TAREA" ? datos.tasks.find((t) => t.id === n.id) : null;
                  const origen = tarea ? originOf(tarea) : null;
                  return (
                    <li key={n.id} className="flex items-center gap-2 py-2 text-sm">
                      <span aria-hidden className="w-4 text-center text-muted-foreground">
                        {n.kind === "HITO" ? "◆" : "○"}
                      </span>
                      <Link
                        href={(n.kind === "HITO" ? `/tareas/hitos/${n.id}` : `/tareas/${n.id}`) as Route}
                        className="min-w-0 flex-1 truncate hover:underline"
                      >
                        {n.assigneeId && n.assigneeId !== datos.ownerId ? `${nombres.get(n.assigneeId) ?? ""}: ` : ""}
                        {n.title}
                      </Link>
                      <span className={cn("shrink-0 text-xs tabular-nums", n.date < today ? "text-negative" : "text-muted-foreground")}>
                        {dayLabel(n.date, today)}
                      </span>
                      {origen ? <OriginIcon origin={origen.key} text={origen.text} /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {computed.waiting.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Esperando a otros</h2>
              <ul className="flex flex-col gap-2">
                {computed.waiting.map((w) => {
                  const persona = datos.allPeople.find((p) => p.id === w.personId);
                  return (
                    <li key={w.personId} className="flex items-center gap-2 text-sm">
                      {persona ? <PersonAvatar person={persona} size="sm" /> : null}
                      <span className="min-w-0 flex-1 truncate">
                        {nombres.get(w.personId) ?? "Alguien"} · {w.oldestTitle}
                        {w.count > 1 ? ` y ${w.count - 1} más` : ""}
                      </span>
                      <span className={cn("shrink-0 text-xs tabular-nums", w.days > 7 ? "text-warning" : "text-muted-foreground")}>
                        {w.days <= 0 ? "desde hoy" : `${w.days} ${w.days === 1 ? "día" : "días"}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Últimas novedades</h2>
              <Link href={`${base}?tab=bitacora` as Route} scroll={false} className="text-xs text-muted-foreground hover:text-foreground">
                Ver todo
              </Link>
            </div>
            {datos.log.filter((l) => !l.auto).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada apuntado todavía.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {datos.log
                  .filter((l) => !l.auto)
                  .slice(0, 3)
                  .map((l) => (
                    <li key={l.id} className="text-sm">
                      <span className="text-xs text-muted-foreground">
                        {dayLabel(dateIn(l.at, timezone), today)} · {LOG_KIND_LABELS[l.kind]}:{" "}
                      </span>
                      {l.title}
                    </li>
                  ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === "tareas" ? (
        <ProjectTasks
          projectId={project.id}
          tasks={datos.tasks}
          members={members.filter((m) => m.active).map((m) => ({ person: m.person, role: m.role, waitingDays: m.waitingDays }))}
          people={datos.allPeople}
          ownerId={datos.ownerId}
          streams={datos.streams}
          milestones={datos.milestones}
          today={today}
          prefillAssignee={para}
        />
      ) : null}

      {tab === "personas" ? (
        <ProjectPeople projectId={project.id} members={members} allPeople={datos.allPeople} ownerId={datos.ownerId} />
      ) : null}

      {tab === "ruta" ? (
        <ProjectRoadmap
          projectId={project.id}
          milestones={datos.milestones}
          tasks={datos.tasks}
          people={datos.allPeople}
          today={today}
        />
      ) : null}

      {tab === "ficha" ? (
        <FichaPanel projectId={project.id} ficha={datos.ficha} versions={datos.fichaVersions} today={today} timezone={timezone} />
      ) : null}

      {tab === "bitacora" ? <LogPanel projectId={project.id} log={datos.log} today={today} timezone={timezone} /> : null}

      {tab === "fuentes" ? <SourcesPanel projectId={project.id} sources={datos.sources} /> : null}
    </DetailShell>
  );
}
