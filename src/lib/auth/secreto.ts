import { createHash, timingSafeEqual } from "node:crypto";

/**
 * ¿El secreto que llega es el que se esperaba? Sin decirlo por el reloj.
 *
 * Un `===` sale en cuanto encuentra el primer carácter distinto, así que lo
 * que tarda en contestar dice cuántos caracteres del principio acertó quien
 * prueba. Con tiempo y paciencia, eso basta para ir adivinando el secreto
 * carácter a carácter desde fuera.
 *
 * Se comparan las huellas SHA-256 de los dos y no los dos textos: las huellas
 * miden siempre 32 bytes, así que `timingSafeEqual` compara siempre, también
 * cuando los largos no coinciden, y el reloj tampoco cuenta cuánto mide el
 * secreto. Dos textos distintos con la misma huella no se encuentran.
 *
 * Vacío o ausente en cualquiera de los dos lados es siempre «no»: un secreto
 * sin configurar no puede abrir la puerta a quien no manda ninguno.
 */
export function coincideSecreto(
  recibido: string | null | undefined,
  esperado: string | null | undefined,
): boolean {
  if (!recibido || !esperado) return false;
  return timingSafeEqual(huella(recibido), huella(esperado));
}

/**
 * Lo que va detrás de `Bearer ` en una cabecera `Authorization`, o `null`.
 *
 * Exacto, como lo manda Vercel Cron: `Bearer`, un espacio y el secreto. Ni
 * `bearer` en minúsculas ni dos espacios: quien llama con el secreto de
 * verdad lo manda bien, y aceptar variantes sólo ensancha la puerta.
 */
export function portadorDe(cabecera: string | null | undefined): string | null {
  if (!cabecera || !cabecera.startsWith("Bearer ")) return null;
  const valor = cabecera.slice("Bearer ".length);
  return valor.length > 0 ? valor : null;
}

function huella(texto: string): Buffer {
  return createHash("sha256").update(texto, "utf8").digest();
}
