import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * La firma del puente con el bot.
 *
 * El bot (y Claude Code en la Mac) llaman a `/api/puente/v1/…` sin sesión de
 * Supabase. Cada petición lleva cuatro cabeceras:
 *
 * - `X-Puente-Id`: quién llama (`mac-1`, `vps-1`, `claude-1`);
 * - `X-Puente-Ts`: la hora, en segundos Unix;
 * - `X-Puente-Nonce`: 128 bits al azar (base64url), una sola vez;
 * - `X-Puente-Firma`: HMAC-SHA256, en base64url sin relleno, sobre
 *   `v1\nMÉTODO\nruta?consulta\nts\nnonce\nsha256(cuerpo)`.
 *
 * La llave es el texto entero que se le dio al cliente (`pte1_…`), en UTF-8.
 * La ventana es de ±5 minutos; la comparación, en tiempo constante.
 *
 * El otro lado vive en el repo del bot (`wa-core/src/puente/firma.js`) y las
 * dos pruebas comparten el mismo vector (`VECTOR_DE_PRUEBA`): si una de las dos
 * cambia la forma de firmar, falla su prueba antes de que el bot deje de poder
 * hablar.
 */

export const PUENTE_VERSION = "v1";

/** ±5 minutos: un reloj de la Mac algo desviado entra; una petición vieja, no. */
export const VENTANA_S = 300;

export const CLIENTES = ["mac-1", "vps-1", "claude-1"] as const;
export type ClientePuente = (typeof CLIENTES)[number];

export const CABECERAS = {
  id: "x-puente-id",
  ts: "x-puente-ts",
  nonce: "x-puente-nonce",
  firma: "x-puente-firma",
} as const;

/** El prefijo de las llaves: así un escáner de secretos las encuentra si alguien las pega donde no va. */
export const PREFIJO_LLAVE = "pte1_";
export const LLAVE_RE = /^pte1_[A-Za-z0-9_-]{43}$/;
export const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
export const FIRMA_RE = /^[A-Za-z0-9_-]{43}$/;

export function esCliente(valor: unknown): valor is ClientePuente {
  return typeof valor === "string" && (CLIENTES as readonly string[]).includes(valor);
}

export function sha256Hex(datos: string | Uint8Array): string {
  return createHash("sha256").update(datos).digest("hex");
}

/** Lo que se firma. El método en mayúsculas; la ruta con su consulta tal cual viaja. */
export function textoAFirmar(
  metodo: string,
  ruta: string,
  ts: number | string,
  nonce: string,
  cuerpo: string | Uint8Array,
): string {
  return [PUENTE_VERSION, metodo.toUpperCase(), ruta, String(ts), nonce, sha256Hex(cuerpo)].join("\n");
}

export function firmar(llave: string, texto: string): string {
  return createHmac("sha256", Buffer.from(llave, "utf8")).update(texto, "utf8").digest("base64url");
}

/** ¿Es la firma que tocaba? Sin decirlo por el reloj (los dos lados miden 32 bytes). */
export function firmaCoincide(recibida: string, esperada: string): boolean {
  if (!FIRMA_RE.test(recibida) || !FIRMA_RE.test(esperada)) return false;
  return timingSafeEqual(Buffer.from(recibida, "base64url"), Buffer.from(esperada, "base64url"));
}

/** ¿La hora de la petición cae dentro de la ventana? */
export function horaValida(ts: number, ahoraS: number, ventanaS: number = VENTANA_S): boolean {
  return Number.isInteger(ts) && Math.abs(ahoraS - ts) <= ventanaS;
}

export interface CabecerasLeidas {
  cliente: ClientePuente;
  ts: number;
  nonce: string;
  firma: string;
}

/** Las cuatro cabeceras, comprobadas de forma; `null` si falta alguna o no tiene la forma. */
export function leerCabeceras(cabeceras: Headers): CabecerasLeidas | null {
  const cliente = cabeceras.get(CABECERAS.id);
  const tsTexto = cabeceras.get(CABECERAS.ts);
  const nonce = cabeceras.get(CABECERAS.nonce);
  const firma = cabeceras.get(CABECERAS.firma);
  if (!esCliente(cliente) || !tsTexto || !nonce || !firma) return null;
  if (!/^\d{9,11}$/.test(tsTexto)) return null;
  if (!NONCE_RE.test(nonce) || !FIRMA_RE.test(firma)) return null;
  return { cliente, ts: Number(tsTexto), nonce, firma };
}

/**
 * El vector que comparten las pruebas de los dos repos. Una llave inventada,
 * nunca usada en ningún sitio.
 */
export const VECTOR_DE_PRUEBA = {
  llave: "pte1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  metodo: "POST",
  ruta: "/api/puente/v1/ops",
  ts: 1791331200,
  nonce: "bm9uY2UtZGUtcHJ1ZWJhLTAx",
  cuerpo: '{"ops":[]}',
  firma: "N9MjZG6yex1d9cZsXZqDxPZILT4rxgOgh98OhMMpFI4",
} as const;
