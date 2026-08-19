"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Route } from "next";

import { Input } from "@/components/ui/input";

/**
 * Buscar dentro de un módulo.
 *
 * El atajo `/` de la aplicación busca en la página un campo de búsqueda, y el
 * único que existía estaba en la tabla de operaciones: no había forma de
 * encontrar una tarea por su nombre ni una pieza por su título.
 *
 * El término va en la URL y no en un estado local, que es lo que permite que
 * una búsqueda se pueda guardar como vista, compartir y recargar. Se espera un
 * cuarto de segundo antes de navegar para no lanzar una consulta por tecla.
 */
export function SearchBox({
  placeholder = "Buscar…",
  paramName = "q",
}: {
  placeholder?: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get(paramName) ?? "";

  const [value, setValue] = useState(current);
  const [lastFromUrl, setLastFromUrl] = useState(current);

  // Si la URL cambia por fuera -- al pulsar una vista guardada, o al volver
  // atrás -- el campo tiene que seguirla, o enseñaría un término que ya no
  // filtra nada. Se ajusta durante el render y no en un efecto: un efecto que
  // llama a `setState` provoca un segundo render en cascada, y React avisa.
  if (lastFromUrl !== current) {
    setLastFromUrl(current);
    setValue(current);
  }

  useEffect(() => {
    if (value === current) return;

    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (value.trim() === "") next.delete(paramName);
      else next.set(paramName, value.trim());

      const query = next.toString();
      router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
    }, 250);

    return () => clearTimeout(timer);
  }, [value, current, params, pathname, paramName, router]);

  return (
    <div className="relative w-full max-w-xs">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-8 pr-8"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="Limpiar la búsqueda"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
