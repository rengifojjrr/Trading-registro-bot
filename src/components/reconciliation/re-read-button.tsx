"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { reRunReconciliation } from "@/app/(dashboard)/reconciliation/actions";
import { Button } from "@/components/ui/button";

/**
 * Volver a leer los fills de Coinbase, ignorando el marcador.
 *
 * La sincronización normal sólo mira hacia adelante desde su marca de agua,
 * así que un fill que llega tarde -- con marca de tiempo anterior a esa
 * ventana -- no se recupera nunca. Y sin él la posición reconstruida queda
 * desplazada: una operación cerrada de verdad se queda abierta aquí, sin
 * error, sin aviso y sin contar en las cifras.
 *
 * La ventana se elige porque el fill que falta puede ser de hoy o de hace un
 * mes, y releer noventa días cada vez es pedirle a Coinbase mil peticiones
 * para no encontrar nada.
 */

const WINDOWS = [
  { days: 3, label: "3 días" },
  { days: 7, label: "1 semana" },
  { days: 30, label: "1 mes" },
  { days: 90, label: "3 meses" },
];

export function ReReadButton() {
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(7);

  function run() {
    startTransition(async () => {
      const result = await reRunReconciliation(days);

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(
        result.found === 0
          ? "Todo cuadra: Coinbase no tiene nada que esta aplicación no tenga."
          : `${result.found} ${result.found === 1 ? "diferencia encontrada" : "diferencias encontradas"}.`,
        {
          description:
            result.found === 0
              ? undefined
              : "Están listadas abajo. No se ha corregido nada por su cuenta.",
        },
      );
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={days}
        onChange={(event) => setDays(Number(event.target.value))}
        disabled={pending}
        aria-label="Cuánto hacia atrás releer"
        className="h-9 rounded-md border border-border bg-transparent px-2 text-sm"
      >
        {WINDOWS.map((window) => (
          <option key={window.days} value={window.days}>
            {window.label}
          </option>
        ))}
      </select>

      <Button type="button" onClick={run} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-4" aria-hidden />
        )}
        Volver a leer desde Coinbase
      </Button>
    </div>
  );
}
