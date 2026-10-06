"use client";

import { Check, Circle, CircleDot, CircleSlash, Loader2, OctagonAlert, Plus } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { displayName } from "@/core/people";
import { cn } from "@/lib/utils";
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABELS,
  PROJECT_LIMITS,
  shortDate,
} from "@/modules/tasks/domain/projects";
import { addMilestone, setMilestoneStatus } from "@/modules/tasks/project-actions";
import type { MilestoneRow, PersonRow, ProjectTaskRow } from "@/modules/tasks/project-queries";
import type { MilestoneStatus } from "@/types/database";

const selectClass =
  "h-11 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const ICONO: Record<MilestoneStatus, typeof Circle> = {
  PENDIENTE: Circle,
  EN_CURSO: CircleDot,
  HECHO: Check,
  BLOQUEADO: OctagonAlert,
  SALTADO: CircleSlash,
};

/** «15 oct», o «nov» si la fecha es de un mes entero. */
function cuando(m: MilestoneRow, today: string): string | null {
  if (!m.due_on) return null;
  if (m.due_precision === "MES") return shortDate(m.due_on, today).replace(/^\d+\s/, "");
  return shortDate(m.due_on, today);
}

/**
 * La hoja de ruta: etapas y, dentro, sus hitos, en una línea vertical.
 *
 * Una raya «hoy» parte lo pasado de lo que viene, y un hito atrasado sale en
 * rojo. Tocar un hito abre sus tareas. El estado se cambia con un toque.
 */
