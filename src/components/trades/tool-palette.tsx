"use client";

import { useEffect, useRef, useState } from "react";

import { ToolIcon } from "@/components/trades/tool-icon";
import { renderPreview } from "@/lib/charts/preview";
import { GROUP_LABELS, toolsByGroup, TOOL_BY_ID, type ToolGroup, type ToolId } from "@/lib/charts/tools";
import { cn } from "@/lib/utils";

/**
 * La barra de herramientas, por familias y con iconos.
 *
 * Antes eran cuarenta y seis líneas de texto en un desplegable. Elegir un
 * retroceso de Fibonacci era abrir, leer una lista y acertar con el nombre;
 * ahora es reconocer un dibujo. Las familias se pliegan porque cuarenta y seis
 * iconos a la vez tampoco se leen: se abre la que estás usando y el resto se
 * queda a un clic.
 *
 * Al pasar por encima sale la miniatura en grande con el nombre y qué hace,
 * que es lo que convierte «Horquilla de Andrews» en algo que se entiende sin
 * haberla usado nunca.
 */
export function ToolPalette({
  active,
  onSelect,
}: {
  active: ToolId | null;
  onSelect: (tool: ToolId) => void;
}) {
  const grupos = toolsByGroup();

  // La familia abierta es la de la herramienta activa, o líneas -- que es el
  // 80% del uso -- cuando no hay ninguna.
  const [abierta, setAbierta] = useState<ToolGroup>(
    active ? TOOL_BY_ID[active].group : "LINEAS",
  );
  const [encima, setEncima] = useState<ToolId | null>(null);

  const visible = grupos.find((g) => g.group === abierta) ?? grupos[0];

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Familias de herramientas">
        {grupos.map((grupo) => {
          const seleccionada = grupo.group === abierta;
          // Un punto en la pestaña de la familia que tiene la herramienta
          // activa: si está plegada, sin esto no hay forma de saber dónde
          // está lo que tienes puesto.
          const contieneActiva = active !== null && TOOL_BY_ID[active].group === grupo.group;

          return (
            <button
              key={grupo.group}
              type="button"
              role="tab"
              aria-selected={seleccionada}
              onClick={() => setAbierta(grupo.group)}
              className={cn(
                "relative rounded px-2 py-1 text-[11px] font-medium transition-colors",
                seleccionada
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {GROUP_LABELS[grupo.group]}
              {contieneActiva && !seleccionada ? (
                <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-primary" />
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-wrap gap-0.5 rounded-md border border-border bg-secondary/40 p-1"
        role="group"
        aria-label={`Herramientas de ${GROUP_LABELS[visible.group].toLowerCase()}`}
      >
        {visible.tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            aria-label={tool.label}
            aria-pressed={active === tool.id}
            title={`${tool.label} — ${tool.hint}`}
            onClick={() => onSelect(tool.id)}
            onPointerEnter={() => setEncima(tool.id)}
            onPointerLeave={() => setEncima((t) => (t === tool.id ? null : t))}
            onFocus={() => setEncima(tool.id)}
            onBlur={() => setEncima((t) => (t === tool.id ? null : t))}
            className={cn(
              "rounded p-1.5 transition-colors",
              active === tool.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <ToolIcon tool={tool.id} size={20} />
          </button>
        ))}
      </div>

      {encima ? <ToolPreviewCard tool={encima} /> : null}
    </div>
  );
}

/** La miniatura en grande, con el nombre y para qué sirve. */
function ToolPreviewCard({ tool }: { tool: ToolId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const meta = TOOL_BY_ID[tool];
  const W = 96;
  const H = 64;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    renderPreview(ctx, tool, W, H);
  }, [tool]);

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
      <canvas
        ref={ref}
        style={{ width: W, height: H }}
        className="shrink-0 rounded bg-secondary/40"
        aria-hidden
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-medium">{meta.label}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">{meta.hint}</span>
      </div>
    </div>
  );
}
