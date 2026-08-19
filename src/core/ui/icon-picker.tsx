"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * El icono de una ficha.
 *
 * Tus registros de sueño llevan 💤 y las piezas de contenido llevan emoji
 * propio; el importador los perdía y la app no tenía dónde guardarlos. No es
 * decoración: es lo que hace que reconozcas una fila de una lista sin llegar
 * a leerla.
 *
 * La rejilla es corta y está escrita a mano en lugar de ser el teclado de
 * emoji entero. Nadie recorre mil setecientos emoji para elegir uno, y las
 * bibliotecas que lo pintan bien pesan más que todo este módulo junto. El
 * campo de texto de al lado acepta cualquiera pegado, que es la válvula de
 * escape para los que no están.
 */

const SUGGESTIONS = [
  "📝", "✅", "🎯", "🔥", "⭐", "💡", "📌", "🗓️",
  "💤", "🌙", "☀️", "🛌", "🧘", "💪", "🚿", "🦷",
  "📚", "🎬", "🎥", "🎙️", "📷", "🎞️", "✂️", "🖥️",
  "🍽️", "🥗", "🍳", "☕", "🛒", "💰", "📈", "🐳",
];

export function IconPicker({
  name,
  defaultValue,
  label = "Icono",
}: {
  /** El nombre del campo en el formulario. */
  name: string;
  defaultValue?: string | null;
  label?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border text-xl transition-colors hover:bg-muted"
        >
          {value || <span className="text-xs text-muted-foreground">＋</span>}
        </button>

        <input type="hidden" name={name} value={value} />

        {value ? (
          <button
            type="button"
            onClick={() => setValue("")}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Quitar
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="flex flex-wrap gap-1 rounded-md border border-border p-2">
          {SUGGESTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                setValue(emoji);
                setOpen(false);
              }}
              aria-label={`Usar ${emoji}`}
              className={cn(
                "flex size-8 items-center justify-center rounded transition-colors hover:bg-muted",
                value === emoji && "bg-muted",
              )}
            >
              {emoji}
            </button>
          ))}
          <input
            type="text"
            value={value}
            onChange={(event) => setValue([...event.target.value].slice(0, 2).join(""))}
            placeholder="o pega uno"
            aria-label="Pegar un icono"
            className="ml-1 w-24 rounded border border-border bg-transparent px-2 text-sm"
          />
        </div>
      ) : null}
    </div>
  );
}
