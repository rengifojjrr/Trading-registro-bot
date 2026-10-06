"use client";

import { FileDown, Loader2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PROJECT_LIMITS, PROJECT_NAME_MAX } from "@/modules/tasks/domain/projects";
import { createProjectV2 } from "@/modules/tasks/project-actions";

/**
 * «＋ Nuevo» e «Importar desde Claude».
 *
 * Nuevo pide lo mínimo -- el nombre y, si quieres, el objetivo -- y te lleva
 * dentro del proyecto, que es donde se rellena lo demás.
 */
export function NewProjectActions() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createProjectV2, { error: null, id: null });

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.id) {
      toast.success("Proyecto creado.");
      router.push(`/tareas/proyectos/${state.id}`);
    }
  }, [state, router]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="min-h-11">
          <Plus aria-hidden />
          Nuevo
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href="/tareas/proyectos/importar">
            <FileDown aria-hidden />
            Importar desde Claude
          </Link>
        </Button>
      </div>

      {open ? (
        <form action={formAction} className="flex flex-col gap-2 rounded-[14px] border border-border bg-card p-4">
          <Input
            name="name"
            required
            maxLength={PROJECT_NAME_MAX}
            placeholder="Nombre del proyecto"
            aria-label="Nombre del proyecto"
            autoComplete="off"
            autoFocus
          />
          <Input
            name="objective"
            maxLength={PROJECT_LIMITS.objective}
            placeholder="Objetivo, en una frase (opcional)"
            aria-label="Objetivo"
            autoComplete="off"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={pending} className="min-h-11">
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Crear
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="min-h-11">
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
