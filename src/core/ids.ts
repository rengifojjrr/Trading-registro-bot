/**
 * Ids que nacen donde nace la cosa.
 *
 * Una tarea que crea el importador de proyectos lleva ya su id en el plan que
 * se enseña antes de guardar. Así, darle dos veces a «Crear» -- o reintentar
 * tras un corte a mitad -- no duplica nada: la segunda vez la fila ya existe
 * con ese mismo id y la base la deja como estaba.
 *
 * UUIDv7 (RFC 9562) y no v4: los primeros 48 bits son la hora en milisegundos,
 * así que los ids salen ordenados por cuándo se crearon, que es lo que querrá
 * el puente con el bot para ponerse al día. El resto es azar.
 */
export function uuidv7(
  ahora: number = Date.now(),
  azar: Uint8Array = globalThis.crypto.getRandomValues(new Uint8Array(10)),
): string {
  const bytes = new Uint8Array(16);
  let ms = Math.max(0, Math.floor(ahora));
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = ms % 256;
    ms = Math.floor(ms / 256);
  }
  bytes.set(azar.subarray(0, 10), 6);
  bytes[6] = 0x70 | (bytes[6] & 0x0f); // versión 7
  bytes[8] = 0x80 | (bytes[8] & 0x3f); // variante RFC
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(valor: unknown): valor is string {
  return typeof valor === "string" && UUID.test(valor);
}

/**
 * Un id fijo sacado de otro y de una etiqueta.
 *
 * Para lo que nace de algo que ya tiene id: el papel de una persona en un
 * proyecto, el frente que una tarea nombra sin que exista. Sale siempre el
 * mismo para la misma pareja, así que el plan que se enseña y el que se aplica
 * coinciden, y repetir no duplica. Formato de uuid (versión 8, «a medida»).
 */
export function idDerivado(base: string, etiqueta: string): string {
  const texto = `${base}:${etiqueta}`;
  const partes = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b].map((semilla) => {
    let h = semilla >>> 0;
    for (let i = 0; i < texto.length; i += 1) {
      h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
      h = (h ^ (h >>> 15)) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  });
  const hex = partes.join("").split("");
  hex[12] = "8";
  hex[16] = "89ab"[parseInt(hex[16], 16) % 4];
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
