"use client";

import { Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteTrade } from "@/app/(dashboard)/trades/[tradeId]/actions";
import { Button } from "@/components/ui/button";

/**
 * Removes a trade the user entered themselves.
 *
 * Says what goes before asking, because the row in the table is the least
 * of it: an imported trade with no prices still carries the journal entry
 * written about it, and that reflection is usually worth more than the
 * numbers. Confirming blind is how people lose the part they cared about.
 *
 * Not offered for Coinbase-synced trades -- those are recomputed from the
 * raw fills, so deleting one just means it reappears on the next sync.
 */
export function DeleteTrade({
  tradeId,
  source,
  hasJournal,
}: {
  tradeId: string;
  source: string;
  hasJournal: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (source === "COINBASE_SYNC") return null;

  function run() {
    startTransition(async () => {
      const result = await deleteTrade(tradeId);
      if (result.error) {
        toast.error(result.error);
        setConfirming(false);
        return;
      }
      toast.success("Operación borrada.");
      router.push("/trades");
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setConfirming(true)}
        className="text-muted-foreground hover:text-negative"
      >
        <Trash2 className="size-4" aria-hidden />
        Borrar operación
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-negative/50 bg-negative/5 px-3 py-2 text-sm">
      <p className="font-medium text-negative">¿Borrar esta operación?</p>
      <p className="text-xs text-muted-foreground">
        Se borra la operación
        {hasJournal ? ", su entrada de diario (notas, estado emocional, etiquetas de error)" : ""}, sus
        capturas, comentarios y dibujos del gráfico. No se puede deshacer.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="destructive" onClick={run} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Sí, borrar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