export function ProjectRoadmap({
  projectId,
  milestones,
  tasks,
  people,
  today,
}: {
  projectId: string;
  milestones: MilestoneRow[];
  tasks: ProjectTaskRow[];
  people: PersonRow[];
  today: string;
}) {
  const etapas = milestones.filter((m) => m.kind === "ETAPA");
  const hitos = milestones.filter((m) => m.kind === "HITO");
  const sueltos = hitos.filter((h) => h.stage_id === null || !etapas.some((e) => e.id === h.stage_id));
  const nombre = (id: string | null) => {
    const p = id ? people.find((x) => x.id === id) : null;
    return p ? displayName(p) : null;
  };

  const bloques: { etapa: MilestoneRow | null; hitos: MilestoneRow[] }[] = [
    ...(sueltos.length > 0 ? [{ etapa: null, hitos: sueltos }] : []),
    ...etapas.map((e) => ({ etapa: e, hitos: hitos.filter((h) => h.stage_id === e.id) })),
  ];

  // Dónde va la raya de «hoy»: antes del primer hito con fecha futura.
  const hoyAntesDe = hitos
    .filter((h) => h.due_on !== null && h.due_on >= today)
    .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""))[0]?.id;

  return (
    <div className="flex flex-col gap-4">
      {bloques.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Sin hoja de ruta todavía. Añade las etapas y sus hitos, o pídesela a Claude y la importas.
        </p>
      ) : null}

      <ol className="flex flex-col gap-4">
        {bloques.map(({ etapa, hitos: suyos }, i) => {
          const hechos = suyos.filter((h) => h.status === "HECHO").length;
          const contados = suyos.filter((h) => h.status !== "SALTADO").length;
          return (
            <li key={etapa?.id ?? "sueltos"} className="flex flex-col gap-2">
              {etapa ? (
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    Etapa {i + (sueltos.length > 0 ? 0 : 1)} · {etapa.title}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {[
                      etapa.starts_on && etapa.due_on
                        ? `${shortDate(etapa.starts_on, today)} – ${shortDate(etapa.due_on, today)}`
                        : etapa.due_on
                          ? shortDate(etapa.due_on, today)
                          : null,
                      contados > 0 ? `${hechos}/${contados}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              ) : null}
              <ul className="flex flex-col border-l-2 border-border pl-4">
                {suyos.map((h) => (
                  <Hito
                    key={h.id}
                    hito={h}
                    hoyAntes={h.id === hoyAntesDe}
                    today={today}
                    responsable={nombre(h.owner_person_id)}
                    tareas={tasks.filter((t) => t.milestone_id === h.id && t.status !== "HECHA").length}
                  />
                ))}
                {suyos.length === 0 ? <li className="py-2 text-sm text-muted-foreground">Sin hitos.</li> : null}
              </ul>
            </li>
          );
        })}
      </ol>

      <NuevoHito projectId={projectId} etapas={etapas} people={people} />
    </div>
  );
}

function Hito({
  hito,
  hoyAntes,
  today,
  responsable,
  tareas,
}: {
  hito: MilestoneRow;
  hoyAntes: boolean;
  today: string;
  responsable: string | null;
  tareas: number;
}) {
  const [pending, start] = useTransition();
  const atrasado = hito.due_on !== null && hito.due_on < today && hito.status !== "HECHO" && hito.status !== "SALTADO";
  const Icono = ICONO[hito.status];

  const cambiar = (status: MilestoneStatus) =>
    start(async () => {
      const r = await setMilestoneStatus(hito.id, status);
      if (r.error) toast.error(r.error);
    });

  return (
    <>
      {hoyAntes ? (
        <li aria-label="Hoy" className="-ml-4 flex items-center gap-2 py-1 text-xs font-medium" style={{ color: "var(--mod-tasks)" }}>
          <span className="h-px flex-1" style={{ backgroundColor: "var(--mod-tasks)" }} /> hoy
          <span className="h-px flex-1" style={{ backgroundColor: "var(--mod-tasks)" }} />
        </li>
      ) : null}
      <li className="flex items-start gap-2 py-1.5">
        <Icono
          className={cn("mt-1 size-4 shrink-0", atrasado ? "text-negative" : "text-muted-foreground")}
          style={hito.status === "HECHO" ? { color: "var(--mod-tasks)" } : undefined}
          aria-hidden
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            href={`/tareas/hitos/${hito.id}` as Route}
            className={cn("text-sm hover:underline", hito.status === "HECHO" && "text-muted-foreground", atrasado && "text-negative")}
          >
            {hito.title}
          </Link>
          <span className="text-xs text-muted-foreground">
            {[cuando(hito, today), responsable, tareas > 0 ? `${tareas} ${tareas === 1 ? "tarea" : "tareas"}` : null, atrasado ? "atrasado" : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <select
          value={hito.status}
          disabled={pending}
          onChange={(e) => cambiar(e.target.value as MilestoneStatus)}
          aria-label={`Estado de ${hito.title}`}
          className="h-9 shrink-0 rounded-md border border-input bg-transparent px-1.5 text-xs"
        >
          {MILESTONE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {MILESTONE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </li>
    </>
  );
}

function NuevoHito({ projectId, etapas, people }: { projectId: string; etapas: MilestoneRow[]; people: PersonRow[] }) {
  const [abierto, setAbierto] = useState<"HITO" | "ETAPA" | null>(null);
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState(etapas[etapas.length - 1]?.id ?? "");
  const [starts, setStarts] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("");

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!abierto) return;
    start(async () => {
      const r = await addMilestone(projectId, {
        kind: abierto,
        title,
        stage_id: abierto === "HITO" ? stage : "",
        starts_on: abierto === "ETAPA" ? starts : "",
        due_on: due,
        due_precision: "DIA",
        owner_person_id: owner,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success(abierto === "HITO" ? "Hito puesto." : "Etapa creada.");
      setTitle("");
      setDue("");
      setStarts("");
      setAbierto(null);
    });
  };

  if (!abierto) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setAbierto("HITO")} className="min-h-11">
          <Plus aria-hidden /> Hito
        </Button>
        <Button type="button" variant="outline" onClick={() => setAbierto("ETAPA")} className="min-h-11">
          <Plus aria-hidden /> Etapa
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-2 rounded-[14px] border border-border p-3">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={abierto === "HITO" ? "Hito (Visita al campo…)" : "Etapa (Conocer el negocio…)"}
        aria-label={abierto === "HITO" ? "Hito" : "Etapa"}
        maxLength={PROJECT_LIMITS.milestoneTitle}
        required
        className="h-11"
        autoFocus
      />
      <div className="grid grid-cols-2 gap-2">
        {abierto === "ETAPA" ? (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Desde
            <Input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} className="h-11" />
          </label>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Etapa
            <select value={stage} onChange={(e) => setStage(e.target.value)} className={selectClass}>
              <option value="">Sin etapa</option>
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {abierto === "ETAPA" ? "Hasta" : "Fecha"}
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-11" />
        </label>
      </div>
      {abierto === "HITO" ? (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Quién responde
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={selectClass}>
            <option value="">Nadie en concreto</option>
            {people
              .filter((p) => !p.archived_at)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {displayName(p)}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Guardar
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAbierto(null)} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
