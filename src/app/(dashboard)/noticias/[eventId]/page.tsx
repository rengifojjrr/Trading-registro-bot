import { ArrowLeft } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ImpactBars } from "@/components/economic-calendar/impact-bars";
import { ReactionChart } from "@/components/economic-calendar/reaction-chart";
import { PageHeader } from "@/components/layout/page-header";
import { InfoHint } from "@/components/shared/info-hint";
import { ScrollableTable } from "@/components/shared/scrollable-table";
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
import {
  DEFAULT_HORIZON,
  formatAbsPct,
  formatHorizonLabel,
  formatSignedPct,
  horizonOf,
  HORIZONS,
  isHorizon,
  measureReaction,
  type HorizonMinutes,
  type MarketReaction,
} from "@/lib/economic-calendar/market-reaction";
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
 * publicación anterior, y a varios plazos -- porque la reacción no se acaba en
 * la primera hora. El PPI del 13 de agosto de 2026 lo enseña bien: a la hora
 * había acabado un 0,016 % arriba (nada), a las dos horas un 0,33 % arriba, y
 * a las cuatro se había dado la vuelta hasta un 0,24 % abajo.
 */

/** Cada publicación anterior es una petición de velas; con seis sobra para ver el patrón. */
const PUBLICACIONES_MEDIDAS = 6;

export const maxDuration = 30;

interface Medicion {
  event: CalendarEvent;
  reaction: MarketReaction | null;
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

  const hParam = Number(typeof searchParams.h === "string" ? searchParams.h : "");
  const horizon: HorizonMinutes = isHorizon(hParam) ? hParam : DEFAULT_HORIZON;

  const history = event.indicator
    ? await fetchIndicatorHistory({
        indicator: event.indicator,
        before: new Date(event.occursAt),
        limit: PUBLICACIONES_MEDIDAS,
      }).catch(() => [])
    : [];

  // Si este dato ya salió, su propia reacción es la más relevante de todas.
  const medibles = [...(event.actual !== null ? [event] : []), ...history];

