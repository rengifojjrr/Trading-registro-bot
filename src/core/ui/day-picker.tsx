import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { longDateLabel, shiftDate } from "@/core/today";
import { cn } from "@/lib/utils";

/**
 * Moverse de día en día.
 *
 * Los hábitos sólo se podían marcar hoy: la fecha estaba fija en la página, y
 * si se te olvidaba marcar ayer no había forma de arreglarlo -- el calendario
 * de rachas dibujaba para siempre un agujero que no había ocurrido.
 *
 * El día va en la URL para que la vista se pueda compartir y recargar, y por
 * eso esto son enlaces y no botones: sin estado que sincronizar, sin
 * JavaScript que cargar.
 *
 * No se puede avanzar más allá de hoy. Marcar un hábito mañana no es un
 * registro, es un deseo, y mezclarlos vuelve inútil el porcentaje.
 */
export function DayPicker({
  date,
  today,
  basePath,
  param = "dia",
}: {
  date: string;
  today: string;
  basePath: string;
  param?: string;
}) {
  const link = (target: string) =>
    (target === today ? basePath : `${basePath}?${param}=${target}`) as Route;

  const previous = shiftDate(date, -1);
  const next = shiftDate(date, 1);
  const canGoForward = next <= today;

  return (
    <div className="flex items-center gap-2">
      <Link
        href={link(previous)}
        aria-label="Día anterior"
        className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </Link>

      <span className="min-w-40 text-center text-sm font-medium capitalize">
        {date === today ? "Hoy" : longDateLabel(date)}
      </span>

      <Link
        href={canGoForward ? link(next) : link(date)}
        aria-label="Día siguiente"
        aria-disabled={!canGoForward}
        tabIndex={canGoForward ? undefined : -1}
        className={cn(
          "flex size-8 items-center justify-center rounded-md border border-border transition-colors",
          canGoForward
            ? "text-muted-foreground hover:text-foreground"
            : "pointer-events-none opacity-40",
        )}
      >
        <ChevronRight className="size-4" aria-hidden />
      </Link>

      {date !== today ? (
        <Link
          href={basePath as Route}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Volver a hoy
        </Link>
      ) : null}
    </div>
  );
}
