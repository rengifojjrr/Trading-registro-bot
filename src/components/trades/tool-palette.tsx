"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ToolIcon } from "@/components/trades/tool-icon";
import { renderPreview } from "@/lib/charts/preview";
import { GROUP_LABELS, toolsByGroup, TOOL_BY_ID, type ToolGroup, type ToolId } from "@/lib/charts/tools";
import { cn } from "@/lib/utils";

/**
 * La barra de herramientas, al lado del gráfico.
 *
 * Como en TradingView: una columna estrecha pegada a las velas, con un botón
 * por familia. El botón enseña la última herramienta que usaste de esa familia
 * y la vuelve a poner de un clic; la flechita abre la lista entera, con el
 * dibujo de cada una al lado de su nombre.
 *
 * Antes eran dos filas encima del gráfico -- pestañas de familia y una rejilla
 * de iconos -- que se comían el alto justo donde hace falta y, con siete
 * familias, se salían del ancho de la tarjeta. Puesta de canto no compite con
 * las velas por el sitio: al lado hay hueco de sobra y arriba no.
 *
 * En pantallas estrechas se tumba y vuelve a ser una fila: en un móvil, una
 * columna de cuarenta píxeles es una décima parte del ancho del gráfico.
 */
export function ToolPalette({
  active,
  onSelect,
}: {
  active: ToolId | null;
  onSelect: (tool: ToolId) => void;
}) {
  const grupos = toolsByGroup();

  /**
   * La herramienta que recuerda cada familia.
   *
   * Es lo que hace que el botón de la familia sirva de algo: se dibujan seis
   * retrocesos de Fibonacci seguidos, y tener que abrir la lista cada vez para
   * elegir el mismo de siempre convierte un clic en tres.
   */
  const [recordada, setRecordada] = useState<Partial<Record<ToolGroup, ToolId>>>(() =>
    active ? { [TOOL_BY_ID[active].group]: active } : {},
  );
  const [abierta, setAbierta] = useState<ToolGroup | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Cerrar la lista al pulsar fuera o con Escape: un panel flotante que sólo
  // se cierra pulsando el mismo botón se queda abierto tapando el gráfico.
  useEffect(() => {
    if (abierta === null) return;

    const fuera = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierta(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierta(null);
    };

    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierta]);

  const abiertaVisible = grupos.find((g) => g.group === abierta) ?? null;

  function elegir(tool: ToolId) {
    setRecordada((r) => ({ ...r, [TOOL_BY_ID[tool].group]: tool }));
    setAbierta(null);
    onSelect(tool);
  }

  return (
    <div
      ref={ref}
      // Sin borde ni fondo propios: el carril entero es una sola caja, y esta
      // es una de sus tres secciones. Dos recuadros pegados uno debajo de otro
      // se leen como dos barras distintas.
      className="relative flex flex-row flex-wrap gap-0.5 sm:flex-col sm:flex-nowrap"
      role="group"
      aria-label="Herramientas de dibujo"
    >
      {grupos.map((grupo) => {
        const porDefecto = recordada[grupo.group] ?? grupo.tools[0].id;
        const contieneActiva = active !== null && TOOL_BY_ID[active].group === grupo.group;
        // La activa manda sobre la recordada: si vienes de una vista guardada
        // con una herramienta puesta, el botón tiene que enseñar ésa.
        const mostrada = contieneActiva ? active : porDefecto;

        return (
          <div key={grupo.group} className="relative">
            <button
              type="button"
              aria-label={`${GROUP_LABELS[grupo.group]}: ${TOOL_BY_ID[mostrada].label}`}
              aria-pressed={contieneActiva}
              title={`${TOOL_BY_ID[mostrada].label} — ${TOOL_BY_ID[mostrada].hint}`}
              onClick={() => elegir(mostrada)}
              className={cn(
                "flex size-8 items-center justify-center rounded transition-colors",
                contieneActiva
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <ToolIcon tool={mostrada} size={20} />
            </button>

            {/* Hermano y no hijo: un botón dentro de otro botón no es HTML
                válido, y el navegador lo desmonta por su cuenta de formas que
                no se pueden predecir. */}
            <button
              type="button"
              aria-label={`Ver las herramientas de ${GROUP_LABELS[grupo.group].toLowerCase()}`}
              aria-expanded={abierta === grupo.group}
              onClick={() => setAbierta((g) => (g === grupo.group ? null : grupo.group))}
              className={cn(
                "absolute bottom-0 right-0 flex size-3 items-center justify-center rounded-sm transition-colors",
                contieneActiva
                  ? "text-primary-foreground/70 hover:text-primary-foreground"
                  : "text-muted-foreground/50 hover:text-foreground",
              )}
            >
              <ChevronRight className="size-3 rotate-45" aria-hidden />
            </button>
          </div>
        );
      })}

      {/* La lista cuelga de la barra entera y no del botón que la abre.
          Colgada del botón, en el móvil -- donde la barra se tumba -- la de la
          última familia empezaba a 390 píxeles y se salía por la derecha de una
          pantalla de 420. Desde la barra, el borde de partida es siempre el
          mismo y siempre está dentro. */}
      {abiertaVisible ? (
        <ListaDeFamilia
          grupo={abiertaVisible.group}
          tools={abiertaVisible.tools}
          active={active}
          onPick={elegir}
        />
      ) : null}
    </div>
  );
}

/**
 * La lista de una familia, con el dibujo de cada herramienta al lado del
 * nombre.
 *
 * Con nombre y no sólo el icono: «horquilla de Andrews» y «canal paralelo» se
 * distinguen mal en veinte píxeles, y la miniatura sola obliga a adivinar.
 */
function ListaDeFamilia({
  grupo,
  tools,
  active,
  onPick,
}: {
  grupo: ToolGroup;
  tools: { id: ToolId; label: string; hint: string }[];
  active: ToolId | null;
  onPick: (tool: ToolId) => void;
}) {
  return (
    <div
      role="menu"
      aria-label={GROUP_LABELS[grupo]}
      // Encima de los lienzos de la librería, que se ponen z-index 1 y 2.
      // Debajo de la barra cuando está tumbada y al lado cuando está de canto:
      // la barra vive pegada a un borde, y hacia ese lado no cabe.
      className="absolute left-0 top-full z-30 mt-1 flex max-h-80 w-full flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg sm:left-full sm:top-0 sm:ml-1 sm:mt-0 sm:w-64"
    >
      <span className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {GROUP_LABELS[grupo]}
      </span>
      {tools.map((tool) => (
        <button
          key={tool.id}
          type="button"
          role="menuitem"
          onClick={() => onPick(tool.id)}
          className={cn(
            "flex items-center gap-2 rounded px-2 py-1.5 text-left transition-colors",
            active === tool.id ? "bg-accent" : "hover:bg-accent/60",
          )}
        >
          <Miniatura tool={tool.id} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">{tool.label}</span>
            <span className="truncate text-[10px] leading-tight text-muted-foreground">
              {tool.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/** El dibujo de la herramienta, hecho con el mismo motor que la pinta de verdad. */
function Miniatura({ tool }: { tool: ToolId }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 36;
  const H = 24;

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
    <canvas
      ref={ref}
      style={{ width: W, height: H }}
      className="shrink-0 rounded bg-secondary/60"
      aria-hidden
    />
  );
}
