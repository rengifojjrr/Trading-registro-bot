"use client";

import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Los filtros de la tabla de bots.
 *
 * Con dieciocho bots y creciendo, la tabla dejó de contestar la pregunta que
 * se le hace de verdad. Nadie mira esa lista para leerla entera: se mira para
 * saber cuál está perdiendo, cuál tiene una posición abierta ahora mismo, o
 * cómo va la familia de scalping frente a la de posición. Eso, en una tabla
 * sin filtros, se hace a ojo y con el dedo en la pantalla.
 *
 * Son cuatro cosas y una ordenación, no un panel de búsqueda avanzada: con
 * dieciocho filas, más opciones cuestan más de las que ahorran. Todos los
 * filtros son de una sola opción y todos tienen «Todos», porque el estado al
 * que siempre hay que poder volver en un toque es el de verlo todo.
 */

export type Estado = "TODOS" | "ENCENDIDOS" | "APAGADOS";
export type Resultado = "TODOS" | "GANANDO" | "PERDIENDO" | "EN_MERCADO";
export type Orden = "PNL" | "PATRIMONIO" | "OPERACIONES" | "NOMBRE";

export interface FiltrosDeBots {
  texto: string;
  familia: string;
  estado: Estado;
  resultado: Resultado;
  orden: Orden;
}

export const FILTROS_VACIOS: FiltrosDeBots = {
  texto: "",
  familia: "TODAS",
  estado: "TODOS",
  resultado: "TODOS",
  // Por P&L de partida: lo primero que se busca en esta tabla es quién va
  // peor, y ordenar por nombre lo esconde entre los que van bien.
  orden: "PNL",
};

export function sinFiltrar(filtros: FiltrosDeBots): boolean {
  return (
    filtros.texto.trim() === "" &&
    filtros.familia === "TODAS" &&
    filtros.estado === "TODOS" &&
    filtros.resultado === "TODOS"
  );
}

function Grupo<T extends string>({
  etiqueta,
  valor,
  opciones,
  onCambio,
}: {
  etiqueta: string;
  valor: T;
  opciones: { valor: T; texto: string }[];
  onCambio: (valor: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{etiqueta}</span>
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onCambio(o.valor)}
            aria-pressed={activa}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              activa
                ? "border-foreground/30 bg-accent font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

export function SimuladorFiltros({
  filtros,
  familias,
  onCambio,
  visibles,
  total,
}: {
  filtros: FiltrosDeBots;
  /** Las familias que de verdad hay entre los bots, con su rótulo. */
  familias: { valor: string; texto: string }[];
  onCambio: (filtros: FiltrosDeBots) => void;
  visibles: number;
  total: number;
}) {
  const poner = <K extends keyof FiltrosDeBots>(clave: K, valor: FiltrosDeBots[K]) =>
    onCambio({ ...filtros, [clave]: valor });

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filtros.texto}
            onChange={(e) => poner("texto", e.target.value)}
            placeholder="Buscar por nombre o mercado"
            aria-label="Buscar por nombre o mercado"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <Grupo
          etiqueta="Orden"
          valor={filtros.orden}
          onCambio={(v) => poner("orden", v)}
          opciones={[
            { valor: "PNL", texto: "P&L" },
            { valor: "PATRIMONIO", texto: "Patrimonio" },
            { valor: "OPERACIONES", texto: "Operaciones" },
            { valor: "NOMBRE", texto: "Nombre" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {familias.length > 1 ? (
          <Grupo
            etiqueta="Familia"
            valor={filtros.familia}
            onCambio={(v) => poner("familia", v)}
            opciones={[{ valor: "TODAS", texto: "Todas" }, ...familias]}
          />
        ) : null}

        <Grupo
          etiqueta="Estado"
          valor={filtros.estado}
          onCambio={(v) => poner("estado", v)}
          opciones={[
            { valor: "TODOS", texto: "Todos" },
            { valor: "ENCENDIDOS", texto: "Encendidos" },
            { valor: "APAGADOS", texto: "Apagados" },
          ]}
        />

        <Grupo
          etiqueta="Cómo va"
          valor={filtros.resultado}
          onCambio={(v) => poner("resultado", v)}
          opciones={[
            { valor: "TODOS", texto: "Todos" },
            { valor: "GANANDO", texto: "Ganando" },
            { valor: "PERDIENDO", texto: "Perdiendo" },
            { valor: "EN_MERCADO", texto: "Con posición" },
          ]}
        />
      </div>

      {sinFiltrar(filtros) ? null : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span aria-live="polite">
            {visibles} de {total} {total === 1 ? "bot" : "bots"}
          </span>
          <button
            type="button"
            onClick={() => onCambio({ ...FILTROS_VACIOS, orden: filtros.orden })}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 transition-colors hover:border-solid hover:bg-accent/50 hover:text-foreground"
          >
            <X className="size-3" aria-hidden />
            Quitar filtros
          </button>
        </div>
      )}
    </div>
  );
}
