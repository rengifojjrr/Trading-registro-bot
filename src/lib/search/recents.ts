import type { RankedResult, ResultKind } from "./rank";

/**
 * Lo que abriste hace poco.
 *
 * Abrir ⌘K y ver un campo vacío desperdicia el dato más barato que hay: lo que
 * abriste ayer es lo que más probablemente quieres abrir hoy. En un diario de
 * trading eso es casi siempre cierto -- se vuelve a la misma operación tres
 * veces en dos días mientras se decide qué se hizo mal.
 *
 * En el navegador y no en la base: es un atajo de este dispositivo, no un dato
 * que valga la pena sincronizar ni respaldar.
 *
 * Puro salvo por el almacenamiento, que se le pasa desde fuera.
 */

export const RECENTS_KEY = "vida:busquedas-recientes";

/** Cuántas se guardan. Más de ocho ya no caben sin desplazar la lista. */
export const MAX_RECENTS = 8;

export interface RecentEntry {
  kind: ResultKind;
  id: string;
  title: string;
  href: string;
  at: number;
}

export interface RecentsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readRecents(storage: RecentsStorage): RecentEntry[] {
  try {
    const crudo = storage.getItem(RECENTS_KEY);
    if (!crudo) return [];
    const parsed = JSON.parse(crudo);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(esEntrada).slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

function esEntrada(v: unknown): v is RecentEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.kind === "string" &&
    typeof o.id === "string" &&
    typeof o.title === "string" &&
    typeof o.href === "string" &&
    // Sólo rutas de esta aplicación: lo guardado se puede editar a mano, y una
    // URL absoluta aquí sería un enlace a otro sitio dentro del buscador.
    o.href.startsWith("/") &&
    !o.href.startsWith("//") &&
    typeof o.at === "number"
  );
}

/**
 * Apunta lo que se acaba de abrir, al principio y sin repetir.
 *
 * Volver a abrir algo lo sube al primer puesto en vez de crear una entrada
 * más: la lista es «lo último», no «todo lo que abriste».
 */
export function pushRecent(
  storage: RecentsStorage,
  result: Pick<RankedResult, "kind" | "id" | "title" | "href">,
): RecentEntry[] {
  const previas = readRecents(storage).filter(
    (r) => !(r.kind === result.kind && r.id === result.id),
  );
  const siguiente = [
    { kind: result.kind, id: result.id, title: result.title, href: result.href, at: Date.now() },
    ...previas,
  ].slice(0, MAX_RECENTS);

  try {
    storage.setItem(RECENTS_KEY, JSON.stringify(siguiente));
  } catch {
    // Sin sitio: se pierde el atajo, no la navegación.
  }

  return siguiente;
}
