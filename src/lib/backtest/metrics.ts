import { Decimal } from "decimal.js";

import { calculatePnl } from "@/lib/pnl/calculate";

import type { SimulatedTrade } from "./engine";
import { type ExitReason } from "./types";

/**
 * Las cifras de un backtest, calculadas con el mismo P&L que las reales.
 *
 * Nada de aquí reimplementa una fórmula que ya existe. `calculatePnl` es la
 * misma función que produce el P&L de tus operaciones de Coinbase, así que
 * «la estrategia habría ganado 300» y «yo gané 250» son cifras del mismo tipo
 * y se pueden restar. Con dos implementaciones, la diferencia entre las dos
 * cifras incluiría la diferencia entre los dos cálculos, y eso ya no dice nada.
 *
 * Puro.
 */

export interface BacktestMetrics {
  operaciones: number;
  ganadoras: number;
  perdedoras: number;
  /** En porcentaje, 0-100. */
  aciertos: number;
  /** Suma de los P&L netos. */
  neto: string;
  mediaGanadora: string;
  mediaPerdedora: string;
  /** Ganadora media dividida por perdedora media, en valor absoluto. */
  ratio: string | null;
  /**
   * Lo que se espera ganar por operación.
   *
   * `aciertos * mediaGanadora - fallos * mediaPerdedora`. Es la cifra que de
   * verdad decide si una estrategia sirve: un 30% de aciertos con un ratio de
   * 4 gana más que un 70% con un ratio de 0,3.
   */
  esperanza: string;
  /** La mayor caída desde un máximo de la curva acumulada. */
  drawdown: string;
  rachaGanadora: number;
  rachaPerdedora: number;
  /** Cuántas se cerraron por cada motivo. */
  porMotivo: Record<ExitReason, number>;
  /** La curva de capital acumulada, para pintarla. */
  curva: { time: number; value: number }[];
}

export function computeMetrics(trades: SimulatedTrade[], contractSize: number): BacktestMetrics {
  const netos: { time: number; neto: Decimal }[] = [];
  const porMotivo: Record<ExitReason, number> = {
    STOP: 0,
    OBJETIVO: 0,
    TIEMPO: 0,
    CONDICION: 0,
    FIN_DE_DATOS: 0,
  };

  for (const simulada of trades) {
    porMotivo[simulada.exitReason] += 1;

    const t = simulada.trade;
    const pnl = calculatePnl({
      direction: t.direction,
      entryWap: t.entryWap,
      exitWap: t.exitWap,
      totalEntryQty: t.totalEntryQty,
      totalExitQty: t.totalExitQty,
      entryCommissions: t.entryCommissions,
      exitCommissions: t.exitCommissions,
      contractSize: String(contractSize),
    });

    // Una operación sin cerrar no tiene P&L, y contarla como cero la haría
    // pasar por neutra en las estadísticas.
    if (pnl.netPnl === null) continue;
    netos.push({ time: simulada.exitTime, neto: new Decimal(pnl.netPnl) });
  }

  const ganadoras = netos.filter((n) => n.neto.greaterThan(0));
  const perdedoras = netos.filter((n) => n.neto.lessThan(0));

  const suma = (lista: typeof netos) =>
    lista.reduce((acc, n) => acc.plus(n.neto), new Decimal(0));

  const neto = suma(netos);
  const mediaGanadora = ganadoras.length > 0 ? suma(ganadoras).dividedBy(ganadoras.length) : new Decimal(0);
  const mediaPerdedora =
    perdedoras.length > 0 ? suma(perdedoras).dividedBy(perdedoras.length).abs() : new Decimal(0);

  const aciertos = netos.length > 0 ? (ganadoras.length / netos.length) * 100 : 0;
  const tasa = new Decimal(aciertos).dividedBy(100);
  const esperanza = tasa
    .times(mediaGanadora)
    .minus(new Decimal(1).minus(tasa).times(mediaPerdedora));

  return {
    operaciones: netos.length,
    ganadoras: ganadoras.length,
    perdedoras: perdedoras.length,
    aciertos,
    neto: neto.toFixed(2),
    mediaGanadora: mediaGanadora.toFixed(2),
    mediaPerdedora: mediaPerdedora.toFixed(2),
    ratio: mediaPerdedora.isZero() ? null : mediaGanadora.dividedBy(mediaPerdedora).toFixed(2),
    esperanza: esperanza.toFixed(2),
    drawdown: maxDrawdown(netos.map((n) => n.neto)).toFixed(2),
    ...rachas(netos.map((n) => n.neto)),
    porMotivo,
    curva: curvaAcumulada(netos),
  };
}

/**
 * La mayor caída desde un máximo anterior de la curva acumulada.
 *
 * Se mide sobre la curva y no sobre la peor operación suelta: lo que duele no
 * es una operación mala, son seis seguidas. Devuelve un número positivo -- el
 * tamaño de la caída -- porque «un drawdown de -300» se lee mal.
 */
export function maxDrawdown(netos: Decimal[]): Decimal {
  let acumulado = new Decimal(0);
  let maximo = new Decimal(0);
  let peor = new Decimal(0);

  for (const neto of netos) {
    acumulado = acumulado.plus(neto);
    if (acumulado.greaterThan(maximo)) maximo = acumulado;
    const caida = maximo.minus(acumulado);
    if (caida.greaterThan(peor)) peor = caida;
  }

  return peor;
}

function rachas(netos: Decimal[]): { rachaGanadora: number; rachaPerdedora: number } {
  let mejorG = 0;
  let mejorP = 0;
  let actualG = 0;
  let actualP = 0;

  for (const neto of netos) {
    if (neto.greaterThan(0)) {
      actualG += 1;
      actualP = 0;
    } else if (neto.lessThan(0)) {
      actualP += 1;
      actualG = 0;
    } else {
      // Una operación a cero no rompe la racha ni la alarga: no es una
      // ganadora ni una perdedora.
      continue;
    }
    mejorG = Math.max(mejorG, actualG);
    mejorP = Math.max(mejorP, actualP);
  }

  return { rachaGanadora: mejorG, rachaPerdedora: mejorP };
}

function curvaAcumulada(netos: { time: number; neto: Decimal }[]): { time: number; value: number }[] {
  let acumulado = new Decimal(0);
  return netos.map((n) => {
    acumulado = acumulado.plus(n.neto);
    return { time: n.time, value: acumulado.toNumber() };
  });
}
