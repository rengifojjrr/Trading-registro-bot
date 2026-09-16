"use client";

import { Loader2 } from "lucide-react";
import { useRef, useState } from "react";

import { ReactionChart } from "@/components/economic-calendar/reaction-chart";
import { InfoHint } from "@/components/shared/info-hint";
import { ScrollableTable } from "@/components/shared/scrollable-table";
import { formatEventValue, surpriseOf, type Surprise } from "@/lib/economic-calendar/format";
import {
  DEFAULT_HORIZON,
  formatAbsPct,
  formatHorizonLabel,
  formatSignedPct,
  horizonOf,
  HORIZONS,
  type HorizonMinutes,
  type MarketReaction,
  type ReactionCandle,
} from "@/lib/economic-calendar/market-reaction";
import type { CalendarEvent } from "@/lib/economic-calendar/queries";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * «Cómo reaccionó el mercado», entero y sin recargar.
 *
 * Antes cada publicación y cada plazo eran un enlace: cambiar de una a otra
 * recargaba la página y te devolvía arriba del todo, de modo que comparar dos
 * publicaciones -- que es justo para lo que sirve esta sección -- costaba dos
 * viajes y dos vueltas a bajar con la rueda. Ahora todo es estado de aquí: se
 * mueve el gráfico y nada más.
 *
 * También había tres selectores que parecían el mismo. Quedan dos, y cada uno
 * junto a lo que cambia:
 *
 * - **Medir a** (15 min … 4 h): cuánto tiempo después del dato se mide. Manda
 *   sobre la columna de la lista, sobre la marca del gráfico y sobre qué
 *   columna de la tabla va resaltada.
 * - **Velas de** (1 min … 1 h): el tamaño de vela del gráfico, que es cosa del
 *   dibujo y no de la medida. Vive dentro del gráfico, que es lo que cambia.
 */

export interface Medicion {
  event: CalendarEvent;
  reaction: MarketReaction | null;
}

/** Qué publicación está dibujada abajo, con sus velas. Las dos cosas juntas a propósito. */
interface Dibujada {
  id: string;
  candles: ReactionCandle[];
}

/** La ventana que trae el servidor para cada publicación, en minutos. */
const ANTES_MIN = 30;
const DESPUES_MIN = 270;

