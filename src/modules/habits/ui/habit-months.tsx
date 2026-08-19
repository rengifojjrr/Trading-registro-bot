"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { monthGrid, monthLabel, monthOf, shiftMonth } from "@/core/calendar";
import { cn } from "@/lib/utils";
import { toggleHabit } from "@/modules/habits/actions";

/**
 * Los últimos doce meses de un hábito, marcables.
 *
 * La racha dice cómo va ahora y el porcentaje dice la media, pero ninguno de
 * los dos enseña que lo dejaste tres semanas en septiembre. Doce cuadrículas
 * seguidas sí.
 *
 * Los cuadros son botones y no dibujo: rellenar un hueco viejo es pulsarlo,
 * en lugar de navegar día a día hasta él desde la pantalla principal. La
 * marca es optimista porque el gesto tiene que sentirse inmediato -- si hay
 * que esperar al servidor, rellenar una semana se hace cuesta arriba.
 */
export function HabitMonths({
  habitId,
  marked,
  today,
}: {
  habitId: string;
  marked: string[];
  today: string;
}) {
  const [pending, startTransition] = useTransition();
  const [dates, setDates] = useOptimistic(new Set(marked));

  // De hace once meses a este, en orden natural de lectura.
  const months = Array.from({ length: 12 }, (_, index) => shiftMonth(monthOf(today), index - 11));

  function toggle(date: string) {
    const done = dates.has(date);

    startTransition(async () => {
      const next = new Set(dates);
      if (done) next.delete(date);
      else next.add(date);
      setDates(next);

      try {
        await toggleHabit(habitId, date, !done);
      } catch {
        toast.error("No se pudo guardar la marca.");
      }
    });
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {months.map((month) => (
        <div key={month} className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium capitalize text-muted-foreground">
            {monthLabel(month)}
          </h4>

          <div className="grid grid-cols-7 gap-1">
            {monthGrid(month)
              .flat()
              .map((day) => {
                const done = dates.has(day.date);
                // Un día que aún no ha llegado no se puede marcar: sería un
                // deseo, no un registro.
                const future = day.date > today;

                return (
                  <button
                    key={day.date}
                    type="button"
                    disabled={pending || future || !day.inMonth}
                    onClick={() => toggle(day.date)}
                    aria-label={`${day.date}${done ? ", marcado" : ""}`}
                    aria-pressed={done}
                    title={day.date}
                    className={cn(
                      "aspect-square rounded-sm border text-[0.6rem] tabular-nums transition-colors",
                      !day.inMonth && "invisible",
                      future && "cursor-default border-dashed border-border opacity-40",
                      !future && !done && "border-border text-muted-foreground hover:border-foreground/40",
                      done && "border-transparent text-mod-foreground",
                    )}
                    style={done ? { backgroundColor: "var(--mod-habits)" } : undefined}
                  >
                    {day.dayOfMonth}
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
