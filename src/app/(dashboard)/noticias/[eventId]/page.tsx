import { ArrowLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ImpactBars } from "@/components/economic-calendar/impact-bars";
import { ReactionChart } from "@/components/economic-calendar/reaction-chart";
import { PageHeader } from "@/components/layout/page-header";
import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { fetchReactionCandles } from "@/lib/economic-calendar/candles";
import {
  describeSurprise,
  formatEventValue,
  IMPORTANCE_LABELS,
  surpriseOf,
} from "@/lib/economic-calendar/format";
import { guideFor } from "@/lib/economic-calendar/indicator-guide";
import { formatSignedPct, measureReaction, type MarketReaction } from "@/lib/economic-calendar/market-reaction";
import { fetchEventById, fetchIndicatorHistory, type CalendarEvent } from "@/lib/economic-calendar/queries";
import { categoryLabel } from "@/lib/economic-calendar/relevance";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * La ficha de un dato macro: qué es, cómo se lee, y qué hizo el precio las
 * veces anteriores.
 *
 * Lo tercero es lo que ningún calendario da y lo que de verdad se busca al
 * preguntar «qué podría pasar». La respuesta honesta no es una predicción:
 * es lo que de hecho pasó, medido sobre velas de un minuto alrededor de cada
 * publicación anterior.
 */

/** Cada publicación anterior es una petición de velas; con seis sobra para ver el patrón. */
const PUBLICACIONES_MEDIDAS = 6;

export const maxDuration = 30;

interface Medicion {
  event: CalendarEvent;
  reaction: MarketReaction | null;
  productId: string | null;
}

