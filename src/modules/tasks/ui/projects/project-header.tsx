"use client";

import { ArrowLeft, Archive, BellPlus, FileDown, FileUp, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { restoreAction, trashAction } from "@/core/actions";
import { PeopleStack } from "@/core/ui/person-avatar";
import { cn } from "@/lib/utils";
import { COLOR_LABELS, PROJECT_COLORS, colorVars } from "@/core/notion-colors";
import { setProjectActive, updateProject } from "@/modules/tasks/actions";
import {
  HEALTH_LABELS,
  PROJECT_LIMITS,
  PROJECT_NAME_MAX,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  shortDate,
} from "@/modules/tasks/domain/projects";
import { setProjectHealth, updateProjectFields } from "@/modules/tasks/project-actions";
import type { ProjectColor, ProjectHealth, ProjectStatus } from "@/types/database";

import { ExportDialog } from "./export-for-claude";
import { HealthDot, ProgressBar } from "./health-dot";

export interface HeaderProps {
  project: {
    id: string;
    name: string;
    icon: string | null;
    color: ProjectColor;
    status: ProjectStatus;
    objective: string | null;
    started_on: string | null;
    target_on: string | null;
    is_active: boolean;
    aliases: string[];
    health: ProjectHealth | null;
  };
  health: { level: ProjectHealth | null; why: string; manual: boolean; review: boolean };
  progress: { done: number; total: number; label: string };
  people: Parameters<typeof PeopleStack>[0]["people"];
  today: string;
  /** Cuántas tareas tiene, para decir qué pasa con ellas al borrarlo. */
  taskCount?: number;
}

/**
 * La cabecera de un proyecto.
 *
 * Lo que se cambia más -- el estado y el semáforo -- se cambia aquí mismo con
 * un toque, sin abrir un formulario. Lo demás está en «⋯ → Editar».
 */
export function ProjectHeader({ project, health, progress, people, today, taskCount = 0 }: HeaderProps) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const cambiarEstado = (status: ProjectStatus) =>
    start(async () => {
      const r = await updateProjectFields(project.id, { status });
      if (r.error) toast.error(r.error);
      else toast.success(`Ahora está «${PROJECT_STATUS_LABELS[status]}».`);
    });

  const fijarSemaforo = (h: ProjectHealth | null) =>
    start(async () => {
      const r = await setProjectHealth(project.id, h);
      if (r.error) toast.error(r.error);
      else toast.success(h === null ? "El semáforo vuelve a calcularse solo." : "Semáforo fijado 14 días.");
    });

  const archivar = () =>
    start(async () => {
      await setProjectActive(project.id, !project.is_active);
      toast.success(project.is_active ? "Proyecto archivado." : "Proyecto reactivado.");
    });

  // Borrar con red debajo, como todo: a la papelera, con «Deshacer», que lo
  // devuelve con su gente, su hoja de ruta y sus tareas en su sitio (cada una a
  // su hito y a su frente). Sin «¿seguro?»: deshacer protege más que un
  // diálogo que se acepta sin leer.
  const borrar = () =>
    start(async () => {
      const ruta = `/tareas/proyectos/${project.id}`;
      const { trashId } = await trashAction("PROYECTO", project.id, "/tareas/proyectos");
      if (!trashId) {
        toast.error("No se pudo borrar.");
        return;
      }
      toast.success(`«${project.name}» en la papelera.`, {
        description:
          taskCount > 0
            ? `${taskCount === 1 ? "Su tarea se queda" : `Sus ${taskCount} tareas se quedan`} sin proyecto hasta que lo deshagas. Se guarda 30 días.`
            : "Se guarda 30 días.",
        duration: 12000,
        action: {
          label: "Deshacer",
          onClick: () => {
            void (async () => {
              const ok = await restoreAction(trashId, ruta);
              if (ok) {
                toast.success("Recuperado, con sus tareas.");
                router.push(ruta as Route);
              } else {
                toast.error("No se pudo recuperar. Está en la papelera.");
              }
            })();
          },
        },
      });
      router.push("/tareas/proyectos");
    });

  const fechas = [
    project.started_on ? `desde ${shortDate(project.started_on, today)}` : null,
    project.target_on ? `meta ${shortDate(project.target_on, today)}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/tareas/proyectos"
          className="flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Proyectos
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-11" aria-label="Más acciones">
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil className="size-4" aria-hidden /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setExporting(true)}>
              <FileDown className="size-4" aria-hidden /> Exportar para Claude
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/tareas/proyectos/importar">
                <FileUp className="size-4" aria-hidden /> Importar desde Claude
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/tareas/recordatorios?nuevo=1&proyecto=${project.id}` as Route}>
                <BellPlus className="size-4" aria-hidden /> Recordatorio
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={archivar}>
              {project.is_active ? <Archive className="size-4" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
              {project.is_active ? "Archivar" : "Reactivar"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={borrar} className="text-negative focus:text-negative">
              <Trash2 className="size-4" aria-hidden /> Borrar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="relative overflow-hidden rounded-[14px] border border-border bg-card p-4 pl-5" style={colorVars(project.color)}>
        <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ backgroundColor: "var(--tag-color)" }} />

        <h1 className="text-xl font-semibold leading-tight text-foreground">
          {project.icon ? <span className="mr-2" aria-hidden>{project.icon}</span> : null}
          {project.name}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={pending}
                className="flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-sm font-medium transition-colors hover:border-foreground/30"
                aria-label={`Estado: ${PROJECT_STATUS_LABELS[project.status]}. Cambiar`}
              >
                {PROJECT_STATUS_LABELS[project.status]} <span aria-hidden>▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Estado</DropdownMenuLabel>
              {PROJECT_STATUSES.map((s) => (
                <DropdownMenuItem key={s} onSelect={() => cambiarEstado(s)} aria-current={s === project.status}>
                  {PROJECT_STATUS_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={pending}
                className="flex min-h-11 min-w-0 items-center gap-1 rounded-full px-1 text-left"
                aria-label={`Semáforo: ${health.why}. Cambiar`}
              >
                <HealthDot level={health.level} why={health.why} manual={health.manual} wrap />
                <span aria-hidden className="text-sm text-muted-foreground">▾</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-w-[min(20rem,calc(100vw-2rem))]">
              {/* El porqué entero, que en la cabecera puede no caber. */}
              <DropdownMenuLabel className="font-normal">
                <HealthDot level={health.level} why={health.why} manual={health.manual} wrap />
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Fijar el semáforo 14 días</DropdownMenuLabel>
              {(["VERDE", "AMARILLO", "ROJO"] as const).map((h) => (
                <DropdownMenuItem key={h} onSelect={() => fijarSemaforo(h)}>
                  {HEALTH_LABELS[h]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => fijarSemaforo(null)}>Que lo calcule la app</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {health.review ? (
          <p className="mt-1 text-xs text-warning">El semáforo que fijaste ya pasó sus 14 días: revísalo.</p>
        ) : null}

        {project.objective ? <p className="mt-2 text-sm text-foreground/90">{project.objective}</p> : null}
        {fechas.length > 0 ? <p className="mt-1 text-xs text-muted-foreground">{fechas.join(" · ")}</p> : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <PeopleStack people={people} max={5} />
          <ProgressBar done={progress.done} total={progress.total} label={progress.label} />
        </div>
      </div>

      {editing ? <EditProject project={project} onDone={() => setEditing(false)} /> : null}
      <ExportDialog projectId={project.id} open={exporting} onOpenChange={setExporting} />
    </div>
  );
}

function EditProject({ project, onDone }: { project: HeaderProps["project"]; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState(project.name);
  const [objective, setObjective] = useState(project.objective ?? "");
  const [startedOn, setStartedOn] = useState(project.started_on ?? "");
  const [targetOn, setTargetOn] = useState(project.target_on ?? "");
  const [icon, setIcon] = useState(project.icon ?? "");
  const [aliases, setAliases] = useState(project.aliases.join(", "));
  const [color, setColor] = useState<ProjectColor>(project.color);

  const guardar = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await updateProjectFields(project.id, {
        name,
        objective,
        started_on: startedOn,
        target_on: targetOn,
        icon,
        aliases: aliases
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      if (color !== project.color) await updateProject(project.id, { color });
      toast.success("Guardado.");
      onDone();
    });
  };

  return (
    <form onSubmit={guardar} className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4">
      <Campo label="Nombre">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={PROJECT_NAME_MAX} required />
      </Campo>
      <Campo label="Objetivo">
        <Input value={objective} onChange={(e) => setObjective(e.target.value)} maxLength={PROJECT_LIMITS.objective} />
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo label="Desde">
          <Input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
        </Campo>
        <Campo label="Meta">
          <Input type="date" value={targetOn} onChange={(e) => setTargetOn(e.target.value)} />
        </Campo>
      </div>
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <Campo label="Icono">
          <Input value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={8} />
        </Campo>
        <Campo label="Otros nombres (separados por comas)">
          <Input value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="p. ej. finca, el campo" />
        </Campo>
      </div>
      <Campo label="Color">
        <select
          value={color}
          onChange={(e) => setColor(e.target.value as ProjectColor)}
          className="h-11 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
        >
          {PROJECT_COLORS.map((c) => (
            <option key={c} value={c}>
              {COLOR_LABELS[c]}
            </option>
          ))}
        </select>
      </Campo>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="min-h-11">
          Guardar
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} className="min-h-11">
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function Campo({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1 text-sm text-foreground", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
