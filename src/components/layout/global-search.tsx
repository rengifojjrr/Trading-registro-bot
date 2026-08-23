"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { KIND_LABELS, type RankedResult } from "@/lib/search/rank";
import { searchEverything } from "@/lib/search/query";

/**
 * Buscar en toda la aplicación desde cualquier página.
 *
 * Había siete módulos con su propio filtro y ninguna forma de contestar «¿dónde
 * apunté aquello del retroceso?» sin abrirlos uno a uno. Esto no añade datos:
 * hace que los que ya hay se puedan encontrar, que es lo que separa un archivo
 * de un montón.
 *
 * Busca cosas y páginas a la vez a propósito -- escribir «drawdown» lleva a
 * Riesgo aunque la página no se llame así, y eso evita tener que aprenderse el
 * menú.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RankedResult[]>([]);
  const [active, setActive] = useState(0);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Cerrar limpia lo escrito: abrir el buscador y encontrarse la búsqueda de
  // ayer obliga a borrarla antes de empezar, todas las veces.
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setActive(0);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else setOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    // Medio segundo de espera: sin esto cada tecla lanza una consulta y las
    // respuestas llegan desordenadas, así que la lista parpadea con resultados
    // de lo que escribiste hace dos letras.
    const timer = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchEverything(query));
        setActive(0);
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [query, open]);

  function go(result: RankedResult) {
    close();
    router.push(result.href);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar en todo"
        className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="hidden rounded border border-border px-1 text-[10px] sm:inline">⌘K</kbd>
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/80 p-4 pt-[10vh]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en todo"
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          {isPending ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Operaciones, notas, estrategias, páginas…"
            aria-label="Qué buscar"
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                go(results[active]);
              }
            }}
          />
        </div>

        {query.trim().length >= 2 && results.length === 0 && !isPending ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Nada encaja con «{query.trim()}».
          </p>
        ) : null}

        {results.length > 0 ? (
          <ul className="max-h-[50vh] overflow-y-auto py-1">
            {results.map((result, index) => (
              <li key={`${result.kind}-${result.id}`}>
                <button
                  type="button"
                  onClick={() => go(result)}
                  onMouseEnter={() => setActive(index)}
                  aria-current={index === active}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${
                    index === active ? "bg-muted" : ""
                  }`}
                >
                  <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                    {KIND_LABELS[result.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{result.title}</span>
                  {result.subtitle ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{result.subtitle}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          ↑↓ para moverte · Enter para abrir · Esc para cerrar
        </p>
      </div>
    </div>
  );
}
