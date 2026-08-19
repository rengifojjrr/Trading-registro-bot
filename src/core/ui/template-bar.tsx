"use client";

import { FilePlus2, Loader2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteTemplateAction, saveTemplateAction } from "@/core/actions";
import type { Template } from "@/core/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Las plantillas de un módulo.
 *
 * Crear algo empezaba siempre en blanco, y ese blanco es justo lo que hace que
 * no se rellene. En Notion tienes «Nueva tarea» y tres plantillas distintas de
 * publicación, y lo que aportan no son los campos: es el esqueleto del cuerpo
 * -- HOOK, SCRIPT/NOTES, TAGS -- ya escrito, para que escribir consista en
 * rellenar huecos y no en recordar cuáles había.
 *
 * Se guardan desde el propio formulario, con lo que haya escrito en ese
 * momento. Una pantalla aparte de «gestionar plantillas» convierte hacer una
 * en un proyecto, y entonces no se hace ninguna.
 */
export function TemplateBar({
  moduleId,
  templates,
  onApply,
  currentValues,
  colorToken,
}: {
  moduleId: string;
  templates: Template[];
  /** Vuelca la plantilla en el formulario. */
  onApply: (template: Template) => void;
  /** Lo que hay escrito ahora, para poder guardarlo como plantilla. */
  currentValues: () => { payload: Record<string, unknown>; body: string | null };
  colorToken: string;
}) {
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  function save() {
    const trimmed = name.trim();
    if (trimmed === "") return;

    const { payload, body } = currentValues();

    startTransition(async () => {
      const result = await saveTemplateAction(
        moduleId,
        trimmed,
        payload,
        body,
        templates.length === 0,
        pathname,
      );
      if (result.ok) {
        setNaming(false);
        setName("");
        toast.success("Plantilla guardada.");
      } else {
        toast.error(result.error ?? "No se pudo guardar.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {templates.map((template) => (
        <span
          key={template.id}
          className={cn(
            "group flex items-center gap-1 rounded-full border border-border px-1 text-sm transition-colors hover:bg-muted",
          )}
        >
          <button
            type="button"
            onClick={() => {
              onApply(template);
              toast.success(`Plantilla «${template.name}» aplicada.`);
            }}
            className="flex items-center gap-1.5 py-1 pl-2"
            style={{ color: `var(${colorToken})` }}
          >
            <FilePlus2 className="size-3.5" aria-hidden />
            {template.name}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await deleteTemplateAction(template.id, pathname);
              })
            }
            aria-label={`Borrar la plantilla ${template.name}`}
            className="rounded-full p-1 opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}

      {naming ? (
        <span className="flex items-center gap-1.5">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                save();
              }
              if (event.key === "Escape") setNaming(false);
            }}
            placeholder="Nombre de la plantilla"
            aria-label="Nombre de la plantilla"
            className="h-8 w-48"
            autoFocus
          />
          <Button type="button" size="sm" onClick={save} disabled={pending || name.trim() === ""}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Guardar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setNaming(false)}>
            Cancelar
          </Button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <FilePlus2 className="size-3.5" aria-hidden />
          Guardar como plantilla
        </button>
      )}
    </div>
  );
}
