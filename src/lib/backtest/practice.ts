import { Decimal } from "decimal.js";

import type { Vela } from "@/lib/charts/indicators";

/**
 * Operar a ciegas sobre la reproducción.
 *
 * La reproducción vela a vela ya existe y ya esconde el desenlace. Lo que
 * faltaba era poder **operar** ahí: comprar, poner stop, cerrar, y que al
 * final diga qué tal lo hiciste. Es entrenamiento real sin dinero, y es la
 * única forma de practicar leer un gráfico sin saber ya cómo acabó.
 *
 * Vive aquí y no en el componente del gráfico porque es donde está la parte
 * que puede estar mal -- si el stop saltó, a cuánto se salió, cuánto se ganó --
 * y esa parte se prueba sin navegador.
 *
 * Puro.
 */

export interface PracticePosition {
  direction: "LONG" | "SHORT";
  /** Índice de la vela en la que se entró. */
  entryIndex: number;
  entryPrice: number;
  stop: number | null;
  target: number | null;
  size: number;
}

export interface PracticeTrade {
  direction: "LONG" | "SHORT";
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  size: number;
  /** Neto, ya multiplicado por el tamaño de contrato. */
  netPnl: string;
  reason: "STOP" | "OBJETIVO" | "MANUAL" | "FIN";
}

/**
 * Si la vela que acaba de revelarse cierra la posición.
 *
 * Mismo criterio pesimista que el backtest: **si se tocan el stop y el
 * objetivo en la misma vela, gana el stop**. Practicar con reglas más
 * generosas que las de verdad enseña a confiar en resultados que no van a
 * repetirse.
 */
export function checkPracticeExit(
  posicion: PracticePosition,
  vela: Vela,
): { price: number; reason: "STOP" | "OBJETIVO" } | null {
  if (posicion.stop !== null) {
    const tocado =
      posicion.direction === "LONG" ? vela.low <= posicion.stop : vela.high >= posicion.stop;
    if (tocado) {
      // Si abrió ya pasada, se sale a la apertura: la orden se habría
      // ejecutado ahí, peor.
      const precio =
        posicion.direction === "LONG"
          ? Math.min(posicion.stop, vela.open)
          : Math.max(posicion.stop, vela.open);
      return { price: precio, reason: "STOP" };
    }
  }

  if (posicion.target !== null) {
    const tocado =
      posicion.direction === "LONG" ? vela.high >= posicion.target : vela.low <= posicion.target;
    if (tocado) {
      const precio =
        posicion.direction === "LONG"
          ? Math.max(posicion.target, vela.open)
          : Math.min(posicion.target, vela.open);
      return { price: precio, reason: "OBJETIVO" };
    }
  }

  return null;
}

/** El resultado de una operación de práctica, en dinero. */
export function practicePnl(
  posicion: PracticePosition,
  exitPrice: number,
  contractSize: number,
): string {
  const delta =
    posicion.direction === "LONG"
      ? new Decimal(exitPrice).minus(posicion.entryPrice)
      : new Decimal(posicion.entryPrice).minus(exitPrice);
  return delta.times(posicion.size).times(contractSize).toFixed(2);
}

export interface PracticeSummary {
  operaciones: number;
  ganadoras: number;
  neto: string;
  aciertos: number;
  /** Lo que habría dado comprar en la primera vela y aguantar hasta el final. */
  comprarYAguantar: string;
}

/**
 * Cómo lo hiciste, con la referencia que hace falta para juzgarlo.
 *
 * Sin «comprar y aguantar» al lado, un resultado positivo parece bueno. Si el
 * precio subió un 20% en el tramo y tú ganaste un 3% operando, no lo hiciste
 * bien: lo hiciste peor que no hacer nada, que es exactamente lo que el
 * entrenamiento tiene que enseñar.
 */
export function summarisePractice(
  trades: PracticeTrade[],
  velas: Vela[],
  desdeIndice: number,
  contractSize: number,
  size: number,
): PracticeSummary {
  const netos = trades.map((t) => new Decimal(t.netPnl));
  const ganadoras = netos.filter((n) => n.greaterThan(0)).length;
  const neto = netos.reduce((a, n) => a.plus(n), new Decimal(0));

  const inicio = velas[desdeIndice];
  const fin = velas[velas.length - 1];
  const aguantar =
    inicio && fin
      ? new Decimal(fin.close).minus(inicio.close).times(size).times(contractSize)
      : new Decimal(0);

  return {
    operaciones: trades.length,
    ganadoras,
    neto: neto.toFixed(2),
    aciertos: trades.length > 0 ? (ganadoras / trades.length) * 100 : 0,
    comprarYAguantar: aguantar.toFixed(2),
  };
}
