"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Selección múltiple sobre una lista cerrada, en forma de fichas.
 *
 * Vive en el núcleo porque casi todos los módulos tienen un campo así --
 * ánimo al despertar, géneros de un libro, categorías de una tarea,
 * plataformas de una publicación -- y porque en el móvil una fila de fichas
 * se toca mucho mejor que un desplegable con casillas.
 *
 * Envía un <input hidden> por opción marcada, así que el formulario funciona
 * con `formData.getAll(name)` sin JavaScript de por medio en el servidor.
 */
export function ChipGroup({
  name,
  options,
  defaultValue = [],
  accent,
}: {
  name: string;
  options: readonly string[];
  defaultValue?: string[];
  /** Custom property del módulo, p. ej. "--mod-sleep". */
  accent?: string;
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  function toggle(option: string) {
    setSelected((current) =>
      current.includes(option) ? current.filter((o) => o !== option) : [...current, option],
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {selected.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      {options.map((option) => {
        const on = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(option)}
            style={accent && on ? { borderColor: `var(${accent})`, color: `var(${accent})` } : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              on
                ? "border-primary bg-accent font-medium text-primary"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
