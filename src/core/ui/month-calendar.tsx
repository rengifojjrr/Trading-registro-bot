import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";

import { WEEKDAY_LABELS, monthGrid, monthLabel, shiftMonth } from "@/core/calendar";
import { cn } from "@/lib/utils";

/**
 * Un mes con cosas dentro.
 *
 * Tareas tiene fechas que son promesas y no registros, y sin calendario la
 * única forma de ver la semana que viene era una lista ordenada -- que dice
 * cuántas hay pero no si están apelotonadas el jueves.
 *
 * El mes va en la URL y no en un estado local, así que se puede compartir,
 * recargar y guardar como vista. Por eso el componente no necesita ser de
 * cliente: las flechas son enlaces.
 */
export function MonthCalendar<T>({
  month,
  today,
  basePath,
  itemsByDate,
  renderItem,
  colorToken,
  monthParam = "mes",
}: {
  /** `YYYY-MM`. */
  month: string;
  today: string;
  basePath: string;
  itemsByDate: Map<string, T[]>;
  renderItem: (item: T) => ReactNode;
  colorToken: string;
  monthParam?: string;
}) {
  const weeks = monthGrid(month);

  const link = (target: string) => `${basePath}?${monthParam}=${target}` as Route;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={link(shiftMonth(month, -1))}
          aria-label="Mes anterior"
          className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>

        <h3 className="text-sm font-medium capitalize">{monthLabel(month)}</h3>

        <Link
          href={link(shiftMonth(month, 1))}
          aria-label="Mes siguiente"
          className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[38rem]">
          <div className="grid grid-cols-7 gap-px">
            {WEEKDAY_LABELS.map((label, index) => (
              <div
                key={`${label}-${index}`}
                className="pb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border">
            {weeks.flat().map((day) => {
              const items = itemsByDate.get(day.date) ?? [];
              const isToday = day.date === today;

              return (
                <div
                  key={day.date}
                  className={cn(
                    "flex min-h-[5.5rem] flex-col gap-1 bg-background p-1.5",
                    !day.inMonth && "opacity-40",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday ? "font-semibold text-white" : "text-muted-foreground",
                    )}
                    style={isToday ? { backgroundColor: `var(${colorToken})` } : undefined}
                  >
                    {day.dayOfMonth}
                  </span>

                  <div className="flex flex-col gap-0.5">
                    {items.slice(0, 4).map((item, index) => (
                      <div key={index}>{renderItem(item)}</div>
                    ))}
                    {items.length > 4 ? (
                      <span className="px-1 text-[0.65rem] text-muted-foreground">
                        +{items.length - 4} más
                      </span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
