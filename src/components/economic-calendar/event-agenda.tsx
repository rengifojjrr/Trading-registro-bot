import { ChevronRight } from "lucide-react";
import { DateTime } from "luxon";
import type { Route } from "next";
import Link from "next/link";

import { ImpactBars } from "@/components/economic-calendar/impact-bars";
import { formatEventValue, surpriseOf } from "@/lib/economic-calendar/format";
import type { CalendarEvent } from "@/lib/economic-calendar/queries";
import { categoryLabel } from "@/lib/economic-calendar/relevance";
import { cn } from "@/lib/utils";
import { tituloEnEspanol } from "@/lib/economic-calendar/en-espanol";

/**
 * La agenda: qué se publica, por días.
 *
 * Se agrupa por día **en la zona horaria del usuario**, no en UTC. Un dato de
 * las 12:30 UTC cae a las 07:30 en Bogotá, y una agenda que lo pusiera en otro
 * día que el reloj de quien la lee no serviría para lo único que sirve una
 * agenda, que es saber si es hoy.
 *
 * Sin estado ni interacción: se pinta en el servidor. Lo único que se abre y
 * se cierra es el `<details>` de la explicación, que no necesita JavaScript.
 */
export function EventAgenda({
  events,
  timezone,
  now,
}: {
  events: CalendarEvent[];
  timezone: string;
  /** El momento que separa «ya salió» de «está por salir». */
  now: Date;
}) {
  const dias = groupByDay(events, timezone);

  return (
    <div className="flex flex-col gap-5">
      {dias.map((dia) => (
        <section key={dia.key} className="flex flex-col gap-1.5">
          <h2
            className={cn(
              "text-sm font-medium",
              dia.isToday ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {dia.label}
            {dia.isToday ? <span className="ml-2 text-xs font-normal text-warning">Hoy</span> : null}
          </h2>

          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {dia.events.map((event) => (
              <EventRow key={event.id} event={event} timezone={timezone} now={now} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function EventRow({
  event,
  timezone,
  now,
}: {
  event: CalendarEvent;
  timezone: string;
  now: Date;
}) {
  const yaSalio = new Date(event.occursAt).getTime() <= now.getTime();
  const sorpresa = surpriseOf(event.actual, event.forecast);
  const hora = DateTime.fromISO(event.occursAt, { zone: "utc" }).setZone(timezone).toFormat("HH:mm");

  return (
    <li className={cn(yaSalio && "opacity-70")}>
      {/* Toda la fila entra en la ficha, que es donde vive lo que explica el
          dato y cómo reaccionó el precio las veces anteriores. Antes esto era
          un `<details>` con la definición en inglés metida bajo la fila; una
          agenda de cuarenta filas no es sitio para leer nada. */}
      <Link
        href={`/noticias/${event.id}` as Route}
        className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 transition-colors hover:bg-accent/40"
      >
        <span className="w-11 shrink-0 text-sm tabular-nums text-muted-foreground">{hora}</span>
        <ImpactBars importance={event.importance} />

        <span className="min-w-0 flex-1 text-sm">
          <span className="font-medium">{tituloEnEspanol(event.title)}</span>
          {event.period ? (
            <span className="ml-1.5 text-xs text-muted-foreground">{event.period}</span>
          ) : null}
          {categoryLabel(event.category) ? (
            <span className="ml-1.5 hidden text-xs text-muted-foreground sm:inline">
              · {categoryLabel(event.category)}
            </span>
          ) : null}
        </span>

        {/* Los tres números en columnas fijas para que se puedan comparar de
            arriba abajo sin leer las etiquetas de cada fila. */}
        <span className="flex shrink-0 items-baseline gap-3 text-xs tabular-nums">
          <Valor etiqueta="Prev." valor={formatEventValue(event.previous, event.unit, event.scale)} />
          <Valor etiqueta="Prev.ᵉ" valor={formatEventValue(event.forecast, event.unit, event.scale)} />
          <Valor
            etiqueta="Real"
            valor={formatEventValue(event.actual, event.unit, event.scale)}
            destacado={event.actual !== null}
            tono={sorpresa && sorpresa.direction !== "EN_LINEA" ? "sorpresa" : undefined}
          />
        </span>

        <ChevronRight className="size-3.5 shrink-0 self-center text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function Valor({
  etiqueta,
  valor,
  destacado,
  tono,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  tono?: "sorpresa";
}) {
  return (
    <span className="flex w-16 flex-col items-end">
      <span className="text-[10px] text-muted-foreground">{etiqueta}</span>
      <span
        className={cn(
          destacado ? "font-medium text-foreground" : "text-muted-foreground",
          // Ámbar y no rojo/verde: que un dato salga por encima de lo previsto
          // no es bueno ni malo, depende de qué dato sea y de cómo estés
          // posicionado. Marcarlo en verde sería una opinión disfrazada.
          tono === "sorpresa" && "text-warning",
        )}
      >
        {valor}
      </span>
    </span>
  );
}

interface Day {
  key: string;
  label: string;
  isToday: boolean;
  events: CalendarEvent[];
}

function groupByDay(events: CalendarEvent[], timezone: string): Day[] {
  const hoy = DateTime.now().setZone(timezone).toFormat("yyyy-LL-dd");
  const porDia = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const local = DateTime.fromISO(event.occursAt, { zone: "utc" }).setZone(timezone);
    const key = local.toFormat("yyyy-LL-dd");
    const lista = porDia.get(key) ?? [];
    lista.push(event);
    porDia.set(key, lista);
  }

  return [...porDia.entries()].map(([key, lista]) => ({
    key,
    label: DateTime.fromFormat(key, "yyyy-LL-dd", { zone: timezone })
      .setLocale("es")
      .toFormat("cccc, d 'de' LLLL"),
    isToday: key === hoy,
    events: lista,
  }));
}
