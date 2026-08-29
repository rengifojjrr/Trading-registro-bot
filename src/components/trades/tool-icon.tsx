"use client";

import { useEffect, useRef } from "react";

import { renderPreview } from "@/lib/charts/preview";
import type { ToolId } from "@/lib/charts/tools";

/**
 * El icono de una herramienta: la herramienta misma, dibujada pequeña.
 *
 * No es un SVG a mano. Es `buildShape` + `renderShape`, los mismos que pintan
 * el gráfico, sobre un lienzo de veinte píxeles. Así el icono no puede mentir:
 * si mañana la horquilla de Andrews cambia de forma, su icono cambia con ella,
 * en vez de quedarse enseñando la forma de antes hasta que alguien se acuerde.
 */
export function ToolIcon({
  tool,
  size = 20,
  color,
  className,
}: {
  tool: ToolId;
  size?: number;
  color?: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // `currentColor` no existe en canvas, así que se resuelve leyendo el color
    // que el CSS le ha dado al propio lienzo. De ese modo el icono sigue al
    // estado del botón -- apagado, encima, pulsado -- sin pasarle nada.
    const resuelto = color ?? getComputedStyle(canvas).color;
    renderPreview(ctx, tool, size, size, { color: resuelto });
  }, [tool, size, color]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
