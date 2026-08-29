/**
 * La cola de lo que se apuntó sin conexión.
 *
 * El service worker está deliberadamente casi vacío, y por buenas razones: en
 * una aplicación con cifras de dinero, guardar una respuesta de la API
 * significa poder enseñar el P&L de ayer como si fuera el de ahora, y eso no
 * se nota --el número parece bueno--. Pero esa misma decisión dejaba el
 * teléfono sin poder marcar un hábito en el metro.
 *
 * La distinción que lo resuelve: **una cola para lo que se escribe no tiene
 * ese riesgo**. No muestra datos viejos, guarda intenciones. Marcar un hábito
 * sin cobertura y que se mande al recuperarla no puede enseñar una cifra
 * equivocada, porque no enseña ninguna cifra.
 *
 * Reglas que la hacen segura:
 *
 *   1. **Sólo escrituras idempotentes por naturaleza**, y cada una con su
 *      identificador propio. Reintentar «marcar el hábito del 12 de agosto»
 *      dos veces deja el mismo estado; reintentar «añade 50 al total» no.
 *   2. **Nada de trading.** Una operación no se apunta a mano: la trae la
 *      sincronización. Lo que se encola son registros de vida --hábitos,
 *      sueño, comidas, tareas-- donde un reenvío duplicado no cuesta dinero.
 *   3. **Se guarda con su momento.** Al enviarse, lo que llega al servidor es
 *      «esto pasó a las 21:40», no «esto está pasando ahora».
 *
 * Puro salvo por `localStorage`, que se le pasa desde fuera para poder
 * probarla entera.
 */

export const QUEUE_KEY = "vida:cola-sin-conexion";

/** Cuántas se guardan como mucho. Pasado eso, la más vieja cae. */
export const MAX_QUEUED = 100;

export interface QueuedWrite {
  /** Único por intención, no por intento: es lo que evita duplicar. */
  id: string;
  /** A dónde va. Siempre una ruta de esta aplicación. */
  url: string;
  method: "POST" | "PATCH" | "PUT";
  body: unknown;
  /** Cuándo se apuntó de verdad, en segundos unix. */
  at: number;
  /** Para poder decir «Marcaste “Leer” del 12 de agosto» en la lista. */
  label: string;
  /** Intentos fallidos. A partir de cierto número se deja de reintentar. */
  attempts: number;
}

export const MAX_ATTEMPTS = 5;

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Lee la cola sin fiarse.
 *
 * Una cola corrupta no puede impedir usar la aplicación: se descarta lo que no
 * encaja y se sigue. Perder un hábito apuntado sin conexión es malo; no poder
 * abrir la aplicación es peor.
 */
export function readQueue(storage: Storage): QueuedWrite[] {
  let crudo: string | null = null;
  try {
    crudo = storage.getItem(QUEUE_KEY);
  } catch {
    return [];
  }
  if (!crudo) return [];

  try {
    const parsed = JSON.parse(crudo);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(esEntradaValida);
  } catch {
    return [];
  }
}

function esEntradaValida(v: unknown): v is QueuedWrite {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.url === "string" &&
    // Sólo rutas de esta aplicación. Una URL absoluta en la cola sería un
    // sitio al que esta aplicación mandaría datos del usuario sin que él lo
    // haya pedido, y la cola vive en un sitio que se puede editar a mano.
    o.url.startsWith("/") &&
    !o.url.startsWith("//") &&
    (o.method === "POST" || o.method === "PATCH" || o.method === "PUT") &&
    typeof o.at === "number" &&
    typeof o.label === "string" &&
    typeof o.attempts === "number"
  );
}

export function writeQueue(storage: Storage, cola: QueuedWrite[]): void {
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(cola));
  } catch {
    // Sin sitio: se pierde lo encolado, no la sesión.
  }
}

/**
 * Añade una escritura, sin duplicar la misma intención.
 *
 * Marcar y desmarcar el mismo hábito tres veces sin conexión tiene que dejar
 * **una** entrada con lo último, no tres que se pisan al enviarse en orden --y
 * que además tardan el triple--.
 */
export function enqueue(cola: QueuedWrite[], escritura: Omit<QueuedWrite, "attempts">): QueuedWrite[] {
  const sinLaAnterior = cola.filter((e) => e.id !== escritura.id);
  const siguiente = [...sinLaAnterior, { ...escritura, attempts: 0 }];
  // Las más viejas caen primero: si algo hay que perder, que sea lo de antes.
  return siguiente.slice(-MAX_QUEUED);
}

export function dequeue(cola: QueuedWrite[], id: string): QueuedWrite[] {
  return cola.filter((e) => e.id !== id);
}

/** Apunta un intento fallido, y descarta lo que ya no vale la pena reintentar. */
export function markFailed(cola: QueuedWrite[], id: string): QueuedWrite[] {
  return cola.flatMap((e) => {
    if (e.id !== id) return [e];
    const attempts = e.attempts + 1;
    // Cinco intentos fallidos no son un problema de red: es una escritura que
    // el servidor rechaza. Reintentarla para siempre bloquearía la cola entera
    // detrás de ella.
    return attempts >= MAX_ATTEMPTS ? [] : [{ ...e, attempts }];
  });
}

/** Las que todavía se van a intentar. */
export function pending(cola: QueuedWrite[]): QueuedWrite[] {
  return cola.filter((e) => e.attempts < MAX_ATTEMPTS);
}