export default async function EventoPage(props: PageProps<"/noticias/[eventId]">) {
  const user = await requireUser();
  const { eventId } = await props.params;
  const searchParams = await props.searchParams;

  const event = await fetchEventById(eventId).catch(() => null);
  if (!event) notFound();

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone")
    .eq("user_id", user.id)
    .maybeSingle();
  const timezone = settings?.timezone || "UTC";

  const history = event.indicator
    ? await fetchIndicatorHistory({
        indicator: event.indicator,
        before: new Date(event.occursAt),
        limit: PUBLICACIONES_MEDIDAS,
      }).catch(() => [])
    : [];

  // Si este dato ya salió, su propia reacción es la más relevante de todas.
  const yaSalio = event.actual !== null;
  const medibles = [...(yaSalio ? [event] : []), ...history];

  const mediciones: Medicion[] = await Promise.all(
    medibles.map(async (e) => {
      const velas = await fetchReactionCandles(new Date(e.occursAt));
      return {
        event: e,
        reaction: velas ? measureReaction(velas.candles, new Date(e.occursAt)) : null,
        productId: velas?.productId ?? null,
      };
    }),
  );

  const refParam = typeof searchParams.ref === "string" ? searchParams.ref : null;
  const seleccionada = mediciones.find((m) => m.event.id === refParam) ?? mediciones[0] ?? null;
  const velasSeleccionadas = seleccionada
    ? await fetchReactionCandles(new Date(seleccionada.event.occursAt))
    : null;

  const guide = guideFor(event);
  const sorpresa = surpriseOf(event.actual, event.forecast);

  return (
    <>
      <PageHeader title={event.title} description={descripcionCorta(event, timezone)} />

      <Link
        href={"/noticias" as Route}
        className="flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden />
        Volver al calendario
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImpactBars importance={event.importance} />
            {IMPORTANCE_LABELS[event.importance]}
            {categoryLabel(event.category) ? (
              <span className="text-sm font-normal text-muted-foreground">
                · {categoryLabel(event.category)}
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>
            {formatDateTime(event.occursAt, timezone)}
            {event.period ? ` · dato del periodo ${event.period}` : ""}
            {event.sourceName ? ` · publica ${event.sourceName}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <Cifra etiqueta="Previsión" valor={formatEventValue(event.forecast, event.unit, event.scale)} />
          <Cifra etiqueta="Dato previo" valor={formatEventValue(event.previous, event.unit, event.scale)} />
          <Cifra
            etiqueta="Real"
            valor={formatEventValue(event.actual, event.unit, event.scale)}
            destacado
            hint="Un guion significa que todavía no ha salido, no que sea cero."
          />
        </CardContent>
      </Card>

      {/* Qué es. Primero lo de la fuente si no hay ficha propia: es preferible
          una explicación en inglés a ninguna, pero no a una inventada. */}
      <Card>
        <CardHeader>
          <CardTitle>Qué mide</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {guide ? <p className="max-w-prose leading-relaxed">{guide.mide}</p> : null}
          {event.comment ? (
            <details className="max-w-prose">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {guide ? "La definición completa, de la fuente (en inglés)" : "Definición de la fuente (en inglés)"}
              </summary>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{event.comment}</p>
            </details>
          ) : null}
          {!guide && !event.comment ? (
            <p className="text-muted-foreground">No hay descripción disponible para este dato.</p>
          ) : null}
        </CardContent>
      </Card>

      {guide ? (
        <Card>
          <CardHeader>
            <CardTitle>Cómo se suele leer</CardTitle>
            <CardDescription>
              La lectura habitual del mercado, no una predicción. Lo que mueve el precio suele ser la
              sorpresa -- la diferencia con lo previsto -- y no el nivel; y cuando el dato ya venía
              descontado, a veces pasa justo lo contrario.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Lectura
              titulo="Si sale por encima de lo previsto"
              texto={guide.porEncima}
              activa={sorpresa?.direction === "ARRIBA"}
            />
            <Lectura
              titulo="Si sale por debajo de lo previsto"
              texto={guide.porDebajo}
              activa={sorpresa?.direction === "ABAJO"}
            />
            {guide.nota ? (
              <p className="max-w-prose border-t border-border pt-3 text-xs text-muted-foreground">
                {guide.nota}
              </p>
            ) : null}
            {sorpresa && event.actual !== null && event.forecast !== null ? (
              <p className="rounded-md border border-border bg-secondary/40 px-3 py-2">
                Este dato ya salió: {describeSurprise(sorpresa, event.actual, event.forecast, event.unit, event.scale)}.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Cómo reaccionó el mercado</CardTitle>
          <CardDescription>
            {mediciones.length > 0
              ? "Lo que hizo el precio en la hora siguiente a cada publicación anterior de este mismo dato. Es lo que pasó, no lo que va a pasar."
              : "Todavía no hay publicaciones anteriores de este dato guardadas con las que comparar."}
          </CardDescription>
        </CardHeader>

        {mediciones.length > 0 ? (
          <CardContent className="flex flex-col gap-4">
            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {mediciones.map((m) => (
                <FilaMedicion
                  key={m.event.id}
                  medicion={m}
                  eventId={event.id}
                  timezone={timezone}
                  seleccionada={seleccionada?.event.id === m.event.id}
                  esEsta={m.event.id === event.id}
                />
              ))}
            </ul>

            {seleccionada && velasSeleccionadas ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">
                  {formatDateTime(seleccionada.event.occursAt, timezone)}
                  {seleccionada.event.period ? ` · ${seleccionada.event.period}` : ""}
                </p>
                <ReactionChart
                  candles={velasSeleccionadas.candles}
                  eventAt={seleccionada.event.occursAt}
                  timezone={timezone}
                  productId={velasSeleccionadas.productId}
                />
                {seleccionada.reaction ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Cifra
                      etiqueta="A 15 min"
                      valor={formatSignedPct(seleccionada.reaction.changePct15)}
                      tono={seleccionada.reaction.changePct15}
                    />
                    <Cifra
                      etiqueta="A 1 hora"
                      valor={formatSignedPct(seleccionada.reaction.changePct60)}
                      tono={seleccionada.reaction.changePct60}
                    />
                    <Cifra
                      etiqueta="Llegó a moverse"
                      valor={`${formatSignedPct(seleccionada.reaction.maxMovePct).replace("+", "")}`}
                      hint="El mayor alejamiento del precio previo dentro de la hora, en cualquier sentido. No es lo mismo que dónde acabó: un dato puede tirar el precio y devolverlo, y para una posición apalancada ese viaje cuenta."
                    />
                    <Cifra
                      etiqueta="Recorrido"
                      valor={formatSignedPct(seleccionada.reaction.rangePct).replace("+", "")}
                      hint="Del máximo al mínimo de la hora siguiente, sobre el precio previo."
                    />
                  </div>
                ) : null}
              </div>
            ) : seleccionada ? (
              <p className="text-sm text-muted-foreground">
                No hay velas de aquel momento para dibujar el gráfico.
              </p>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
    </>
  );
}

function FilaMedicion({
  medicion,
  eventId,
  timezone,
  seleccionada,
  esEsta,
}: {
  medicion: Medicion;
  eventId: string;
  timezone: string;
  seleccionada: boolean;
  esEsta: boolean;
}) {
  const { event, reaction } = medicion;
  const sorpresa = surpriseOf(event.actual, event.forecast);

  return (
    <li>
      <Link
        href={`/noticias/${eventId}?ref=${event.id}` as Route}
        className={cn(
          "flex flex-wrap items-baseline gap-x-3 gap-y-1 px-3 py-2 text-sm transition-colors hover:bg-accent/40",
          seleccionada && "bg-secondary/50",
        )}
      >
        <span className="w-36 shrink-0 text-muted-foreground">
          {formatDateTime(event.occursAt, timezone)}
        </span>
        <span className="w-16 shrink-0 text-xs text-muted-foreground">{event.period ?? ""}</span>

        <span className="flex-1 text-xs tabular-nums text-muted-foreground">
          prev. {formatEventValue(event.forecast, event.unit, event.scale)} → salió{" "}
          <span
            className={cn(
              "font-medium",
              sorpresa && sorpresa.direction !== "EN_LINEA" ? "text-warning" : "text-foreground",
            )}
          >
            {formatEventValue(event.actual, event.unit, event.scale)}
          </span>
        </span>

        <span className="shrink-0 text-xs tabular-nums">
          {reaction ? (
            <>
              <span className="text-muted-foreground">llegó a moverse </span>
              <span className="font-medium">
                {formatSignedPct(reaction.maxMovePct).replace("+", "")}
              </span>
              <span
                className={cn(
                  "ml-2",
                  reaction.changePct60 !== null && reaction.changePct60 > 0 && "text-positive",
                  reaction.changePct60 !== null && reaction.changePct60 < 0 && "text-negative",
                )}
              >
                {formatSignedPct(reaction.changePct60)} a 1 h
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">sin velas de aquel momento</span>
          )}
        </span>

        {esEsta ? <span className="shrink-0 text-[10px] text-warning">esta publicación</span> : null}
      </Link>
    </li>
  );
}

function Lectura({ titulo, texto, activa }: { titulo: string; texto: string; activa: boolean }) {
  return (
    <div
      className={cn(
        "max-w-prose rounded-md border px-3 py-2",
        // Se resalta la lectura que de hecho aplica cuando el dato ya salió:
        // leer las dos cuando ya se sabe cuál toca es trabajo de más.
        activa ? "border-warning/40 bg-warning/10" : "border-border",
      )}
    >
      <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className="mt-0.5 leading-relaxed">{texto}</p>
    </div>
  );
}

function Cifra({
  etiqueta,
  valor,
  destacado,
  hint,
  tono,
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  hint?: string;
  tono?: number | null;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {etiqueta}
        {hint ? <InfoHint label={etiqueta}>{hint}</InfoHint> : null}
      </p>
      <p
        className={cn(
          "text-lg font-semibold tabular-nums",
          destacado && "text-foreground",
          tono !== undefined && tono !== null && tono > 0 && "text-positive",
          tono !== undefined && tono !== null && tono < 0 && "text-negative",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

function descripcionCorta(event: CalendarEvent, timezone: string): string {
  const cuando = formatDateTime(event.occursAt, timezone);
  return event.indicator && event.indicator !== event.title
    ? `${event.indicator} · ${cuando}`
    : cuando;
}
