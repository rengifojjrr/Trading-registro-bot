import { ArrowLeft, Scale, TrendingDown, TrendingUp } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ImpactBars } from "@/components/economic-calendar/impact-bars";
import {
  MarketReactionSection,
  type Medicion,
} from "@/components/economic-calendar/market-reaction-section";
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
import {
  guideFor,
  SESGO_LABELS,
  type SesgoParaBitcoin,
} from "@/lib/economic-calendar/indicator-guide";
import { measureReaction } from "@/lib/economic-calendar/market-reaction";
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
 *
 * Las mediciones se calculan aquí, en el servidor, y la interacción vive en
 * `MarketReactionSection`: elegir otra publicación o cambiar de plazo no
 * recarga nada.
 */

/** Cada publicación anterior es una petición de velas; con seis sobra para ver el patrón. */
const PUBLICACIONES_MEDIDAS = 6;

export const maxDuration = 30;

export default async function EventoPage(props: PageProps<"/noticias/[eventId]">) {
  const user = await requireUser();
  const { eventId } = await props.params;

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
  const medibles = [...(event.actual !== null ? [event] : []), ...history];

  const medidas = await Promise.all(
    medibles.map(async (e) => {
      const velas = await fetchReactionCandles(new Date(e.occursAt));
      return {
        event: e,
        reaction: velas ? measureReaction(velas.candles, new Date(e.occursAt)) : null,
        candles: velas?.candles ?? [],
        productId: velas?.productId ?? null,
      };
    }),
  );

  const mediciones: Medicion[] = medidas.map(({ event: e, reaction }) => ({ event: e, reaction }));
  // Sólo viajan al navegador las velas de la primera; las demás se piden al
  // elegirlas. Mandarlas todas serían seis veces trescientas velas en el HTML
  // de una página que a lo mejor nadie desplaza.
  const primera = medidas[0];

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
          <CardTitle className="flex flex-wrap items-center gap-2">
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
              Los dos escenarios, y de qué lado cae cada uno para Bitcoin. Es la lectura habitual
              del mercado, no una predicción: lo que mueve el precio suele ser la sorpresa -- la
              diferencia con lo previsto -- y no el nivel, y cuando el dato ya venía descontado a
              veces pasa justo lo contrario. Debajo está lo que de hecho hizo el precio las últimas
              veces, que es la comprobación.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <Lectura
              titulo="Si sale por encima de lo previsto"
              texto={guide.porEncima}
              sesgo={guide.sesgoEncima}
              activa={sorpresa?.direction === "ARRIBA"}
            />
            <Lectura
              titulo="Si sale por debajo de lo previsto"
              texto={guide.porDebajo}
              sesgo={guide.sesgoDebajo}
              activa={sorpresa?.direction === "ABAJO"}
            />
            {guide.nota ? (
              <p className="max-w-prose border-t border-border pt-3 text-xs text-muted-foreground">
                {guide.nota}
              </p>
            ) : null}
            {sorpresa && event.actual !== null && event.forecast !== null ? (
              <p className="rounded-md border border-border bg-secondary/40 px-3 py-2">
                Este dato ya salió: {describeSurprise(sorpresa, event.actual, event.forecast, event.unit, event.scale)}
                {sorpresa.direction !== "EN_LINEA"
                  ? `, o sea el escenario ${
                      SESGO_ESCENARIO[
                        sorpresa.direction === "ARRIBA" ? guide.sesgoEncima : guide.sesgoDebajo
                      ]
                    }`
                  : ""}
                .
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
              ? "Lo que hizo el precio después de cada publicación anterior de este mismo dato. Elige una para verla en el gráfico. Es lo que pasó, no lo que va a pasar."
              : "Todavía no hay publicaciones anteriores de este dato guardadas con las que comparar."}
          </CardDescription>
        </CardHeader>

        {mediciones.length > 0 && primera ? (
          <CardContent>
            <MarketReactionSection
              mediciones={mediciones}
              initialCandles={primera.candles}
              productId={primera.productId ?? ""}
              timezone={timezone}
              currentEventId={event.id}
            />
          </CardContent>
        ) : null}
      </Card>
    </>
  );
}

/** Cómo se nombra cada sesgo dentro de una frase: «el escenario alcista». */
const SESGO_ESCENARIO: Record<SesgoParaBitcoin, string> = {
  ALCISTA: "alcista",
  BAJISTA: "bajista",
  MIXTO: "de doble lectura",
};

function Lectura({
  titulo,
  texto,
  sesgo,
  activa,
}: {
  titulo: string;
  texto: string;
  sesgo: SesgoParaBitcoin;
  activa: boolean;
}) {
  return (
    <div
      className={cn(
        "max-w-prose rounded-md border px-3 py-2",
        // Se resalta la lectura que de hecho aplica cuando el dato ya salió:
        // leer las dos cuando ya se sabe cuál toca es trabajo de más.
        activa ? "border-warning/40 bg-warning/10" : "border-border",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-xs font-medium text-muted-foreground">{titulo}</p>
        {/* El lado al que cae, arriba y con color. El texto lo explica, pero
            con una posición abierta no se lee un párrafo para deducirlo: lo
            que hace falta saber en tres segundos es si el escenario que acaba
            de ocurrir es el bueno o el malo para lo que tienes puesto. */}
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            sesgo === "ALCISTA" && "bg-positive/10 text-positive",
            sesgo === "BAJISTA" && "bg-negative/10 text-negative",
            sesgo === "MIXTO" && "bg-secondary text-muted-foreground",
          )}
        >
          {sesgo === "ALCISTA" ? <TrendingUp className="size-3" aria-hidden /> : null}
          {sesgo === "BAJISTA" ? <TrendingDown className="size-3" aria-hidden /> : null}
          {sesgo === "MIXTO" ? <Scale className="size-3" aria-hidden /> : null}
          {SESGO_LABELS[sesgo]}
        </span>
      </div>
      <p className="mt-1 leading-relaxed">{texto}</p>
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
