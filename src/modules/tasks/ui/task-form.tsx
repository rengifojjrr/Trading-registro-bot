"use client";

import { Loader2, Save } from "lucide-react";
import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { ChipGroup } from "@/core/ui/chip-group";
import { IconPicker } from "@/core/ui/icon-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { updateTask, type TaskFormState } from "@/modules/tasks/actions";
import { CATEGORIES, PRIORITY_LABELS, STATUS_LABELS } from "@/modules/tasks/domain/tasks";
import type { ProjectRow, TaskRow } from "@/modules/tasks/queries";

const initial: TaskFormState = { error: null, success: false };

/**
 * Editar una tarea entera.
 *
 * Antes no había ninguna forma: la lista sólo giraba el estado y borraba, y un
 * error de escritura obligaba a borrar y volver a empezar.
 *
 * La descripción es el cuerpo de la página de Notion -- lo que la tarea
 * explica -- y va abajo y grande, porque es lo que se viene a leer al abrir
 * la ficha. Las notas se quedan como una línea aparte: en tu Notion son dos
 * cosas distintas y juntarlas perdería cuál era cuál.
 */
export function TaskForm({ task, projects }: { task: TaskRow; projects: ProjectRow[] }) {
  const [state, formAction, pending] = useActionState(updateTask, initial);

  useEffect(() => {
    if (state.success) toast.success("Tarea guardada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={task.id} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          name="title"
          defaultValue={task.title}
          maxLength={300}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="status">Estado</Label>
          <Select name="status" defaultValue={task.status}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="project_id">Proyecto</Label>
          <Select name="project_id" defaultValue={task.project_id ?? ""}>
            <SelectTrigger id="project_id">
              <SelectValue placeholder="Sin proyecto" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.icon ? `${project.icon} ` : ""}
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="priority">Prioridad</Label>
          <Select name="priority" defaultValue={task.priority}>
            <SelectTrigger id="priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="due_date">Empieza</Label>
          <Input id="due_date" name="due_date" type="date" defaultValue={task.due_date ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="due_end">Acaba</Label>
          <Input id="due_end" name="due_end" type="date" defaultValue={task.due_end ?? ""} />
          <p className="text-xs text-muted-foreground">Sólo si dura más de un día.</p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="due_time">Hora</Label>
          <Input
            id="due_time"
            name="due_time"
            type="time"
            defaultValue={task.due_time ? task.due_time.slice(0, 5) : ""}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Categorías</span>
        <ChipGroup
          name="categories"
          options={CATEGORIES}
          defaultValue={task.categories}
          accent="--mod-tasks"
        />
      </div>

      <IconPicker name="icon" defaultValue={task.icon} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Nota</Label>
        <Input id="notes" name="notes" defaultValue={task.notes ?? ""} maxLength={4000} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={task.description ?? ""}
          rows={8}
          placeholder="Lo que hay que hacer, con detalle."
          maxLength={20000}
        />
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          Guardar
        </Button>
      </div>
    </form>
  );
}
