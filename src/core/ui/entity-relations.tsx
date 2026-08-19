"use client";

import { Link2, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { linkAction, searchEntitiesAction, unlinkAction } from "@/core/actions";
import { ENTITIES, entityHref } from "@/core/entities";
import type { RelatedRow } from "@/core/relations";
import { Input } from "@/components/ui/input";
import type { EntityKind } from "@/types/database";
import type { Route } from "next";

/**
 * Con qué está vinculada una ficha.
 *
 * En Notion tu base de tareas tiene una relación de verdad con otra base; aquí
 * los seis módulos eran islas, y eso obliga a repetir el contexto en cada
 * sitio: la tarea «grabar el vídeo del lunes» y la pieza «vídeo del lunes» no
 * se conocían.
 *
 * El buscador recorre los ocho tipos a la vez en lugar de pedir primero de qué
 * tipo es lo que buscas. Elegir el tipo antes convierte dos clics en cuatro, y
 * cuando uno busca «Miami» ya sabe qué es: lo que no sabe es en qué módulo lo
 * metió.
 */
export function EntityRelations({
  kind,
  entityId,
  path,
  related,
}: {
  kind: EntityKind;
  entityId: string;
  path: string;
  related: RelatedRow[];
}) {
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<RelatedRow[]>([]);
  const [searching, setSearching] = useState(false);

  const linkedKeys = new Set(related.map((r) => `${r.kind}:${r.id}`));

  function search(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    startTransition(async () => {
      const found = await searchEntitiesAction(value);
      // Ni consigo misma ni lo que ya está enlazado: enseñar una opción que no
      // hace nada al pulsarla es peor que no enseñarla.
      setResults(
        found.filter((r) => !(r.kind === kind && r.id === entityId) && !linkedKeys.has(`${r.kind}:${r.id}`)),
      );
      setSearching(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {related.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin vínculos.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {related.map((row) => (
            <li
              key={row.linkId}
              className="flex items-center gap-2.5 rounded-md border border-border px-3 py-2"
            >
              <span
                className="shrink-0 text-xs font-medium uppercase tracking-wide"
                style={{ color: `var(${ENTITIES[row.kind].colorToken})` }}
              >
                {ENTITIES[row.kind].label}
              </span>
              <Link
                href={entityHref(row.kind, row.id) as Route}
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {row.icon ? `${row.icon} ` : ""}
                {row.title}
              </Link>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await unlinkAction(row.linkId, path);
                  })
                }
                aria-label={`Quitar el vínculo con ${row.title}`}
                className="shrink-0 text-muted-foreground transition-colors hover:text-negative disabled:opacity-50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <div className="relative">
          <Link2
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={term}
            onChange={(event) => search(event.target.value)}
            placeholder="Buscar algo para vincular…"
            aria-label="Buscar para vincular"
            className="pl-8"
          />
          {searching ? (
            <Loader2
              className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
              aria-hidden
            />
          ) : null}
        </div>

        {term.trim().length >= 2 && results.length === 0 && !searching ? (
          <p className="text-xs text-muted-foreground">Nada con ese nombre.</p>
        ) : null}

        {results.length > 0 ? (
          <ul className="flex flex-col gap-1 rounded-md border border-border p-1">
            {results.map((row) => (
              <li key={`${row.kind}:${row.id}`}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await linkAction(
                        { kind, id: entityId },
                        { kind: row.kind, id: row.id },
                        path,
                      );
                      if (result.ok) {
                        setTerm("");
                        setResults([]);
                      } else {
                        toast.error(result.error ?? "No se pudo vincular.");
                      }
                    })
                  }
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
                >
                  <span
                    className="shrink-0 text-xs font-medium uppercase tracking-wide"
                    style={{ color: `var(${ENTITIES[row.kind].colorToken})` }}
                  >
                    {ENTITIES[row.kind].label}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {row.icon ? `${row.icon} ` : ""}
                    {row.title}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
