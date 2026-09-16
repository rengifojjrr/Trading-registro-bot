"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Grafico, type TradeChartDrawing } from "@/components/charts/grafico";
import { GRANULARITY_SECONDS } from "@/lib/analytics/chart-window";
import { parseDrawingPoints, parseDrawingStyle } from "@/lib/chart-drawings";
import { rutaDeDibujos } from "@/lib/charts/fuente";
import type { CoinbaseCandleGranularity } from "@/lib/coinbase/types";
import { aggregateCandles, type ReactionCandle } from "@/lib/economic-calendar/market-reaction";

/**
 * Qué hizo el precio alrededor de la publicación.
 *
 * Empezó siendo un SVG fijo, luego un gráfico propio, y ahora **es el mismo
 * gráfico que el de una operación**. Eso era lo que faltaba: aquí se venía a
 * hacer justo lo que se hace mirando un gráfico -- medir el impulso, marcar el
 * rango, trazar la línea que el precio acabó respetando, poner una media -- y
 * éste era el único de la aplicación donde no se podía. Un gráfico sin
 * herramientas al lado de otro que sí las tiene no se lee como más sencillo, se
 * lee como roto.
 *
 * Lo que este componente añade sobre el gráfico común es sólo lo suyo: de dónde
 * salen sus dibujos y con qué tamaño de vela abre.
 */

/**
 * En qué temporalidad se abre.
 *
 * **No en un minuto**, que es como estaba y era el problema: treinta velas
 * antes y setenta después son hora y media de gráfico, y en hora y media de
 * velas de un minuto no se aprecia la reacción a una noticia -- se ve el ruido
 * de dentro del movimiento, no el movimiento. En cinco minutos la misma
 * cantidad de velas cubre ocho horas, así que entran los cuatro plazos que se
 * miden (hasta cuatro horas) y se ve la forma entera: el golpe, si se deshizo,
 * y dónde acabó.
 *
 * No cuesta una petición. El servidor ya trae las velas de un minuto --las
 * necesita para medir con precisión-- y de ellas salen las de cinco juntándolas
 * aquí.
 */
const TEMPORALIDAD_INICIAL: CoinbaseCandleGranularity = "FIVE_MINUTE";

/** Lo guardado, filtrando lo que ya no se sabe pintar. */
function aDibujos(filas: unknown): TradeChartDrawing[] {
  if (!Array.isArray(filas)) return [];
  return filas.flatMap((fila) => {
    const f = fila as { id?: unknown; tool?: unknown; points?: unknown; style?: unknown; color?: unknown };
    if (typeof f.id !== "string" || typeof f.tool !== "string") return [];
    const points = parseDrawingPoints(f.tool, f.points);
    const style = parseDrawingStyle(f.tool, f.style);
    // Un dibujo de una herramienta retirada no se sabe pintar, y colarlo
    // dejaría el gráfico a medias sin decir nada.
    if (!points || !style) return [];
    return [
      {
        id: f.id,
        tool: f.tool as TradeChartDrawing["tool"],
        points,
        style,
        color: typeof f.color === "string" ? f.color : style.color,
      },
    ];
  });
}

export function ReactionChart({
  eventId,
  eventAt,
  productId,
  timezone,
  initialCandles,
  horizonMinutes,
}: {
  /** De quién son los dibujos que se hagan encima. */
  eventId: string;
  eventAt: string;
  productId: string;
  /** Para que las horas del eje digan lo mismo que la tabla de al lado. */
  timezone: string;
  /** Las de un minuto que ya trajo el servidor, para pintar sin esperar. */
  initialCandles: ReactionCandle[];
  /** El plazo que miden las cifras de debajo: se marca en el gráfico. */
  horizonMinutes: number;
}) {
  const t0 = Math.floor(new Date(eventAt).getTime() / 1000);
  const fuente = { tipo: "evento" as const, id: eventId, t0 };

  /**
   * Los dibujos de esta publicación.
   *
   * Se piden aquí y no en el servidor porque la sección cambia de publicación
   * sin recargar la página: para cuando se elige la segunda, el servidor ya
   * terminó su trabajo.
   *
   * Y el gráfico no se monta hasta que están. `Grafico` los recibe como estado
   * inicial y a partir de ahí manda él, así que montarlo con la lista vacía y
   * rellenarla después no los pintaría nunca.
   */
  const [dibujos, setDibujos] = useState<TradeChartDrawing[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        // El `t0` no entra en la ruta, pero la fuente es la que sabe cuál es la
        // ruta de cada dueño y eso es lo que evita dos formas de escribirla.
        const res = await fetch(rutaDeDibujos({ tipo: "evento", id: eventId, t0 }));
        const data = (await res.json()) as { drawings?: unknown };
        if (vivo) setDibujos(aDibujos(data.drawings));
      } catch {
        // Sin dibujos el gráfico sigue sirviendo para todo lo demás.
        if (vivo) setDibujos([]);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [eventId, t0]);

  if (dibujos === null) {
    return (
      <div className="flex h-[360px] w-full items-center justify-center rounded-lg border border-border">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="cargando el gráfico" />
      </div>
    );
  }

  return (
    <Grafico
      fuente={fuente}
      productId={productId}
      // Las que llegan del servidor son siempre de un minuto; se juntan al
      // tamaño con el que se abre.
      initialCandles={aggregateCandles(
        initialCandles,
        GRANULARITY_SECONDS[TEMPORALIDAD_INICIAL] / 60,
      ).map((c) => ({ ...c, volume: c.volume ?? 0 }))}
      initialGranularity={TEMPORALIDAD_INICIAL}
      initialDrawings={dibujos}
      evento={{ horizonMinutes }}
      timezone={timezone}
    />
  );
}
