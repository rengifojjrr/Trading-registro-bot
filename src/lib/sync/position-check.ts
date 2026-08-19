import { Decimal } from "decimal.js";

import type { CoinbaseFuturesPosition } from "@/lib/coinbase/types";

/**
 * Comparar la posición que reconstruimos con la que dice Coinbase.
 *
 * Es la red que faltaba. El motor de reconstrucción cierra una operación
 * cuando la posición acumulada vuelve a cero, y arranca suponiendo que
 * empieza plana; si por lo que sea falta un fill -- uno que llegó tarde,
 * fuera de la ventana de solapamiento de la sincronización -- la posición
 * queda desplazada para siempre y la última operación se queda **abierta sin
 * que nada lo diga**. Una operación cerrada de verdad que aquí figura abierta
 * no da ningún error: simplemente no cuenta en las cifras, y no hay forma de
 * saber por qué.
 *
 * Coinbase sí sabe cuántos contratos tienes. Preguntárselo después de cada
 * sincronización convierte ese silencio en una discrepancia con nombre.
 *
 * Puro y sin red a propósito: recibe las dos listas ya traídas. Es la parte
 * que puede equivocarse en silencio, así que es la que hay que poder probar.
 */

export interface ReconstructedPosition {
  productId: string;
  /** Con signo: positivo va largo, negativo va corto. */
  size: string;
}

export interface PositionMismatch {
  productId: string;
  /** Lo que dicen nuestros fills, con signo. */
  reconstructed: string;
  /** Lo que dice Coinbase, con signo. */
  venue: string;
  /** `venue - reconstructed`: cuántos contratos nos faltan por explicar. */
  difference: string;
}

/**
 * Pasa la posición de Coinbase a un número con signo.
 *
 * Coinbase manda el lado aparte del tamaño, y el tamaño siempre en positivo.
 * Un lado `UNKNOWN` se descarta en lugar de suponerle uno: adivinar el signo
 * de una posición es exactamente el error que esta comprobación existe para
 * detectar.
 */
export function signedVenueSize(position: CoinbaseFuturesPosition): Decimal | null {
  if (position.side !== "LONG" && position.side !== "SHORT") return null;

  let size: Decimal;
  try {
    size = new Decimal(position.number_of_contracts);
  } catch {
    return null;
  }

  // El tamaño llega siempre en positivo, pero si alguna vez llegara con signo
  // se respeta el valor absoluto y manda el lado.
  return position.side === "SHORT" ? size.abs().negated() : size.abs();
}

/**
 * Las diferencias entre lo reconstruido y lo que dice Coinbase.
 *
 * Se comparan los dos lados y no sólo uno: un producto que Coinbase reporta y
 * nosotros no es tan grave como al revés -- el primero significa que perdimos
 * fills de apertura, el segundo que perdimos los de cierre.
 */
export function comparePositions(
  reconstructed: ReconstructedPosition[],
  venue: CoinbaseFuturesPosition[],
): PositionMismatch[] {
  const ours = new Map<string, Decimal>();
  for (const row of reconstructed) {
    try {
      ours.set(row.productId, new Decimal(row.size));
    } catch {
      // Un tamaño ilegible es un fallo nuestro, no una discrepancia con
      // Coinbase: se ignora aquí y lo canta el motor de reconstrucción.
    }
  }

  const theirs = new Map<string, Decimal>();
  for (const position of venue) {
    const size = signedVenueSize(position);
    if (size === null) continue;
    // Coinbase puede devolver varias filas del mismo producto (por
    // vencimiento); lo que hay que comparar es la suma.
    theirs.set(position.product_id, (theirs.get(position.product_id) ?? new Decimal(0)).plus(size));
  }

  const mismatches: PositionMismatch[] = [];

  for (const productId of new Set([...ours.keys(), ...theirs.keys()])) {
    const mine = ours.get(productId) ?? new Decimal(0);
    const other = theirs.get(productId) ?? new Decimal(0);
    if (mine.equals(other)) continue;

    mismatches.push({
      productId,
      reconstructed: mine.toString(),
      venue: other.toString(),
      difference: other.minus(mine).toString(),
    });
  }

  return mismatches.sort((a, b) => a.productId.localeCompare(b.productId));
}

/** Una frase que explique la diferencia sin tener que abrir la base de datos. */
export function describeMismatch(mismatch: PositionMismatch): string {
  const nuestro = describeSize(mismatch.reconstructed);
  const suyo = describeSize(mismatch.venue);
  return `${mismatch.productId}: aquí sale ${nuestro} y Coinbase dice ${suyo}.`;
}

function describeSize(size: string): string {
  const value = new Decimal(size);
  if (value.isZero()) return "sin posición";

  const contratos = value.abs().toString();
  const unidad = value.abs().equals(1) ? "contrato" : "contratos";
  return `${value.isNegative() ? "corto" : "largo"} de ${contratos} ${unidad}`;
}
