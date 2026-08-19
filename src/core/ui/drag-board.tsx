"use client";

import { useState, type DragEvent, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Un tablero en el que las tarjetas se arrastran a cualquier columna.
 *
 * El tablero de contenido sólo tenía un botón «siguiente estado»: no se podía
 * devolver una pieza de «Editando» a «Falta grabar» ni saltarse un paso cuando
 * algo salía mejor de lo previsto. Diez estados en fila y un solo movimiento
 * posible convierten el tablero en una cinta transportadora.
 *
 * Se usa la API de arrastre del navegador en lugar de una biblioteca: son
 * cuatro manejadores, y las bibliotecas de arrastre pesan más que este módulo
 * entero. Lo que sí hace falta es una alternativa de teclado, y por eso cada
 * tarjeta lleva además su propio menú de «mover a» -- arrastrar con el teclado
 * no existe, y sin ese menú el tablero sería inaccesible.
 */

export interface BoardColumn<T> {
  id: string;
  label: string;
  items: T[];
}

export function DragBoard<T>({
  columns,
  itemId,
  renderItem,
  onMove,
  colorToken,
  emptyLabel = "Nada aquí.",
}: {
  columns: BoardColumn<T>[];
  itemId: (item: T) => string;
  renderItem: (item: T, column: BoardColumn<T>) => ReactNode;
  /** Se llama al soltar en otra columna. */
  onMove: (id: string, toColumn: string) => void;
  colorToken: string;
  emptyLabel?: string;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  function handleDrop(event: DragEvent<HTMLDivElement>, columnId: string) {
    event.preventDefault();
    setOver(null);

    // Se lee del evento y no del estado: si el arrastre viene de otra ventana
    // el estado local está vacío, y quedarse sin hacer nada sería peor que
    // intentarlo.
    const id = event.dataTransfer.getData("text/plain") || dragging;
    setDragging(null);
    if (id) onMove(id, columnId);
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex gap-3">
        {columns.map((column) => (
          <div
            key={column.id}
            onDragOver={(event) => {
              event.preventDefault();
              setOver(column.id);
            }}
            onDragLeave={() => setOver((current) => (current === column.id ? null : current))}
            onDrop={(event) => handleDrop(event, column.id)}
            className={cn(
              "flex w-64 shrink-0 flex-col gap-2 rounded-lg border p-3 transition-colors",
              over === column.id ? "border-transparent bg-muted" : "border-border",
            )}
            style={over === column.id ? { outline: `2px solid var(${colorToken})` } : undefined}
          >
            <h3 className="flex items-center justify-between gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {column.label}
              <span className="tabular-nums">{column.items.length}</span>
            </h3>

            {column.items.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">{emptyLabel}</p>
            ) : (
              column.items.map((item) => {
                const id = itemId(item);
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.setData("text/plain", id);
                      event.dataTransfer.effectAllowed = "move";
                      setDragging(id);
                    }}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    className={cn(
                      "cursor-grab active:cursor-grabbing",
                      dragging === id && "opacity-40",
                    )}
                  >
                    {renderItem(item, column)}
                  </div>
                );
              })
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * El menú «mover a» de una tarjeta.
 *
 * Es la vía accesible del tablero: arrastrar no existe con teclado ni con
 * lector de pantalla, así que sin esto la mitad de la función sería
 * inalcanzable. También es más rápido que arrastrar cuando el destino está
 * a seis columnas de distancia.
 */
export function MoveMenu({
  columns,
  currentColumn,
  onMove,
  label,
}: {
  columns: { id: string; label: string }[];
  currentColumn: string;
  onMove: (columnId: string) => void;
  label: string;
}) {
  return (
    <select
      value={currentColumn}
      onChange={(event) => {
        if (event.target.value !== currentColumn) onMove(event.target.value);
      }}
      aria-label={`Mover ${label} a otra columna`}
      className="h-7 max-w-full rounded border border-border bg-transparent px-1 text-xs text-muted-foreground"
    >
      {columns.map((column) => (
        <option key={column.id} value={column.id}>
          {column.label}
        </option>
      ))}
    </select>
  );
}
