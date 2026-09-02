import {
  BLOCK_DEVIATION_ALERT_POINTS,
  BLOCKS,
  isProduction,
  type BotBlock,
  type BotPhase,
  type PortfolioSettings,
} from "./types";

/**
 * El reparto del portfolio en sus tres bloques.
 *
 * El objetivo es 40% convexo, 40% cóncavo, 20% híbrido. Cuadrarlo al cien por
 * cien es complejo; lo que se vigila es que no se desvíe más de diez puntos,
 * y se rebalancea en la revisión mensual, no cuando apetece.
 *
 * Sólo cuentan los bots en producción: uno en la cantera no tiene capital
 * asignado de verdad, y contarlo haría parecer cuadrado un portfolio que no
 * lo está.
 *
 * Puro.
 */

export interface BlockRow {
  block: BotBlock;
  target: number;
  /** Porcentaje real sobre el tamaño total asignado. */
  actual: number;
  delta: number;
  bots: number;
}

export interface BlockAllocation {
  rows: BlockRow[];
  /** Suma del tamaño asignado a producción, en porcentaje del capital. */
  totalSizingPct: number;
  /** Si algún bloque se sale de la banda. */
  deviates: boolean;
  /** Cómo se midió: por tamaño asignado o, si nadie tiene tamaño, por número de bots. */
  basis: "SIZING" | "COUNT" | "NONE";
}

export function blockAllocation(
  bots: { block: BotBlock; phase: BotPhase; sizingPct: number }[],
  targets: PortfolioSettings["targets"],
): BlockAllocation {
  const enProduccion = bots.filter((b) => isProduction(b.phase));
  const totalSizing = enProduccion.reduce((acc, b) => acc + b.sizingPct, 0);

  const basis: BlockAllocation["basis"] =
    enProduccion.length === 0 ? "NONE" : totalSizing > 0 ? "SIZING" : "COUNT";

  const rows: BlockRow[] = BLOCKS.map((block) => {
    const delBloque = enProduccion.filter((b) => b.block === block);
    const peso =
      basis === "SIZING"
        ? delBloque.reduce((acc, b) => acc + b.sizingPct, 0)
        : delBloque.length;
    const total = basis === "SIZING" ? totalSizing : enProduccion.length;
    const actual = total > 0 ? (peso / total) * 100 : 0;

    return {
      block,
      target: targets[block],
      actual,
      delta: actual - targets[block],
      bots: delBloque.length,
    };
  });

  return {
    rows,
    totalSizingPct: totalSizing,
    deviates:
      basis !== "NONE" && rows.some((r) => Math.abs(r.delta) > BLOCK_DEVIATION_ALERT_POINTS),
    basis,
  };
}
