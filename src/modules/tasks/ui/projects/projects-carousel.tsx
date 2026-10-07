import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { colorVars } from "@/core/notion-colors";
import { PeopleStack } from "@/core/ui/person-avatar";
import { dayLabel, isClosedStatus, progressLabel } from "@/modules/tasks/domain/projects";
import type { ProjectCard } from "@/modules/tasks/project-queries";

import { HealthDot, ProgressBar } from "./health-dot";

const PESO: Record<string, number> = { ROJO: 0, AMARILLO: 1, VERDE: 2 };

/**
 * Los proyectos en la portada: un carrusel de lado, con una tarjeta y un trozo
 * de la siguiente a la vista (así se nota que hay más).
 *
 * Primero lo que pide atención (rojo, luego amarillo); dentro de cada uno, el
 * orden de siempre. Cada tarjeta: su color, el semáforo con palabras, el
 * avance, hasta tres personas, lo próximo y el reparto «3 tuyas · 2 de otros».
 */
export function ProjectsCarousel({ cards, today }: { cards: ProjectCard[]; today: string }) {
  const activos = cards
    .filter((c) => c.project.is_active && !isClosedStatus(c.project.status))
    .map((c, i) => ({ c, i }))
    .sort(
      (a, b) =>
        (PESO[a.c.computed.health.level ?? ""] ?? 3) - (PESO[b.c.computed.health.level ?? ""] ?? 3) || a.i - b.i,
    )
    .map((x) => x.c);

  if (activos.length === 0) {
    return (
      <p className="rounded-[14px] border border-dashed border-border p-4 text-sm text-muted-foreground">
        Sin proyectos en marcha.{" "}
        <Link href="/tareas/proyectos" className="text-primary hover:underline">
          Crea uno o impórtalo desde Claude
        </Link>
        .
      </p>
    );
  }

  return (
    <ul
      aria-label="Proyectos"
      className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 motion-reduce:scroll-auto md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 xl:grid-cols-3"
    >
      {activos.map((card) => {
        const { project, computed, people, nextWho } = card;
        const siguiente = computed.next[0];
        const reparto = [
          computed.mine + computed.unassigned > 0 ? `${computed.mine + computed.unassigned} ${computed.mine + computed.unassigned === 1 ? "tuya" : "tuyas"}` : null,
          computed.others > 0 ? `${computed.others} de otros` : null,
        ].filter(Boolean);
        return (
          <li key={project.id} className="w-[78%] shrink-0 snap-start md:w-auto">
          <Link
            href={`/tareas/proyectos/${project.id}` as Route}
            className="relative flex h-full flex-col gap-2 overflow-hidden rounded-[14px] border border-border bg-card p-4 pl-5 shadow-sm transition-colors hover:border-foreground/25"
            style={colorVars(project.color)}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: "var(--tag-color)" }} />
            <h3 className="truncate text-base font-semibold">
              {project.icon ? <span className="mr-1.5" aria-hidden>{project.icon}</span> : null}
              {project.name}
            </h3>
            <HealthDot level={computed.health.level} why={computed.health.why} manual={computed.health.manual} />
            <ProgressBar done={computed.progress.done} total={computed.progress.total} label={progressLabel(computed.progress)} />
            <div className="flex items-center justify-between gap-2">
              <PeopleStack people={people} max={3} />
              {reparto.length > 0 ? <span className="text-xs text-muted-foreground">{reparto.join(" · ")}</span> : null}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {siguiente ? (
                <>
                  Sig.: <span className="text-foreground">{siguiente.title}</span> · {dayLabel(siguiente.date, today)}
                  {nextWho ? ` · ${nextWho}` : ""}
                </>
              ) : (
                "Nada con fecha"
              )}
            </p>
          </Link>
          </li>
        );
      })}
      <li className="w-[40%] shrink-0 snap-start md:hidden">
        <Link
          href="/tareas/proyectos"
          className="flex h-full min-h-11 items-center justify-center gap-1 rounded-[14px] border border-dashed border-border p-4 text-sm text-muted-foreground hover:text-foreground"
        >
          Todos <ArrowRight className="size-4" aria-hidden />
        </Link>
      </li>
    </ul>
  );
}
