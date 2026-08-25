"use client";

import { GitCompare, Layers, PencilLine } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { findBurstFor } from "@/app/(dashboard)/trades/bulk-journal-actions";
import { BulkJournalDialog } from "@/components/trades/bulk-journal-dialog";
import { Button } from "@/components/ui/button";

/**
 * Qué se puede hacer con las operaciones marcadas.
 *
 * Antes solo existía comparar, y por eso la selección tenía tope de dos. La
 * otra cosa que se hace con varias a la vez es apuntarlas juntas: doce
 * entradas en veinte minutos son un episodio, no doce decisiones, y escribir
 * «FOMO» doce veces es la razón por la que el episodio más caro se queda sin
 * apuntar.
 *
 * «Seleccionar la ráfaga» está aquí y no dentro del diálogo porque el trabajo
 * de encontrar las hermanas es lo primero que hace falta, antes de decidir qué
 * se les pone.
 */
export function SelectionBar({
  selected,
  strategies,
  onSelectionChange,
  onClear,
}: {
  selected: string[];
  strategies: { id: string; name: string }[];
  onSelectionChange: (ids: string[]) => void;
  onClear: () => void;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function selectBurst() {
    startTransition(async () => {
      const burst = await findBurstFor(selected[0]);

      if (!burst || burst.tradeIds.length <= 1) {
        toast.info("No hay más operaciones pegadas a esa en el tiempo.", {
          description: "Una ráfaga son varias entradas seguidas del mismo producto.",
        });
        return;
      }

      onSelectionChange(burst.tradeIds);
      toast.success(`${burst.tradeIds.length} operaciones seleccionadas.`, {
        description:
          burst.spanMinutes < 1
            ? "Todas casi a la vez."
            : `Todas dentro de ${burst.spanMinutes} minutos.`,
      });
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {selected.length === 1
            ? "1 operación seleccionada."
            : `${selected.length} operaciones seleccionadas.`}
        </span>

        {selected.length === 1 ? (
          <Button size="sm" variant="outline" onClick={selectBurst} disabled={isPending}>
            <Layers className="size-4" aria-hidden />
            {isPending ? "Buscando…" : "Seleccionar la ráfaga"}
          </Button>
        ) : null}

        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <PencilLine className="size-4" aria-hidden />
          Apuntar {selected.length === 1 ? "esta" : "las"} {selected.length > 1 ? selected.length : ""}
        </Button>

        {/* Comparar sigue siendo cosa de dos: con tres no hay dos columnas
            que enseñar, y elegir cuáles por su cuenta sería inventarse la
            pregunta que el usuario no hizo. */}
        {selected.length === 2 ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/trades/compare?a=${selected[0]}&b=${selected[1]}`}>
              <GitCompare className="size-4" aria-hidden />
              Comparar
            </Link>
          </Button>
        ) : null}

        <Button size="sm" variant="ghost" onClick={onClear}>
          Quitar selección
        </Button>
      </div>

      {dialogOpen ? (
        <BulkJournalDialog
          tradeIds={selected}
          strategies={strategies}
          onClose={() => setDialogOpen(false)}
          onApplied={() => {
            setDialogOpen(false);
            onClear();
          }}
        />
      ) : null}
    </>
  );
}
