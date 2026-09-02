"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Traer lo nuevo de Coinbase, desde donde se ve que falta.
 *
 * Es la sincronización normal -- lo que llegó desde la última marca de agua --
 * y no la relectura completa del histórico: para un cierre que Coinbase
 * acaba de ejecutar basta con esto, y tarda dos segundos en vez de un minuto.
 * Existía en Configuración; aquí está porque el aviso que detecta el
 * descuadre es el que tiene que ofrecer el remedio.
 */
export function SyncNowButton() {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [mensaje, setMensaje] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <div>
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            startTransition(async () => {
              try {
                const res = await fetch("/api/coinbase/sync-now");
                const data = (await res.json()) as
                  | { ok: true; summary: { fillsNew: number; tradesUpdated: number } }
                  | { ok: false; message: string };
                if (data.ok) {
                  setMensaje(
                    data.summary.fillsNew > 0
                      ? `${data.summary.fillsNew} ejecución${data.summary.fillsNew === 1 ? "" : "es"} nueva${data.summary.fillsNew === 1 ? "" : "s"}; la operación se ha vuelto a calcular.`
                      : "Coinbase no devolvió nada nuevo. Si los contratos siguen sin cuadrar, falta un fill en el histórico.",
                  );
                  router.refresh();
                } else {
                  setMensaje(data.message);
                }
              } catch {
                setMensaje("No se pudo contactar con el servidor.");
              }
            })
          }
          className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {pendiente ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {pendiente ? "Sincronizando…" : "Sincronizar ahora"}
        </button>
      </div>
      {mensaje ? (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