  const mediciones: Medicion[] = await Promise.all(
    medibles.map(async (e) => {
      const velas = await fetchReactionCandles(new Date(e.occursAt));
      return {
        event: e,
        reaction: velas ? measureReaction(velas.candles, new Date(e.occursAt)) : null,
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

  /** Conserva el otro parámetro: el plazo y la publicación son dos ejes, no una lista. */
  const href = (cambio: { ref?: string; h?: HorizonMinutes }): Route => {
    const params = new URLSearchParams();
    const refFinal = cambio.ref ?? refParam;
    const hFinal = cambio.h ?? horizon;
    if (refFinal) params.set("ref", refFinal);
    if (hFinal !== DEFAULT_HORIZON) params.set("h", String(hFinal));
    const query = params.toString();
    return (query ? `/noticias/${event.id}?${query}` : `/noticias/${event.id}`) as Route;
  };

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
              ? "Lo que hizo el precio después de cada publicación anterior de este mismo dato. Es lo que pasó, no lo que va a pasar."
              : "Todavía no hay publicaciones anteriores de este dato guardadas con las que comparar."}
          </CardDescription>
        </CardHeader>

        {mediciones.length > 0 ? (
          <CardContent className="flex flex-col gap-4">
            {/* El plazo manda sobre la columna de la lista y sobre el gráfico.
                Existe porque la reacción no se acaba en la primera hora: hay
                datos que no mueven nada al salir y arrancan a la segunda. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-muted-foreground">Plazo</span>
              {HORIZONS.map((h) => (
                <Chip key={h} href={href({ h })} activo={horizon === h}>
                  {formatHorizonLabel(h)}
                </Chip>
              ))}
            </div>

            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {mediciones.map((m) => (
                <FilaMedicion
                  key={m.event.id}
                  medicion={m}
                  href={href({ ref: m.event.id })}
                  timezone={timezone}
                  horizon={horizon}
                  seleccionada={seleccionada?.event.id === m.event.id}
                  esEsta={m.event.id === event.id}
                />
              ))}
            </ul>

            {seleccionada && velasSeleccionadas ? (
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">
                  {formatDateTime(seleccionada.event.occursAt, timezone)}
                  {seleccionada.event.period ? ` · ${seleccionada.event.period}` : ""}
                </p>
                <ReactionChart
                  candles={velasSeleccionadas.candles}
                  eventAt={seleccionada.event.occursAt}
                  timezone={timezone}
                  productId={velasSeleccionadas.productId}
                  horizonMinutes={horizon}
                />
                {seleccionada.reaction ? (
                  <TablaPlazos reaction={seleccionada.reaction} horizon={horizon} />
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

/**
 * Los cuatro plazos de una publicación, juntos.
 *
 * Es lo que responde a «cómo fue el movimiento» en vez de «cuánto se movió»:
 * leer la fila de «acabó» de izquierda a derecha cuenta la historia -- si el
 * golpe fue inmediato y se deshizo, si tardó en arrancar, o si se dio la
 * vuelta.
 */
function TablaPlazos({ reaction, horizon }: { reaction: MarketReaction; horizon: HorizonMinutes }) {
  const filas = [
    {
      etiqueta: "Acabó",
      hint: "Dónde estaba el precio al final del plazo, comparado con justo antes del dato.",
      valor: (m: ReturnType<typeof horizonOf>) => formatSignedPct(m?.changePct ?? null),
      tono: (m: ReturnType<typeof horizonOf>) => m?.changePct ?? null,
    },
    {
      etiqueta: "Llegó a moverse",
      hint: "El mayor alejamiento del precio previo dentro del plazo, en cualquier sentido. No es lo mismo que dónde acabó: un dato puede tirar el precio y devolverlo, y para una posición apalancada ese viaje cuenta.",
      valor: (m: ReturnType<typeof horizonOf>) => formatAbsPct(m?.maxMovePct ?? null),
      tono: () => null,
    },
    {
      etiqueta: "Recorrido",
      hint: "Del máximo al mínimo del plazo, sobre el precio previo. Es la medida de cuánto se agitó.",
      valor: (m: ReturnType<typeof horizonOf>) => formatAbsPct(m?.rangePct ?? null),
      tono: () => null,
    },
  ];

  return (
    <ScrollableTable>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-normal">Plazo</th>
            {HORIZONS.map((h) => (
              <th
                key={h}
                className={cn(
                  "px-2 py-1.5 text-right font-normal tabular-nums",
                  h === horizon && "text-foreground",
                )}
              >
                {formatHorizonLabel(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.etiqueta} className="border-b border-border last:border-0">
              <td className="px-2 py-1.5">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {fila.etiqueta}
                  <InfoHint label={fila.etiqueta}>{fila.hint}</InfoHint>
                </span>
              </td>
              {HORIZONS.map((h) => {
                const m = horizonOf(reaction, h);
                const tono = fila.tono(m);
                return (
                  <td
                    key={h}
                    className={cn(
                      "px-2 py-1.5 text-right tabular-nums",
                      h === horizon && "bg-secondary/40 font-medium",
                      tono !== null && tono > 0 && "text-positive",
                      tono !== null && tono < 0 && "text-negative",
                    )}
                  >
                    {fila.valor(m)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTable>
  );
}

function FilaMedicion({
  medicion,
  href,
  timezone,
  horizon,
  seleccionada,
  esEsta,
}: {
  medicion: Medicion;
  href: Route;
  timezone: string;
  horizon: HorizonMinutes;
  seleccionada: boolean;
  esEsta: boolean;
}) {
  const { event, reaction } = medicion;
  const sorpresa = surpriseOf(event.actual, event.forecast);
  const medida = reaction ? horizonOf(reaction, horizon) : null;

  return (
    <li>
      <Link
        href={href}
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
          {medida && medida.changePct !== null ? (
            <>
              <span className="text-muted-foreground">llegó a moverse </span>
              <span className="font-medium">{formatAbsPct(medida.maxMovePct)}</span>
              <span
                className={cn(
                  "ml-2",
                  medida.changePct > 0 && "text-positive",
                  medida.changePct < 0 && "text-negative",
                )}
              >
                {formatSignedPct(medida.changePct)} a {formatHorizonLabel(horizon)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {reaction ? `sin velas hasta las ${formatHorizonLabel(horizon)}` : "sin velas de aquel momento"}
            </span>
          )}
        </span>

        {esEsta ? <span className="shrink-0 text-[10px] text-warning">esta publicación</span> : null}
      </Link>
    </li>
  );
}

function Chip({
  href,
  activo,
  children,
}: {
  href: Route;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
        activo
          ? "border-border bg-secondary text-secondary-foreground"
          : "border-transparent text-muted-foreground hover:bg-accent",
      )}
    >
      {children}
    </Link>
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
}: {
  etiqueta: string;
  valor: string;
  destacado?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {etiqueta}
        {hint ? <InfoHint label={etiqueta}>{hint}</InfoHint> : null}
      </p>
      <p className={cn("text-lg font-semibold tabular-nums", destacado && "text-foreground")}>
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
