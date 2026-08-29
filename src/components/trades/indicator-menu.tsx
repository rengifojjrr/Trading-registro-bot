"use client";

import { LineChart } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { INDICATORS, type IndicatorId } from "@/lib/charts/indicators";
import { cn } from "@/lib/utils";

/**
 * Los indicadores que se pintan, varios a la vez.
 *
 * Un desplegable de uno solo no vale: la mitad de las veces se quiere la EMA 9
 * **y** la EMA 21, que es justamente el cruce que se mira. Así que es una
 * lista de casillas, con el número de activos en el botón para saber que hay
 * algo puesto sin abrirla.
 *
 * Los de panel propio van separados de los que se pintan sobre las velas,
 * porque son dos cosas distintas: uno se superpone al precio y el otro se
 * lleva alto de pantalla.
 */
export function IndicatorMenu({
  active,
  onToggle,
}: {
  active: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
}) {
  const [open, setOpen] = useState(false);

  const sobrePrecio = INDICATORS.filter((i) => i.pane === "PRECIO");
  const enPanel = INDICATORS.filter((i) => i.pane === "PANEL");

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          aria-label={
            active.length > 0 ? `Indicadores, ${active.length} activos` : "Indicadores"
          }
        >
          <LineChart className="size-3.5" aria-hidden />
          Indicadores
          {active.length > 0 ? (
            <span className="rounded bg-primary px-1 text-[10px] font-medium text-primary-foreground tabular-nums">
              {active.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72 p-2">
        <Grupo titulo="Sobre las velas" indicadores={sobrePrecio} active={active} onToggle={onToggle} />
        <Grupo
          titulo="En su propio panel"
          indicadores={enPanel}
          active={active}
          onToggle={onToggle}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Grupo({
  titulo,
  indicadores,
  active,
  onToggle,
}: {
  titulo: string;
  indicadores: typeof INDICATORS;
  active: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-1">
      <DropdownMenuLabel className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {titulo}
      </DropdownMenuLabel>
      {indicadores.map((meta) => {
        const puesto = active.includes(meta.id);
        return (
          <button
            key={meta.id}
            type="button"
            role="checkbox"
            aria-checked={puesto}
            onClick={() => onToggle(meta.id)}
            className={cn(
              "flex items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
              puesto ? "bg-accent" : "hover:bg-accent/50",
            )}
          >
            <span
              aria-hidden
              className="mt-1 size-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: puesto ? `var(${meta.colorToken})` : "transparent",
                boxShadow: puesto ? "none" : `inset 0 0 0 1px var(--border)`,
              }}
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs font-medium">{meta.label}</span>
              <span className="text-[11px] leading-snug text-muted-foreground">{meta.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
