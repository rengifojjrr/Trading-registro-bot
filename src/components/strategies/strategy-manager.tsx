"use client";

import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  deleteStrategy,
  setStrategyActive,
  updateStrategy,
  type StrategyFormState,
} from "@/app/(dashboard)/strategies/actions";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { PlaybookEditor } from "@/components/strategies/playbook-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface PlaybookItemRow {
  id: string;
  strategy_id: string;
  label: string;
}

export interface ManagedStrategy {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

const initialState: StrategyFormState = { error: null, success: false };

/**
 * Edit / archive / delete for strategies, which previously could only be
 * created. Archiving is the primary action and deletion is refused while
 * any trade still references the strategy -- see the server action for why.
 */
export function StrategyManager({
  strategies,
  playbookItems = [],
}: {
  strategies: ManagedStrategy[];
  /** Every playbook item across all strategies; grouped per row below. */
  playbookItems?: PlaybookItemRow[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (strategies.length === 0) return null;

  function handleArchiveToggle(strategy: ManagedStrategy) {
    startTransition(async () => {
      await setStrategyActive(strategy.id, !strategy.is_active);
      toast.success(strategy.is_active ? "Estrategia archivada." : "Estrategia reactivada.");
    });
  }

  function handleDelete(strategy: ManagedStrategy) {
    startTransition(async () => {
      const result = await deleteStrategy(strategy.id);
      if (result.error) toast.error(result.error);
      else toast.success("Estrategia borrada.");
    });
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <CollapsibleSection title="Gestionar estrategias" subtitle={`${strategies.length} en total`}>
          <ul className="flex flex-col divide-y divide-border">
            {strategies.map((strategy) => (
              <li key={strategy.id} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{strategy.name}</span>
                    {!strategy.is_active ? <Badge variant="outline">Archivada</Badge> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar ${strategy.name}`}
                      onClick={() => setEditingId(editingId === strategy.id ? null : strategy.id)}
                    >
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      aria-label={strategy.is_active ? `Archivar ${strategy.name}` : `Reactivar ${strategy.name}`}
                      onClick={() => handleArchiveToggle(strategy)}
                    >
                      {strategy.is_active ? (
                        <Archive className="size-4" aria-hidden />
                      ) : (
                        <ArchiveRestore className="size-4" aria-hidden />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      aria-label={`Borrar ${strategy.name}`}
                      onClick={() => handleDelete(strategy)}
                    >
                      <Trash2 className="size-4 text-negative" aria-hidden />
                    </Button>
                  </div>
                </div>

                {editingId === strategy.id ? (
                  <EditStrategyForm strategy={strategy} onDone={() => setEditingId(null)} />
                ) : strategy.description ? (
                  <p className="text-xs text-muted-foreground">{strategy.description}</p>
                ) : null}

                <PlaybookEditor
                  strategyId={strategy.id}
                  items={playbookItems
                    .filter((i) => i.strategy_id === strategy.id)
                    .map((i) => ({ id: i.id, label: i.label }))}
                />
              </li>
            ))}
          </ul>
        </CollapsibleSection>
      </CardContent>
    </Card>
  );
}

function EditStrategyForm({ strategy, onDone }: { strategy: ManagedStrategy; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(updateStrategy, initialState);

  useEffect(() => {
    if (state.success) toast.success("Estrategia actualizada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-border p-3">
      <input type="hidden" name="id" value={strategy.id} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`name-${strategy.id}`}>Nombre</Label>
        <Input
          id={`name-${strategy.id}`}
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={strategy.name}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`description-${strategy.id}`}>Reglas</Label>
        <Textarea
          id={`description-${strategy.id}`}
          name="description"
          rows={3}
          maxLength={2000}
          autoComplete="off"
          defaultValue={strategy.description ?? ""}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Cerrar
        </Button>
      </div>
    </form>
  );
}
