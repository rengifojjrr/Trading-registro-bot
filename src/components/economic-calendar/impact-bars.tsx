import { IMPORTANCE_LABELS } from "@/lib/economic-calendar/format";
import type { EventImportance } from "@/lib/economic-calendar/types";
import { cn } from "@/lib/utils";

/**
 * El impacto, en tres barras.
 *
 * Es la convención de cualquier calendario económico y se lee de un vistazo,
 * que es lo que hace falta cuando la lista tiene cuarenta filas. Deliberadamente
 * **no** usa el rojo y el verde de las cifras de dinero: aquí rojo no sería
 * «pérdida», y prestar el mismo color a dos significados distintos es cómo se
 * dejan de leer los dos.
 *
 * El texto va en `title` y en un `sr-only`, para que no dependa sólo del color.
 */
export function ImpactBars({ importance }: { importance: EventImportance }) {
  const llenas = importance === 1 ? 3 : importance === 0 ? 2 : 1;
  const label = IMPORTANCE_LABELS[importance];

  return (
    <span className="inline-flex items-end gap-px" title={label}>
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "w-1 rounded-[1px]",
            i === 0 ? "h-1.5" : i === 1 ? "h-2.5" : "h-3.5",
            i < llenas
              ? importance === 1
                ? "bg-warning"
                : "bg-muted-foreground"
              : "bg-border",
          )}
        />
      ))}
    </span>
  );
}
