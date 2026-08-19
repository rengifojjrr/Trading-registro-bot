"use client";

import { Loader2, Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { ChipGroup } from "@/core/ui/chip-group";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createTask, type TaskFormState } from "@/modules/tasks/actions";
import { CATEGORIES, PRIORITY_LABELS } from "@/modules/tasks/domain/tasks";
import type { ProjectRow } from "@/modules/tasks/queries";

const initial: TaskFormState = { error: null, success: false };

/**
 * Añadir una tarea.
 *
 * El título es lo único obligatorio y va primero y solo: apuntar algo antes
 * de que se te olvide no puede exigir elegir proyecto, prioridad y fecha.
 */
export function NewTask({ projects }: { projects: ProjectRow[] }) {
  const [state, formAction, pending] = useActionState(createTask, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      toast.success("Tarea añadida.");
    }
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input name="title" placeholder="¿Qué hay que hacer?" maxLength={300} required className="min-w-52 flex-1" />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" aria-hidden />}
          Añadir
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Select name="project_id" defaultValue="">
          <SelectTrigger aria-label="Proyecto">
            <SelectValue placeholder="Sin proyecto" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select name="priority" defaultValue="MEDIA">
          <SelectTrigger aria-label="Prioridad">
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

        <Input name="due_date" type="date" aria-label="Fecha límite" />
      </div>

      <ChipGroup name="categories" options={CATEGORIES} />
    </form>
  );
}
