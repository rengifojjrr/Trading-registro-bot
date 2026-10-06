import Link from "next/link";
import type { Route } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { SecondFactorInvite } from "@/components/settings/second-factor-invite";
import { PROJECT_STATUS_LABELS, isClosedStatus } from "@/modules/tasks/domain/projects";
import { fetchProjectsOverview, type ProjectCard as Card } from "@/modules/tasks/project-queries";
import { NewProjectActions } from "@/modules/tasks/ui/projects/new-project";
import { ProjectCard } from "@/modules/tasks/ui/projects/project-card";
import type { ProjectStatus } from "@/types/database";
import { FolderKanban } from "lucide-react";

/**
 * Proyectos: la lista con su semáforo.
 *
 * Ordenada por lo que pide atención -- rojo, amarillo, verde -- y no por
 * nombre: la pregunta al abrirla es «¿qué se está torciendo?». Los terminados,
 * descartados y archivados van plegados al final; siguen ahí, no estorban.
 *
 * La gráfica de carga por proyecto vive ahora en «Análisis».
 */
const ORDEN_SALUD: Record<string, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2 };
const FILTROS: ProjectStatus[] = ["EN_MARCHA", "ESPERANDO", "ATASCADO", "EN_PAUSA", "IDEA"];

export default async function ProjectsPage(props: PageProps<"/tareas/proyectos">) {
  const searchParams = await props.searchParams;
  const estado = typeof searchParams.estado === "string" ? searchParams.estado : null;
  const { cards, today, timezone } = await fetchProjectsOverview();

  const vivos = cards.filter((c) => c.project.is_active && !isClosedStatus(c.project.status));
  const cerrados = cards.filter((c) => c.project.is_active && isClosedStatus(c.project.status));
  const archivados = cards.filter((c) => !c.project.is_active);

  const filtrados = (estado ? vivos.filter((c) => c.project.status === estado) : vivos).sort(
    (a, b) =>
      (ORDEN_SALUD[a.computed.health.level ?? ""] ?? 3) - (ORDEN_SALUD[b.computed.health.level ?? ""] ?? 3) ||
      a.project.name.localeCompare(b.project.name, "es"),
  );
  const cuenta = (s: ProjectStatus) => vivos.filter((c) => c.project.status === s).length;

  return (
    <>
      <PageHeader
        title="Proyectos"
        description="Cómo va cada uno, quién está y qué viene."
        action={<NewProjectActions />}
      />

      <SecondFactorInvite />

      {vivos.length > 0 ? (
        <nav aria-label="Filtrar por estado" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <Chip href="/tareas/proyectos" activo={estado === null}>
            Todos {vivos.length}
          </Chip>
          {FILTROS.filter((s) => cuenta(s) > 0).map((s) => (
            <Chip key={s} href={`/tareas/proyectos?estado=${s}`} activo={estado === s}>
              {PROJECT_STATUS_LABELS[s]} {cuenta(s)}
            </Chip>
          ))}
        </nav>
      ) : null}

      {cards.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Aún no tienes proyectos"
          description="Crea uno o cárgalo desde un archivo de Claude: la ficha, la gente, la hoja de ruta y las tareas de una vez."
        />
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguno en este estado.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtrados.map((card) => (
            <ProjectCard key={card.project.id} card={card} today={today} timezone={timezone} />
          ))}
        </div>
      )}

      <Plegados titulo="Terminados y descartados" cards={cerrados} today={today} timezone={timezone} />
      <Plegados titulo="Archivados" cards={archivados} today={today} timezone={timezone} />
    </>
  );
}

function Chip({ href, activo, children }: { href: string; activo: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href as Route}
      aria-current={activo ? "page" : undefined}
      className={cn(
        "flex min-h-11 shrink-0 items-center rounded-full border px-3 text-sm whitespace-nowrap transition-colors",
        activo
          ? "border-primary bg-accent font-medium text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function Plegados({ titulo, cards, today, timezone }: { titulo: string; cards: Card[]; today: string; timezone: string }) {
  if (cards.length === 0) return null;
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <span aria-hidden className="transition-transform group-open:rotate-90">▸</span>
        {titulo} ({cards.length})
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <ProjectCard key={card.project.id} card={card} today={today} timezone={timezone} />
        ))}
      </div>
    </details>
  );
}
