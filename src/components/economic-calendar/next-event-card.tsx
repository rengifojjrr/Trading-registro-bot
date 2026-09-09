"use client";

import { CalendarClock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { ImpactBars } from "@/components/economic-calendar/impact-bars";
import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarEvent } from "@/lib/economic-calendar/queries";
import { formatCountdown, formatEventValue, surpriseOf } from "@/lib/economic-calendar/format";
import { categoryLabel } from "@/lib/economic-calendar/relevance";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Lo próximo que se publica, con la cuenta atrás y lo que tienes abierto.
 *
 * Es la razón de ser de toda la sección. Un calendario que hay que ir a leer
 * es un calendario que se lee el día después; lo que cambia una decisión es
 * «el IPC sale en 45 minutos y tienes 22 contratos abiertos», y eso sólo lo
 * puede decir una aplicación que sepa las dos mitades a la vez.
 *
 * Dice hechos, no consejos: cuánto falta, qué se espera, qué tienes abierto y
 * cómo funciona el margen. Qué hacer con eso es de quien opera.
 */
export function NextEventCard({
  event,
  history,
  timezone,
  openContracts,
}: {
  event: CalendarEvent;
  /** Las veces anteriores del mismo indicador, de más reciente a más antigua. */
  history: CalendarEvent[];
  timezone: string;
  /** Contratos abiertos ahora mismo. 0 si no hay posición. */
  openContracts: number;
}) {
  const objetivo = new Date(event.occursAt).getTime();

  // Empieza en null y se rellena tras montar: el servidor y el navegador no
  // comparten reloj, y pintar aquí una cuenta atrás calculada en el servidor
  // daría un salto visible -- y un aviso de hidratación -- en cada carga.
  const [restante, setRestante] = useState<number | null>(null);

  const tick = useCallback(() => setRestante(objetivo - Date.now()), [objetivo]);

  useEffect(() => {
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [tick]);

  const cuenta = restante === null ? null : formatCountdown(restante);
  // Menos de dos horas es cuando deja de ser una nota en la agenda.
  const inminente = restante !== null && restante > 0 && restante <= 2 * 60 * 60 * 1000;

  return (
    <Card className={cn(inminente && openContracts > 0 && "border-warning/50")}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          Lo próximo
        </CardTitle>
        <CardDescription>
          El siguiente dato de alto impacto. La importancia la marca la fuente del calendario.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <ImpactBars importance={event.importance} />
              <span className="text-lg font-semibold">{event.title}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(event.occursAt, timezone)}
              {event.period ? ` · periodo ${event.period}` : ""}
              {categoryLabel(event.category) ? ` · ${categoryLabel(event.category)}` : ""}
            </span>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Falta</p>
            <p className="text-2xl font-semibold tabular-nums">
              {cuenta ?? <span className="text-muted-foreground">·</span>}
            </p>
          </div>
        </div>

        {/* El aviso que justifica toda la sección. Sólo cuando las dos cosas
            son ciertas a la vez: hay posición y el dato está encima. */}
        {inminente && openContracts > 0 ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
            <span className="font-medium">
              Tienes {openContracts} contrato{openContracts === 1 ? "" : "s"} abierto
              {openContracts === 1 ? "" : "s"} para cuando salga.
            </span>{" "}
            Un dato que sorprenda mueve el precio en segundos, y el margen se calcula al precio de
            ese momento.
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
          <Figure label="Previsión" value={formatEventValue(event.forecast, event.unit, event.scale)} />
          <Figure label="Dato previo" value={formatEventValue(event.previous, event.unit, event.scale)} />
          <Figure
            label="Real"
            value={formatEventValue(event.actual, event.unit, event.scale)}
            hint="Aparece cuando se publica. Un guion significa que todavía no ha salido, no que sea cero."
          />
        </div>

        {history.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-border pt-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              Las últimas veces que salió
              <InfoHint label="Las últimas veces que salió">
                Publicaciones anteriores del mismo indicador, con lo que se esperaba y lo que salió.
                Sirve para juzgar si este dato suele sorprender o no. No predice nada.
              </InfoHint>
            </p>
            <ul className="flex flex-col gap-1">
              {history.map((h) => {
                const sorpresa = surpriseOf(h.actual, h.forecast);
                return (
                  <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      {formatDateTime(h.occursAt, timezone)}
                      {h.period ? ` · ${h.period}` : ""}
                    </span>
                    <span className="flex items-center gap-2 tabular-nums">
                      <span className="text-muted-foreground">
                        prev. {formatEventValue(h.forecast, h.unit, h.scale)}
                      </span>
                      <span
                        className={cn(
                          "font-medium",
                          sorpresa?.direction === "ARRIBA" && "text-warning",
                          sorpresa?.direction === "ABAJO" && "text-warning",
                        )}
                      >
                        {formatEventValue(h.actual, h.unit, h.scale)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {hint ? <InfoHint label={label}>{hint}</InfoHint> : null}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}
