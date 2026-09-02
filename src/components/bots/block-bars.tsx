import type { BlockAllocation } from "@/lib/bots/blocks";
import { BLOCK_HINTS, BLOCK_LABELS } from "@/lib/bots/types";
import { cn } from "@/lib/utils";

/**
 * El reparto real contra el 40/40/20.
 *
 * Una barra por bloque con la marca del objetivo encima: lo que se mira es la
 * distancia entre las dos, no la cifra. Más de diez puntos se pinta en aviso.
 */
export function BlockBars({ allocation }: { allocation: BlockAllocation }) {
  if (allocation.basis === "NONE") {
    return (
      <p className="text-sm text-muted-foreground">
        Sin bots en staging ni en producción. Los bloques se reparten con lo que opera con dinero.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {allocation.rows.map((row) => {
        const fuera = Math.abs(row.delta) > 10;
        return (
          <div key={row.block} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-foreground">
                {BLOCK_LABELS[row.block]}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {row.bots} bot{row.bots === 1 ? "" : "s"}
                </span>
              </span>
              <span className={cn("tabular-nums", fuera ? "text-warning" : "text-muted-foreground")}>
                {row.actual.toFixed(0)}% <span className="text-xs">de {row.target}%</span>
              </span>
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("h-full rounded-full", fuera ? "bg-warning" : "bg-primary")}
                style={{ width: `${Math.min(100, row.actual)}%` }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-foreground/60"
                style={{ left: `${Math.min(100, row.target)}%` }}
                aria-hidden
              />
            </div>
            <p className="text-xs text-muted-foreground">{BLOCK_HINTS[row.block]}</p>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">
        {allocation.basis === "SIZING"
          ? `Medido por el tamaño asignado: ${allocation.totalSizingPct.toFixed(0)}% del capital en total.`
          : "Ningún bot tiene tamaño asignado, así que se cuenta por número de bots."}
        {allocation.deviates ? " Hay un bloque a más de diez puntos: se rebalancea en la revisión mensual." : ""}
      </p>
    </div>
  );
}
