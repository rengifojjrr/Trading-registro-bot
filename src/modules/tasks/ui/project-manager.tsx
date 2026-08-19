"use client";

import { Archive, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { useActionState, useEffect, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COLOR_LABELS, PROJECT_COLORS, colorCss } from "@/core/notion-colors";
import {
  createProject,
  setProjectActive,
  updateProject,
  type TaskFormState,
} from "@/modules/tasks/actions";
import type { ProjectRow } from "@/modules/tasks/queries";
import type { ProjectColor } from "@/types/database";

const initialState: TaskFormState = { error: null, success: false };

/**
 * Crear y archivar proyectos.
 *
 * Archivar y no borrar, porque las tareas que colgaban de un proyecto siguen
 * colgando de él: borrarlo dejaría huérfano un trabajo que sí pasó. Un
 * proyecto archivado desaparece del desplegable de tareas nuevas y no de la
 * historia.
 */
export function ProjectManager({
  projects,
  counts,
}: {
  projects: ProjectRow[];
  /** Pendientes por proyecto, calculadas en el servidor. */
  counts: Record<string, { open: number; done: number }>;
}) {
  const [state, formAction, pending] = useActionState(createProject, initialState);

  useEffect(() => {
    if (state.success) toast.success("Proyecto creado.");
    if (state.error) toast.error(state.error);
  }, [state]);

  const active = projects.filter((p) => p.is_active);
  const archived = projects.filter((p) => !p.is_active);

  return (
    <div className="flex flex-col gap-5">
      <form action={formAction} className="flex flex-wrap gap-2">
        <Input
          name="name"
          placeholder="Nombre del proyecto"
          aria-label="Nombre del proyecto"
          className="max-w-xs flex-1"
          autoComplete="off"
          required
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Crear
        </Button>
      </form>

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tienes proyectos activos. Un proyecto es sólo un nombre bajo el que agrupar tareas.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {active.map((project) => (
            <ProjectRowItem key={project.id} project={project} counts={counts[project.id]} archived={false} />
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Archivados
          </h3>
          <ul className="flex flex-col divide-y divide-border">
            {archived.map((project) => (
              <ProjectRowItem key={project.id} project={project} counts={counts[project.id]} archived />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ProjectRowItem({
  project,
  counts,
  archived,
}: {
  project: ProjectRow;
  counts: { open: number; done: number } | undefined;
  archived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const open = counts?.open ?? 0;
  const done = counts?.done ?? 0;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
      {/*
        El color es lo que hace que reconozcas una tarjeta de un vistazo, como
        en Notion, donde Trading es rojo y Aquavita marrón. La columna existía
        desde el principio y nunca se escribía, así que la lista entera era
        gris y todas las tarjetas se parecían.
      */}
      <select
        value={project.color ?? "default"}
        disabled={pending}
        onChange={(event) =>
          startTransition(async () => {
            await updateProject(project.id, { color: event.target.value as ProjectColor });
          })
        }
        aria-label={`Color de ${project.name}`}
        className="size-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-border"
        style={{ backgroundColor: colorCss(project.color) }}
      >
        {PROJECT_COLORS.map((color) => (
          <option key={color} value={color}>
            {COLOR_LABELS[color]}
          </option>
        ))}
      </select>

      <Link
        href={`/tareas/proyectos/${project.id}` as Route}
        className={archived ? "text-sm text-muted-foreground hover:underline" : "text-sm font-medium hover:underline"}
      >
        {project.icon ? `${project.icon} ` : ""}
        {project.name}
      </Link>
      <span className="text-xs tabular-nums text-muted-foreground">
        {open} pendientes · {done} hechas
      </span>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-auto"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await setProjectActive(project.id, archived);
            toast.success(archived ? "Proyecto reactivado." : "Proyecto archivado.");
          })
        }
      >
        {pending ? (
          <Loader2 className="animate-spin" />
        ) : archived ? (
          <RotateCcw />
        ) : (
          <Archive />
        )}
        {archived ? "Reactivar" : "Archivar"}
      </Button>
    </li>
  );
}
