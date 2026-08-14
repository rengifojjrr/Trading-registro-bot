"use client";

import { RotateCcw, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  excludeFill,
  recalculateProduct,
  undoOverride,
} from "@/app/(dashboard)/trades/[tradeId]/override-actions";
import { InfoHint } from "@/components/shared/info-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ActiveOverride {
  id: string;
  anchorFillId: string;
  note: string | null;
}

/**
 * Manual corrections to how fills were grouped, alongside the fill list
 * they apply to.
 *
 * Corrections are stored as overrides that reconstruction re-applies every
 * run, so they survive future syncs -- they are not edits to the computed
 * numbers. Only "exclude this fill" is offered; see override-actions.ts
 * for why splitting a position isn't.
 */
export function FillCorrections({
  tradeId,
  fillIds,
  overrides,
}: {
  tradeId: string;
  fillIds: string[];
  overrides: ActiveOverride[];
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedFillId, setSelectedFillId] = useState("");
  const [note, setNote] = useState("");

  function run(action: () => Promise<{ error: string | null }>, successMessage: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else toast.success(successMessage);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          Corregir agrupación
          <InfoHint label="Corregir agrupación">
            Si un fill no debería contar (un ajuste de Coinbase, un movimiento que no es tuyo), puedes excluirlo
            y las operaciones se recalculan sin él. La corrección se guarda aparte y se vuelve a aplicar en cada
            sincronización, así que no se pierde. Tus datos crudos nunca se modifican.
          </InfoHint>
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => recalculateProduct(tradeId), "Operaciones recalculadas.")}
        >
          <RotateCcw className="size-4" aria-hidden />
          Recalcular
        </Button>
      </div>

      {overrides.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {overrides.map((override) => (
            <li key={override.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-2">
                <Badge variant="warning">Fill excluido</Badge>
                <span className="font-mono text-muted-foreground">{override.anchorFillId.slice(0, 12)}…</span>
                {override.note ? <span className="text-muted-foreground">{override.note}</span> : null}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => undoOverride(tradeId, override.id), "Corrección deshecha.")}
              >
                <Undo2 className="size-4" aria-hidden />
                Deshacer
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Fill a excluir
          <select
            value={selectedFillId}
            onChange={(e) => setSelectedFillId(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Selecciona…</option>
            {fillIds.map((id) => (
              <option key={id} value={id}>
                {id.slice(0, 20)}…
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
          Motivo (opcional)
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            placeholder="p. ej. ajuste duplicado de Coinbase"
          />
        </label>

        <Button
          variant="outline"
          size="sm"
          disabled={isPending || !selectedFillId}
          onClick={() =>
            run(() => excludeFill(tradeId, selectedFillId, note), "Fill excluido y operaciones recalculadas.")
          }
        >
          Excluir
        </Button>
      </div>
    </div>
  );
}
