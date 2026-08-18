"use client";

import { History, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { requestFullBackfill } from "@/app/(dashboard)/settings/backfill-actions";
import { Button } from "@/components/ui/button";

/**
 * Forces the next sync to re-read the whole history instead of only what is
 * new.
 *
 * The remedy for a fill that was never ingested. A normal sync only asks
 * for fills newer than the last one it saw, so a fill missed once is missed
 * for good -- and a missing entry fill turns a clean close into a phantom
 * position made of the leftover contracts.
 *
 * Deliberately two steps rather than one button that also syncs: re-reading
 * the history is a much larger request than a routine poll, and it should
 * be something you chose, not something that happened.
 */
export function RebuildHistory() {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function run() {
    startTransition(async () => {
      const result = await requestFullBackfill();
      setConfirming(false);
      if (result.error) toast.error(result.error);
      else if (result.message) toast.success(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <History className="size-4 text-muted-foreground" aria-hidden />
        Rehacer el histórico
      </p>
      <p className="text-sm text-muted-foreground">
        Hace que la próxima sincronización vuelva a pedir el histórico completo a Coinbase en lugar de sólo
        lo nuevo. Úsalo si sospechas que falta alguna operación o algún fill. No borra nada: sólo se añade
        lo que no estuviera ya, así que repetirlo sobre un histórico completo no cambia nada.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <span className="text-sm">Después tendrás que pulsar «Sincronizar ahora».</span>
            <Button type="button" size="sm" onClick={run} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              Entendido, rehacer
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Rehacer el histórico
          </Button>
        )}
      </div>
    </div>
  );
}
