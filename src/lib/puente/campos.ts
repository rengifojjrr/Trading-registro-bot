import type { FieldAuthor, FieldSrc } from "@/types/database";

import type { Origen } from "./esquemas";

/**
 * Las reglas de los campos del puente, sin base de datos (con pruebas).
 *
 * 1. **Lo que escribió el dueño manda.** Una operación del bot (`bot`) o de
 *    Claude (`claude`) sólo rellena lo vacío o cambia lo que escribió ella
 *    misma antes. Un campo sin marca que ya tiene valor cuenta como del dueño
 *    (es lo que escribiste antes de que existiera la marca), igual que en el
 *    importador de E1.
 * 2. **El dueño, por WhatsApp o por voz, es el dueño**: lo suyo se aplica.
 *    Si la fila cambió en la web después de lo que vio el bot
 *    (`base_version`), vuelve como conflicto y el bot pregunta.
 * 3. **Lo que deduce el bot pasa un control más**: ni un jid, ni una tira de
 *    siete cifras (un teléfono sin tapar). El bot ya lo tapa antes de mandar;
 *    esto es la segunda red.
 */

export function autorDe(origen: Origen): FieldAuthor {
  return origen;
}

function vacio(valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor === "string") return valor.trim() === "";
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

function iguales(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export interface Fusion {
  /** Lo que se escribe (columnas de la base). */
  parche: Record<string, unknown>;
  /** La marca nueva, con lo escrito puesto a nombre de quien lo pidió. */
  src: FieldSrc;
  /** Lo que no se tocó porque era del dueño. */
  omitidos: string[];
}

/** Qué cambios de `cambios` se aplican sobre `actual`, según quién los pide. */
export function fusionar(
  origen: Origen,
  actual: Record<string, unknown>,
  srcActual: FieldSrc | null | undefined,
  cambios: Record<string, unknown>,
): Fusion {
  const autor = autorDe(origen);
  const src: FieldSrc = { ...(srcActual ?? {}) };
  const parche: Record<string, unknown> = {};
  const omitidos: string[] = [];
  for (const [campo, nuevo] of Object.entries(cambios)) {
    if (nuevo === undefined) continue;
    if (iguales(actual[campo], nuevo)) continue;
    const puede = autor === "owner" || vacio(actual[campo]) || src[campo] === autor;
    if (!puede) {
      omitidos.push(campo);
      continue;
    }
    parche[campo] = nuevo;
    src[campo] = autor;
  }
  return { parche, src, omitidos };
}

/** La marca de una fila nueva: todos los campos que trae, a nombre de quien la crea. */
export function marcaNueva(origen: Origen, campos: Record<string, unknown>): FieldSrc {
  const src: FieldSrc = {};
  for (const [campo, valor] of Object.entries(campos)) if (!vacio(valor)) src[campo] = autorDe(origen);
  return src;
}

const JID_RE = /@(s\.whatsapp\.net|lid|g\.us|c\.us|broadcast|newsletter)\b/i;

/** ¿Hay algo con forma de teléfono o de identificador de WhatsApp? */
export function pareceDatoPrivado(texto: string, { cifras = true }: { cifras?: boolean } = {}): boolean {
  if (JID_RE.test(texto)) return true;
  if (!cifras) return false;
  const junto = texto.replace(/(?<=\d)[\s.\-()/]+(?=\d)/g, "");
  return /\d{7,}/.test(junto);
}

/**
 * Claves que no son texto de nadie: ids, referencias opacas, fechas y horas.
 * Un uuid tiene tiras de cifras que parecerían un teléfono.
 */
const CLAVES_ESTRUCTURALES = new Set([
  "ref", "en", "fecha", "inicio", "meta", "hasta", "el_dia", "disparo", "hora", "panel_url", "version",
  "ext_source", "ext_id", "otros_proyectos", "queda", "se_va", "boot_id", "dias", "dia_del_mes", "cada_n",
  "duracion_s",
]);

function esEstructural(clave: string | null): boolean {
  if (clave === null) return false;
  return CLAVES_ESTRUCTURALES.has(clave) || clave === "id" || /_ids?$/.test(clave);
}

/** Los textos libres de un valor (para revisar los datos de una operación entera). */
export function textosDe(valor: unknown, salida: string[] = [], clave: string | null = null): string[] {
  if (esEstructural(clave)) return salida;
  if (typeof valor === "string") salida.push(valor);
  else if (Array.isArray(valor)) for (const v of valor) textosDe(v, salida, null);
  else if (valor && typeof valor === "object") for (const [k, v] of Object.entries(valor)) textosDe(v, salida, k);
  return salida;
}

/**
 * ¿Lleva la operación algo que no debe subir? Un jid nunca, venga de quien
 * venga. Una tira de siete cifras sólo se mira en lo que dedujo el bot: en lo
 * que escribes tú puede ir un importe.
 */
export function llevaDatoPrivado(origen: Origen, datos: unknown): boolean {
  return textosDe(datos).some((t) => pareceDatoPrivado(t, { cifras: origen === "bot" }));
}

/** El origen de una tarea, bitácora o fuente en la base, según quién la pide. */
export function origenEnLaBase(
  origen: Origen,
  { via, fuente }: { via?: "texto" | "voz"; fuente?: { tipo: string } | null } = {},
): "WHATSAPP" | "VOZ" | "CLAUDE" | "ANALISIS" | "REUNION" | "LLAMADA" {
  if (origen === "owner") return via === "voz" ? "VOZ" : "WHATSAPP";
  if (origen === "claude") return "CLAUDE";
  if (fuente?.tipo === "REUNION") return "REUNION";
  if (fuente?.tipo === "LLAMADA") return "LLAMADA";
  return "ANALISIS";
}

/** Quién escribió un documento o un «cómo va», en la columna de la base. */
export function hechoPor(origen: Origen): "OWNER" | "CLAUDE" | "BOT" {
  return origen === "owner" ? "OWNER" : origen === "claude" ? "CLAUDE" : "BOT";
}
