"use client";

import { Trash2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { deleteTrade } from "@/app/(dashboard)/trades/[tradeId]/actions";
import { restoreAction } from "@/core/actions";
import { Button } from "@/components/ui/button";

/**
 * Archiva una operación que la persona metió ella misma.
 *
 * Dice qué se va antes de preguntar, porque la fila de la tabla es lo de
 * menos: una operación importada sin precios sigue llevando encima el diario
 * que se escribió sobre ella, y eso suele valer más que los números.
 *
 * Ya no borra de verdad -- archiva, con «Deshacer» en el propio aviso y treinta
 * días en la Papelera. Aun así se sigue preguntando: la confirmación es lo que
 * evita el borrado accidental, y deshacer es lo que lo arregla cuando pasa.
 *
 * No se ofrece para operaciones sincronizadas de Coinbase: esas las recalcula
 * el motor desde los fills, así que borrarlas sólo significa que vuelven en la
 * siguiente sincronización.
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
      // Deshacer aquí y no sólo en Papelera: el caso normal es un dedo
      // torcido, y mandar a alguien a otra página a arreglar su propio
      // resbalón de hace dos segundos es la parte que hace que el borrado
      // siga dando miedo aunque tenga red debajo.
      toast.success("Operación borrada.", {
        description: hasJournal
          ? "El diario se ha archivado con ella y vuelve entero al recuperarla."
          : "Se guarda 30 días en la Papelera.",
        action: result.trashId
          ? {
              label: "Deshacer",
              onClick: () => {
                startTransition(async () => {
                  const ok = await restoreAction(result.trashId as string, "/trades");
                  if (ok) {
                    toast.success("Operación recuperada.");
                    router.push(`/trades/${tradeId}`);
                  } else {
                    toast.error("No se pudo recuperar. Sigue en la Papelera.");
                  }
                });
              },
            }
          : undefined,
      });
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
        Se va la operación
        {hasJournal ? ", su entrada de diario (notas, estado emocional, etiquetas de error)" : ""}, sus
        capturas, comentarios y dibujos del gráfico. Todo se archiva junto: puedes deshacerlo al
        momento o recuperarlo entero desde la Papelera durante 30 días.
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
