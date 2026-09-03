"use client";

import { useEffect, useRef } from "react";

import {
  computeIndicator,
  INDICATOR_BY_ID,
  type IndicatorId,
  type Vela,
} from "@/lib/charts/indicators";

/**
 * El panel de abajo: los indicadores que no van sobre el precio.
 *
 * El RSI se mueve entre 0 y 100 y el ATR en dólares. Ninguno de los dos cabe
 * en el eje del precio -- pintarlos ahí los deja como una raya pegada al borde
 * inferior -- así que tienen su propio panel, con su propia escala.
 *
 * Un lienzo por indicador y no uno compartido: el RSI quiere sus líneas de 30
 * y 70, y el ATR no; meterlos juntos obligaría a decidir de quién es la
 * escala, y la respuesta sería siempre «del otro».
 *
 * Comparte el rango de tiempo visible con el gráfico de arriba: si no, dos
 * gráficos alineados verticalmente enseñarían momentos distintos, que es peor
 * que no enseñar el segundo.
 */
export function IndicatorPane({
  indicators,
  candles,
  from,
  to,
}: {
  indicators: IndicatorId[];
  candles: Vela[];
  /** El primer y el último instante visibles arriba, para cuadrar los ejes. */
  from: number | null;
  to: number | null;
}) {
  const dePanel = indicators.filter((id) => INDICATOR_BY_ID[id].pane === "PANEL");
  if (dePanel.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      {dePanel.map((id) => (
        <PaneCanvas key={id} id={id} candles={candles} from={from} to={to} />
      ))}
    </div>
  );
}

const ALTO = 84;

function PaneCanvas({
  id,
  candles,
  from,
  to,
}: {
  id: IndicatorId;
  candles: Vela[];
  from: number | null;
  to: number | null;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const meta = INDICATOR_BY_ID[id];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ancho = canvas.parentElement?.clientWidth ?? 0;
    if (ancho === 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = ancho * dpr;
    canvas.height = ALTO * dpr;
    canvas.style.width = `${ancho}px`;
    canvas.style.height = `${ALTO}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, ALTO);

    const estilos = getComputedStyle(document.documentElement);
    const token = (nombre: string, respaldo: string) =>
      estilos.getPropertyValue(nombre).trim() || respaldo;

    const color = token(meta.colorToken, "#38bdf8");
    const borde = token("--border", "#1e293b");
    const texto = token("--muted-foreground", "#94a3b8");

    const sesionDe = (t: number) => String(Math.floor(t / 86400));
    const valores = computeIndicator(id, candles, sesionDe);

    // Sólo el tramo visible arriba: un panel que enseña tres meses debajo de
    // un gráfico que enseña dos días no está diciendo nada del gráfico.
    const visibles = candles
      .map((c, i) => ({ time: c.time, valor: valores[i] }))
      .filter(
        (p) =>
          p.valor !== null &&
          (from === null || p.time >= from) &&
          (to === null || p.time <= to),
      ) as { time: number; valor: number }[];

    if (visibles.length === 0) return;

    // El RSI se pinta siempre de 0 a 100 aunque los datos ocupen menos: es una
    // escala fija, y reescalarla haría que un tramo tranquilo pareciera
    // sobrecompra.
    //
    // Se comprueban los dos periodos y no sólo el de catorce. El RSI de dos
    // -- el de Connors -- es el que más tiempo pasa pegado a los extremos, así
    // que es justo al que peor le sienta que le reescalen el eje.
    const fijo = id === "RSI14" || id === "RSI2";
    const min = fijo ? 0 : Math.min(...visibles.map((p) => p.valor));
    const max = fijo ? 100 : Math.max(...visibles.map((p) => p.valor));
    const rango = max - min || 1;

    const margen = 6;
    const x = (i: number) => (i / Math.max(1, visibles.length - 1)) * ancho;
    const y = (v: number) => ALTO - margen - ((v - min) / rango) * (ALTO - margen * 2);

    // Las líneas de referencia del RSI: sin 30 y 70 el dibujo no dice nada.
    if (fijo) {
      ctx.strokeStyle = borde;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      for (const nivel of [30, 70]) {
        ctx.beginPath();
        ctx.moveTo(0, y(nivel));
        ctx.lineTo(ancho, y(nivel));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    visibles.forEach((p, i) => {
      if (i === 0) ctx.moveTo(x(i), y(p.valor));
      else ctx.lineTo(x(i), y(p.valor));
    });
    ctx.stroke();

    // El último valor, en texto: mirar la altura de una línea para saber si el
    // RSI está en 68 o en 72 no funciona.
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = texto;
    ctx.textBaseline = "top";
    ctx.fillText(meta.label, 6, 4);
    ctx.fillStyle = color;
    ctx.textAlign = "right";
    ctx.fillText(visibles.at(-1)!.valor.toFixed(2), ancho - 6, 4);
    ctx.textAlign = "left";
  }, [id, meta, candles, from, to]);

  return (
    <div className="relative w-full rounded-md border border-border bg-card">
      <canvas ref={ref} aria-label={`${meta.label}: ${meta.hint}`} role="img" />
    </div>
  );
}
