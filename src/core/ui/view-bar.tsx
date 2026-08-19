"use client";

import { Bookmark, BookmarkPlus, Loader2, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Route } from "next";

import { deleteViewAction, saveViewAction } from "@/core/actions";
import type { ModuleView } from "@/core/module-views";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Las vistas guardadas de un módulo.
 *
 * En «To-Do» tienes siete y en el calendario de contenido cinco; aquí había
 * pestañas fijas. Una vista no es un capricho: «Esta semana» y «Próximas
 * tareas» son dos preguntas distintas sobre la misma tabla, y reconstruir los
 * filtros cada vez es lo que hace que uno deje de preguntarlas.
 *
 * Sólo se ofrece guardar cuando hay algo que guardar. Una vista sin filtros es
 * la propia página, y llenar la barra de atajos a donde ya estás es ruido.
 */
export function ViewBar({
  moduleId,
  views,
  colorToken,
}: {
  moduleId: string;
  views: ModuleView[];
  colorToken: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();

  const [pending, startTransition] = useTransition();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const alreadySaved = views.some((view) => view.path === pathname && view.query === query);

  function save() {
    const trimmed = name.trim();
    if (trimmed === "") return;

    startTransition(async () => {
      const result = await saveViewAction(moduleId, trimmed, pathname, query);
      if (result.ok) {
        setNaming(false);
        setName("");
        toast.success("Vista guardada.");
      } else {
        toast.error(result.error ?? "No se pudo guardar.");
      }
    });
  }

  if (views.length === 0 && query === "") return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {views.map((view) => {
        const href = (view.query ? `${view.path}?${view.query}` : view.path) as Route;
        const active = view.path === pathname && view.query === query;

        return (
          <span
            key={view.id}
            className={cn(
              "group flex items-center gap-1 rounded-full border px-1 text-sm transition-colors",
              active ? "border-transparent" : "border-border hover:bg-muted",
            )}
            style={active ? { backgroundColor: `var(${colorToken})`, color: "#fff" } : undefined}
          >
            <Link href={href} className="flex items-center gap-1.5 py-1 pl-2">
              <Bookmark className="size-3.5" aria-hidden />
              {view.name}
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await deleteViewAction(view.id, pathname);
                })
              }
              aria-label={`Borrar la vista ${view.name}`}
              className="rounded-full p-1 opacity-0 transition-opacity hover:bg-black/10 focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        );
      })}

      {query !== "" && !alreadySaved ? (
        naming ? (
          <span className="flex items-center gap-1.5">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") save();
                if (event.key === "Escape") setNaming(false);
              }}
              placeholder="Nombre de la vista"
              aria-label="Nombre de la vista"
              className="h-8 w-44"
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
            <BookmarkPlus className="size-3.5" aria-hidden />
            Guardar esta vista
          </button>
        )
      ) : null}
    </div>
  );
}
