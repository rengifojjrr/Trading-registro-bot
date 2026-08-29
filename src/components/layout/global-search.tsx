"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { SEARCH_EVENT } from "@/components/layout/search-event";

import { interpret } from "@/lib/search/interpret";
import { KIND_LABELS, type RankedResult } from "@/lib/search/rank";
import { pushRecent, readRecents, type RecentEntry } from "@/lib/search/recents";
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
  /**
   * Lo último que se abrió, para no enseñar un campo vacío.
   *
   * Se lee en el inicializador y no en un efecto: leer del navegador durante
   * el primer render del cliente es correcto y evita el parpadeo de pintar la
   * lista vacía antes de la de verdad.
   */
  const [recientes, setRecientes] = useState<RecentEntry[]>(() =>
    typeof window === "undefined" ? [] : readRecents(window.localStorage),
  );
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
    // Y desde la barra de abajo del móvil, donde no hay teclado que pulsar.
    const abrirDesdeFuera = () => setOpen(true);
    window.addEventListener(SEARCH_EVENT, abrirDesdeFuera);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener(SEARCH_EVENT, abrirDesdeFuera);
      window.removeEventListener("keydown", handleKeyDown);
    };
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
    // Se apunta antes de navegar, no después: al navegar este componente se
    // desmonta y lo de después no llegaría a correr.
    if (result.kind !== "action" && result.kind !== "page") {
      setRecientes(pushRecent(window.localStorage, result));
    }
    close();
    router.push(result.href);
  }

  /**
   * La interpretación de lo escrito: una fecha, una cifra, o texto.
   *
   * Derivada en el render y no en estado: depende sólo de lo escrito, y
   * guardarla en estado sería mantener dos copias de lo mismo que se pueden
   * desincronizar entre teclas.
   */
  const interpretacion = interpret(query, new Date().toISOString().slice(0, 10));

  /** Lo que ofrecer cuando el campo está vacío: lo último que se abrió. */
  const mostrarRecientes = query.trim() === "" && recientes.length > 0;

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

        {/* Una fecha o una cifra escritas se ofrecen como un salto directo,
            además de buscarse como texto. «12 de agosto» no es una palabra que
            aparezca en ninguna nota, y sin esto no encontraba nada. */}
        {interpretacion.kind !== "TEXTO" ? (
          <button
            type="button"
            onClick={() => {
              close();
              router.push(
                interpretacion.kind === "FECHA"
                  ? `/dia/${interpretacion.date}`
                  : `/trades?pnlMin=${interpretacion.amount}&pnlMax=${interpretacion.amount}`,
              );
            }}
            className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left text-sm hover:bg-muted"
          >
            <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-primary">
              {interpretacion.kind === "FECHA" ? "Ir al día" : "Importe"}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {interpretacion.kind === "FECHA"
                ? `Ver todo lo del ${interpretacion.label}`
                : `Buscar ${interpretacion.label} en las operaciones`}
            </span>
          </button>
        ) : null}

        {mostrarRecientes ? (
          <ul className="max-h-[50vh] overflow-y-auto py-1">
            <li className="px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Lo último que abriste
            </li>
            {recientes.map((reciente) => (
              <li key={`${reciente.kind}-${reciente.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    router.push(reciente.href);
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                    {KIND_LABELS[reciente.kind]}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{reciente.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

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
