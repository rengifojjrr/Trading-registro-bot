"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { addPlaybookItem, deletePlaybookItem } from "@/app/(dashboard)/trades/[tradeId]/behaviour-actions";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PlaybookItem {
  id: string;
  label: string;
}

/**
 * The checklist you tick BEFORE entering, per strategy.
 *
 * This is the one part of the journal that can change a trade instead of
 * just describing it: a rule you have to look at before clicking buy is a
 * different thing from a note you write after. Kept as discrete items
 * rather than prose so "which rule did I skip on my losing trades" is
 * answerable.
 */
export function PlaybookEditor({
  strategyId,
  items,
}: {
  strategyId: string;
  items: PlaybookItem[];
}) {
  const [label, setLabel] = useState("");
  const [isPending, startTransition] = useTransition();

  function add() {
    const trimmed = label.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await addPlaybookItem({ strategyId, label: trimmed });
      if (result.error) toast.error(result.error);
      else setLabel("");
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const result = await deletePlaybookItem(id);
      if (result.error) toast.error(result.error);
    });
  }

  return (
    <CollapsibleSection
      title="Checklist previa a la entrada"
      subtitle="Las condiciones que deben cumplirse antes de operar esta estrategia"
      badge={items.length > 0 ? String(items.length) : undefined}
    >
      <div className="flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin puntos todavía. Escribe las condiciones que tu plan exige: al abrir una operación con esta
            estrategia podrás marcarlas una a una.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span>{item.label}</span>
                <button
                  type="button"
                  aria-label={`Eliminar "${item.label}"`}
                  disabled={isPending}
                  onClick={() => remove(item.id)}
                  className="text-muted-foreground transition-colors hover:text-negative disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={200}
            placeholder="p. ej. El precio cerró por encima de la media de 20"
          />
          <Button type="submit" variant="outline" size="sm" disabled={isPending || !label.trim()}>
            <Plus className="size-4" aria-hidden />
            Añadir
          </Button>
        </form>
      </div>
    </CollapsibleSection>
  );
}