export function MarketReactionSection({
  mediciones,
  initialCandles,
  productId,
  timezone,
  currentEventId,
}: {
  mediciones: Medicion[];
  /** Las velas de la primera publicación, ya traídas por el servidor. */
  initialCandles: ReactionCandle[];
  productId: string;
  timezone: string;
  /** Cuál de la lista es el dato que se está mirando, si ya salió. */
  currentEventId: string;
}) {
  const primera = mediciones[0] ?? null;

  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(primera?.event.id ?? null);
  // Lo de abajo cambia de golpe, cuando las velas están: si se cambiara la
  // publicación antes que sus velas, durante un instante la cabecera diría
  // una fecha y el gráfico enseñaría otra.
  const [dibujada, setDibujada] = useState<Dibujada | null>(
    primera ? { id: primera.event.id, candles: initialCandles } : null,
  );
  const [horizon, setHorizon] = useState<HorizonMinutes>(DEFAULT_HORIZON);
  const [cargando, setCargando] = useState(false);

  // Las velas de la primera vienen del servidor; las demás se piden al
  // elegirlas. Se guarda lo ya traído para que volver a una publicación que
  // ya miraste sea instantáneo, que es justo lo que se hace al comparar.
  const cacheRef = useRef<Map<string, ReactionCandle[]>>(
    new Map(primera ? [[primera.event.id, initialCandles]] : []),
  );
  const peticionRef = useRef(0);

  // La carga cuelga del clic y no de un efecto: lo que la dispara es una
  // persona eligiendo, no el componente renderizándose.
  function elegir(id: string) {
    if (id === seleccionadaId) return;
    setSeleccionadaId(id);

    const guardadas = cacheRef.current.get(id);
    if (guardadas) {
      // Un número de petición nuevo invalida la que estuviera en vuelo: si no,
      // al volver a una ya vista mientras carga otra, la respuesta tardía la
      // pisaría.
      peticionRef.current += 1;
      setCargando(false);
      setDibujada({ id, candles: guardadas });
      return;
    }

    const medicion = mediciones.find((m) => m.event.id === id);
    if (!medicion) return;

    const mia = ++peticionRef.current;
    setCargando(true);

    void (async () => {
      try {
        const at = new Date(medicion.event.occursAt).getTime() / 1000;
        const params = new URLSearchParams({
          granularity: "ONE_MINUTE",
          start: String(Math.floor(at - ANTES_MIN * 60)),
          end: String(Math.floor(at + DESPUES_MIN * 60)),
          productId,
        });
        const res = await fetch(`/api/economic-calendar/candles?${params}`);
        const data = (await res.json()) as { candles: ReactionCandle[] | null };
        if (peticionRef.current !== mia) return;
        if (data.candles && data.candles.length > 0) {
          cacheRef.current.set(id, data.candles);
          setDibujada({ id, candles: data.candles });
        }
      } catch {
        // Se queda el gráfico anterior. Es contexto, no una cifra.
      } finally {
        if (peticionRef.current === mia) setCargando(false);
      }
    })();
  }

  if (mediciones.length === 0) return null;

  const mostrada = dibujada ? (mediciones.find((m) => m.event.id === dibujada.id) ?? null) : null;

  return (
    <div className="flex flex-col gap-5">
      {/* El único selector de plazo de toda la sección. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Medir a</span>
        {HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setHorizon(h)}
            aria-pressed={horizon === h}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition-colors",
              horizon === h
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {formatHorizonLabel(h)}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-1">
        {mediciones.map((m) => (
          <FilaMedicion
            key={m.event.id}
            medicion={m}
            horizon={horizon}
            timezone={timezone}
            seleccionada={seleccionadaId === m.event.id}
            cargando={cargando && seleccionadaId === m.event.id}
            esEsta={m.event.id === currentEventId}
            onSelect={elegir}
          />
        ))}
      </ul>

      {dibujada && mostrada ? (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-3 transition-opacity",
            // Mientras llegan las velas de otra publicación, lo de abajo sigue
            // siendo lo anterior: se atenúa para que se lea como algo que está
            // a punto de cambiar y no como la respuesta al clic que acabas de
            // dar.
            cargando && "opacity-60",
          )}
        >
          <p className="text-sm font-medium">
            {formatDateTime(mostrada.event.occursAt, timezone)}
            {mostrada.event.period ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                · dato de {mostrada.event.period}
              </span>
            ) : null}
          </p>

          <ReactionChart
            key={dibujada.id}
            eventId={mostrada.event.id}
            eventAt={mostrada.event.occursAt}
            productId={productId}
            timezone={timezone}
            initialCandles={dibujada.candles}
            horizonMinutes={horizon}
          />

          {mostrada.reaction ? (
            <TablaPlazos reaction={mostrada.reaction} horizon={horizon} onSelect={setHorizon} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Los cuatro plazos de la publicación elegida.
 *
 * Leer la fila de «acabó» de izquierda a derecha cuenta la historia: si el
 * golpe fue inmediato y se deshizo, si tardó en arrancar, o si se dio la
 * vuelta. Las cabeceras también eligen plazo, como atajo desde donde se está
 * mirando.
 */
function TablaPlazos({
  reaction,
  horizon,
  onSelect,
}: {
  reaction: MarketReaction;
  horizon: HorizonMinutes;
  onSelect: (h: HorizonMinutes) => void;
}) {
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
            <th className="px-2 py-1.5 text-left font-normal" />
            {HORIZONS.map((h) => (
              <th key={h} className="px-1 py-1 text-right font-normal">
                <button
                  type="button"
                  onClick={() => onSelect(h)}
                  aria-pressed={h === horizon}
                  className={cn(
                    "w-full rounded px-2 py-1 text-right tabular-nums transition-colors hover:bg-accent hover:text-foreground",
                    h === horizon && "font-medium text-foreground",
                  )}
                >
                  {formatHorizonLabel(h)}
                </button>
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
                      "px-3 py-1.5 text-right tabular-nums",
                      h === horizon && "bg-primary/5 font-medium",
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
  horizon,
  timezone,
  seleccionada,
  cargando,
  esEsta,
  onSelect,
}: {
  medicion: Medicion;
  horizon: HorizonMinutes;
  timezone: string;
  seleccionada: boolean;
  cargando: boolean;
  esEsta: boolean;
  onSelect: (id: string) => void;
}) {
  const { event, reaction } = medicion;
  const sorpresa = surpriseOf(event.actual, event.forecast);
  const medida = reaction ? horizonOf(reaction, horizon) : null;

  return (
    <li>
      {/* Un botón y no un enlace: cambiar de publicación mueve el gráfico, no
          navega. Con un enlace, cada comparación devolvía la página arriba. */}
      <button
        type="button"
        onClick={() => onSelect(event.id)}
        aria-pressed={seleccionada}
        className={cn(
          "flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-left text-sm transition-colors",
          seleccionada
            ? "border-primary/40 bg-primary/5"
            : "border-transparent hover:border-border hover:bg-accent/40",
        )}
      >
        <span className={cn("shrink-0", seleccionada ? "font-medium" : "text-muted-foreground")}>
          {formatDateTime(event.occursAt, timezone)}
        </span>

        {event.period ? (
          <span className="shrink-0 text-xs text-muted-foreground">{event.period}</span>
        ) : null}

        {esEsta ? (
          <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
            esta
          </span>
        ) : null}

        <span className="flex min-w-0 items-baseline gap-1.5 text-xs tabular-nums text-muted-foreground">
          <span>prev. {formatEventValue(event.forecast, event.unit, event.scale)} →</span>
          <span className="font-medium text-foreground">
            {formatEventValue(event.actual, event.unit, event.scale)}
          </span>
          <ChipSorpresa sorpresa={sorpresa} />
        </span>

        {/* Lo que mueve el precio va a la derecha del todo, donde se puede leer
            la columna entera de un vistazo y comparar publicaciones. */}
        <span className="ml-auto flex shrink-0 items-baseline gap-2 text-xs tabular-nums">
          {cargando ? (
            <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-label="cargando" />
          ) : null}
          {medida && medida.changePct !== null ? (
            <>
              <span className="text-muted-foreground">
                movió <span className="font-medium text-foreground">{formatAbsPct(medida.maxMovePct)}</span>
              </span>
              <span
                className={cn(
                  "w-16 text-right font-medium",
                  medida.changePct > 0 && "text-positive",
                  medida.changePct < 0 && "text-negative",
                )}
              >
                {formatSignedPct(medida.changePct)}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">
              {reaction ? `sin velas a ${formatHorizonLabel(horizon)}` : "sin velas"}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

/**
 * Si el dato salió por encima, por debajo o clavado.
 *
 * Es la mitad de la explicación de por qué el precio hizo lo que hizo: el
 * mercado no reacciona al nivel del dato sino a la distancia con lo previsto,
 * así que una fila con una sorpresa grande y otra sin sorpresa no son
 * comparables aunque el movimiento se parezca.
 */
function ChipSorpresa({ sorpresa }: { sorpresa: Surprise | null }) {
  if (!sorpresa) return null;
  if (sorpresa.direction === "EN_LINEA") {
    return <span className="rounded bg-secondary px-1 text-[10px] text-muted-foreground">en línea</span>;
  }
  return (
    <span className="rounded bg-warning/15 px-1 text-[10px] font-medium text-warning">
      {sorpresa.direction === "ARRIBA" ? "↑ sorpresa" : "↓ sorpresa"}
    </span>
  );
}
