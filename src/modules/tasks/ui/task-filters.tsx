"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { Route } from "next";

import { cn } from "@/lib/utils";
import {
  GROUPINGS,
  GROUPING_LABELS,
  RANGES,
  RANGE_LABELS,
  type TaskGrouping,
  type TaskRange,
} from "@/modules/tasks/domain/tasks";

/**
 * La ventana de tiempo y la agrupación.
 *
 * Son enlaces y no botones con estado: así la vista completa cabe en la URL,
 * se puede compartir, recargar y guardar con un nombre. Un desplegable con
 * estado local daría lo mismo en pantalla y no se podría guardar.
 */
export function TaskFilters({
  range,
  grouping,
}: {
  range: TaskRange;
  grouping: TaskGrouping;
}) {
  const pathname = usePathname();
  const params = useSearchParams();

  function hrefWith(key: string, value: string): Route {
    const next = new URLSearchParams(params.toString());
    // El valor por defecto se quita en lugar de escribirse: así «todas, por
    // urgencia» es la ruta desnuda y no una URL llena de parámetros que no
    // cambian nada.
    if (value === "TODO" || value === "URGENCIA") next.delete(key);
    else next.set(key, value);

    const query = next.toString();
    return (query ? `${pathname}?${query}` : pathname) as Route;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Row
        label="Cuándo"
        options={RANGES.map((value) => ({ value, label: RANGE_LABELS[value] }))}
        current={range}
        hrefWith={(value) => hrefWith("rango", value)}
      />
      <Row
        label="Agrupar"
        options={GROUPINGS.map((value) => ({ value, label: GROUPING_LABELS[value] }))}
        current={grouping}
        hrefWith={(value) => hrefWith("agrupar", value)}
      />
    </div>
  );
}

function Row({
  label,
  options,
  current,
  hrefWith,
}: {
  label: string;
  options: { value: string; label: string }[];
  current: string;
  hrefWith: (value: string) => Route;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {options.map((option) => {
        const active = option.value === current;
        return (
          <Link
            key={option.value}
            href={hrefWith(option.value)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-sm transition-colors",
              active
                ? "border-transparent font-medium text-mod-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            style={active ? { backgroundColor: "var(--mod-tasks)" } : undefined}
          >
            {option.label}
          </Link>
        );
      })}
    </div>
  );
}
