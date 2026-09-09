import { ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import type { Route } from "next";
import Link from "next/link";

import { ImpactBars } from "@/components/economic-calendar/impact-bars";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatEventValue, surpriseOf } from "@/lib/economic-calendar/format";
import type { CalendarEvent } from "@/lib/economic-calendar/queries";
import { cn } from "@/lib/utils";

/**
 * Lo que se publica hoy, en el panel.
 *
 * El calendario entero vive en su pantalla; esto es el recordatorio de que
 * existe, puesto donde se entra cada día. Un dato que sale en dos horas no
 * sirve de nada en una pantalla a la que hay que acordarse de ir.
 *
 * Sólo impacto alto y medio: la lista completa de un día trae subastas de
 * letras e inventarios de crudo, y aquí no hay sitio ni motivo.
 */
export function TodayNewsCard({
  events,
  next,
  timezone,
}: {
  /** Los de hoy, ya filtrados por impacto y en orden. */
  events: CalendarEvent[];
  /** El próximo de alto impacto, para cuando hoy no hay nada. */
  next: CalendarEvent | null;
  timezone: string;
}) {
  // Ni eventos hoy ni nada a la vista: no se pinta una tarjeta para decir que
  // no hay nada. El calendario sigue en el menú.
  if (events.length === 0 && !next) return null;

  const hoy = DateTime.now().setZone(timezone);
  const ahora = hoy.toMillis();

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div className="flex min-w-0 flex-col gap-1">
          <CardTitle className="text-foreground">Noticias de hoy</CardTitle>
          <CardDescription>
            {events.length > 0
              ? "Datos macro de impacto alto y medio que se publican hoy."
              : "Hoy no se publica nada de impacto. Esto es lo siguiente que viene."}
          </CardDescription>
        </div>
        <Link href={"/noticias" as Route} className="shrink-0 text-xs text-primary hover:underline">
          Ver el calendario
        </Link>
      </CardHeader>

      <CardContent className="flex flex-col divide-y divide-border">
        {(events.length > 0 ? events : next ? [next] : []).map((event) => {
          const cuando = DateTime.fromISO(event.occursAt, { zone: "utc" }).setZone(timezone);
          const yaSalio = cuando.toMillis() <= ahora;
          const sorpresa = surpriseOf(event.actual, event.forecast);
          const esDeOtroDia = cuando.toFormat("yyyy-LL-dd") !== hoy.toFormat("yyyy-LL-dd");

          return (
            <Link
              key={event.id}
              href={`/noticias/${event.id}` as Route}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm transition-colors hover:bg-accent/40",
                yaSalio && "opacity-70",
              )}
            >
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {esDeOtroDia ? cuando.setLocale("es").toFormat("ccc HH:mm") : cuando.toFormat("HH:mm")}
              </span>
              <ImpactBars importance={event.importance} />

              <span className="min-w-0 flex-1 font-medium">{event.title}</span>

              {/* Si ya salió, lo que salió; si no, lo que se espera. Nunca los
                  dos: en el panel no hay sitio, y la ficha los enseña juntos. */}
              <span className="shrink-0 text-xs tabular-nums">
                {yaSalio && event.actual !== null ? (
                  <>
                    <span className="text-muted-foreground">salió </span>
                    <span className={cn("font-medium", sorpresa?.direction !== "EN_LINEA" && "text-warning")}>
                      {formatEventValue(event.actual, event.unit, event.scale)}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    prev. {formatEventValue(event.forecast, event.unit, event.scale)}
                  </span>
                )}
              </span>

              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
