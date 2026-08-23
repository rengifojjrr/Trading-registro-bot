"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";

import { repairHistory } from "@/app/(dashboard)/settings/backfill-actions";

/**
 * La cura, para ponerla donde se ve el problema.
 *
 * Existía desde el principio -- «Rehacer el histórico» en Configuración --
 * pero repartida en dos pasos y bajo un título que parece de programadores.
 * Quien está mirando una cifra que no cuadra no tiene por qué saber cómo se
 * llama el remedio ni dónde vive: el aviso que detecta el problema es el que
 * tiene que ofrecerlo.
 *
 * En su propio archivo porque ya lo usan dos avisos distintos -- el de la
 * ficha de operación y el de la barra de salud del panel -- y tenerlo copiado
 * en los dos garantiza que un día digan cosas distintas.
 */
export function RepairHistoryButton() {
  const [pendiente, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ error: string | null; message: string | null } | null>(
    null,
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              setResultado(await repairHistory());
            })
          }
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {pendiente ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {pendiente ? "Releyendo el histórico…" : "Volver a leer el histórico y recalcular"}
        </button>
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {resultado?.error
          ? resultado.error
          : (resultado?.message ??
            "Le pide a Coinbase el histórico completo en vez de sólo lo nuevo. No borra nada.")}
      </p>
    </div>
  );
}
