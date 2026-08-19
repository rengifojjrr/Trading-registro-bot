import Link from "next/link";
import type { Route } from "next";

import { WEEKDAY_LABELS, monthGrid, monthLabel, shiftMonth } from "@/core/calendar";
import type { DayMarkers } from "@/core/day";
import { MODULES } from "@/core/registry";
import { cn } from "@/lib/utils";

/**
 * El mes entero, con un punto por módulo que tuvo algo ese día.
 *
 * Cada módulo tenía ya su propia rejilla -- contenido, tareas, hábitos,
 * trading -- y ninguna respondía la pregunta que se hace uno al abrir la
 * aplicación: «cómo va la semana». Cuatro calendarios contestan cuatro veces
 * la mitad de eso.
 *
 * Puntos y no cifras a propósito. Un número por módulo y por día son siete
 * números en un cuadrado de dos centímetros, ilegibles en el móvil y encima
 * incomparables entre sí -- «3 tareas» y «7h de sueño» no se pueden poner uno
 * al lado del otro. Un punto sólo dice «aquí hubo algo», que es exactamente lo
 * que un calendario tiene que decir; el detalle está a un toque.
 *
 * Los colores son los mismos que los del resto de la aplicación, tomados del
 * registro de módulos: el punto violeta es sueño en todas partes.
 */
export function LifeCalendar({
  month,
  today,
  markers,
  basePath = "/",
}: {
  /** `YYYY-MM`. */
  month: string;
  today: string;
  markers: DayMarkers;
  basePath?: string;
}) {
  const weeks = monthGrid(month);
  const link = (target: string) => `${basePath}?mes=${target}` as Route;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={link(shiftMonth(month, -1))}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Mes anterior
        </Link>

        <h3 className="text-sm font-medium capitalize">{monthLabel(month)}</h3>

        <Link
          href={link(shiftMonth(month, 1))}
          className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Mes siguiente
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {WEEKDAY_LABELS.map((label, index) => (
          <div key={`${label}-${index}`}>{label}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weeks.flat().map((day) => {
          const active = markers.get(day.date);
          const isToday = day.date === today;

          return (
            <Link
              key={day.date}
              href={`/dia/${day.date}` as Route}
              aria-label={`Ver el día ${day.date}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center gap-1 rounded-md border p-1 transition-colors",
                day.inMonth
                  ? "border-border/60 hover:border-foreground/40"
                  : "border-transparent opacity-30",
              )}
            >
              <span
                className={cn(
                  "flex size-5 items-center justify-center rounded-full text-[11px] tabular-nums",
                  isToday ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground",
                )}
              >
                {day.dayOfMonth}
              </span>

              <span className="flex min-h-[6px] flex-wrap items-center justify-center gap-[3px]">
                {MODULES.filter((module) => active?.has(module.id)).map((module) => (
                  <span
                    key={module.id}
                    title={module.label}
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: `var(${module.colorToken})` }}
                  />
                ))}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {MODULES.map((module) => (
          <span key={module.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: `var(${module.colorToken})` }}
            />
            {module.label}
          </span>
        ))}
      </div>
    </div>
  );
}
