import { Decimal } from "decimal.js";

import type { Vela } from "@/lib/charts/indicators";
import { reconstructTrades } from "@/lib/reconstruction/engine";
import type { ReconstructedTrade, ReconstructionFillInput } from "@/lib/reconstruction/types";

import { allHold, anyHolds, buildContext, withinHours } from "./rules";
import {
  DEFAULT_COSTS,
  type BacktestCosts,
  type ExitReason,
  type SimulatedFill,
  type Strategy,
} from "./types";

/**
 * El motor de backtest.
 *
 * La decisión que lo define: **no calcula operaciones, calcula fills**. Las
 * operaciones las arma después el mismo `reconstructTrades` que arma las de
 * Coinbase, y el P&L lo calcula el mismo `calculatePnl`.
 *
 * El motivo no es ahorrar código. Es que un backtest sólo sirve si se puede
 * comparar con la realidad, y dos motores distintos -- uno para lo simulado y
 * otro para lo real -- acaban discrepando en los detalles que más importan:
 * cómo se pondera un precio medio de entrada con varias parciales, cómo se
 * reparte una comisión, qué cuenta como cerrado. Con un solo motor, «la
 * estrategia habría ganado 300» y «yo gané 250» son cifras del mismo tipo.
 *
 * Puro: velas y reglas entran, operaciones salen. Sin base de datos, sin red y
 * sin reloj -- lo que permite probarlo entero.
 */

export interface BacktestInput {
  strategy: Strategy;
  velas: Vela[];
  productId: string;
  costs?: BacktestCosts;
}

export interface BacktestPosition {
  /** Índice de la vela en la que se entró. */
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  direction: "LONG" | "SHORT";
  stop: number | null;
  target: number | null;
}

/** Una operación simulada, con el porqué de su cierre. */
export interface SimulatedTrade {
  trade: ReconstructedTrade;
  exitReason: ExitReason;
  entryTime: number;
  exitTime: number;
  barsHeld: number;
}

export interface BacktestResult {
  trades: SimulatedTrade[];
  fills: SimulatedFill[];
  /** Velas que se miraron de verdad, tras descartar las que no tienen datos. */
  barsEvaluated: number;
  /** Por qué no se entró nunca, cuando no se entró. */
  note: string | null;
}

/**
 * Corre la estrategia sobre las velas.
 *
 * Regla de oro de todo el recorrido: **una decisión tomada en la vela `i` se
 * ejecuta al precio de apertura de la vela `i+1`**. Entrar al cierre de la
 * misma vela que da la señal es mirar el futuro: ese cierre no se conoce hasta
 * que la vela termina, y para entonces ya no se puede comprar a ese precio. Es
 * el error que hace que un backtest salga espectacular y la estrategia pierda
 * dinero en cuanto se opera de verdad.
 */
export function runBacktest(input: BacktestInput): BacktestResult {
  const { strategy, velas, productId } = input;
  const costs = input.costs ?? DEFAULT_COSTS;

  if (velas.length < 3) {
    return { trades: [], fills: [], barsEvaluated: 0, note: "Hacen falta más velas." };
  }

  const ctx = buildContext(strategy, velas);
  const atr = ctx.series.get("ATR14");

  const fills: SimulatedFill[] = [];
  const cierres: { entryIndex: number; exitIndex: number; reason: ExitReason }[] = [];

  let posicion: BacktestPosition | null = null;
  let evaluadas = 0;

  // Hasta `length - 1`: la última vela no tiene siguiente en la que ejecutar,
  // así que una señal ahí no se podría cumplir.
  for (let i = 1; i < velas.length - 1; i += 1) {
    evaluadas += 1;
    const siguiente = velas[i + 1];

    if (posicion) {
      const salida = comprobarSalida(posicion, velas, i, strategy, ctx);
      if (salida) {
        const precio = precioDeSalida(salida, posicion, velas[i], siguiente);
        fills.push(
          crearFill(
            salida === "STOP" || salida === "OBJETIVO" ? velas[i].time : siguiente.time,
            posicion.direction === "LONG" ? "SELL" : "BUY",
            aplicarDeslizamiento(precio, posicion.direction === "LONG" ? "SELL" : "BUY", costs),
            strategy.size,
            costs,
            salida,
          ),
        );
        cierres.push({ entryIndex: posicion.entryIndex, exitIndex: i, reason: salida });
        posicion = null;
      }
      continue;
    }

    // Una posición por vez. Piramidar cambia por completo el cálculo de riesgo
    // y merece ser una decisión aparte, no un efecto secundario de no
    // comprobarlo.
    if (!withinHours(strategy, siguiente.time)) continue;
    if (!allHold(strategy.entry, ctx, i)) continue;

    const direccion = strategy.direction === "BOTH" ? "LONG" : strategy.direction;
    const entrada = aplicarDeslizamiento(
      siguiente.open,
      direccion === "LONG" ? "BUY" : "SELL",
      costs,
    );
    const rango = atr?.[i] ?? null;

    posicion = {
      entryIndex: i + 1,
      entryTime: siguiente.time,
      entryPrice: entrada,
      direction: direccion,
      stop: nivel(entrada, rango, strategy.exit.stopAtr, direccion, "STOP"),
      target: nivel(entrada, rango, strategy.exit.targetAtr, direccion, "OBJETIVO"),
    };

    fills.push(
      crearFill(
        siguiente.time,
        direccion === "LONG" ? "BUY" : "SELL",
        entrada,
        strategy.size,
        costs,
        "ENTRADA",
      ),
    );
  }

  // Una posición todavía abierta al acabar los datos se cierra a la última
  // vela. Dejarla abierta la excluiría de las estadísticas, y una estrategia
  // que aguanta sus perdedoras saldría mejor de lo que es.
  if (posicion) {
    const ultima = velas[velas.length - 1];
    fills.push(
      crearFill(
        ultima.time,
        posicion.direction === "LONG" ? "SELL" : "BUY",
        aplicarDeslizamiento(
          ultima.close,
          posicion.direction === "LONG" ? "SELL" : "BUY",
          costs,
        ),
        strategy.size,
        costs,
        "FIN_DE_DATOS",
      ),
    );
    cierres.push({
      entryIndex: posicion.entryIndex,
      exitIndex: velas.length - 1,
      reason: "FIN_DE_DATOS",
    });
  }

  if (fills.length === 0) {
    return {
      trades: [],
      fills: [],
      barsEvaluated: evaluadas,
      note: "Las condiciones de entrada no se cumplieron en ninguna vela.",
    };
  }

  // Y aquí lo importante: las operaciones las arma el motor de verdad.
  const { trades } = reconstructTrades(fills.map((f, i) => aReconstruccion(f, i, productId)));

  const simuladas: SimulatedTrade[] = trades.map((trade, i) => {
    const cierre = cierres[i];
    return {
      trade,
      exitReason: cierre?.reason ?? "FIN_DE_DATOS",
      entryTime: Math.floor(new Date(trade.openedAt).getTime() / 1000),
      exitTime: trade.closedAt ? Math.floor(new Date(trade.closedAt).getTime() / 1000) : 0,
      barsHeld: cierre ? cierre.exitIndex - cierre.entryIndex : 0,
    };
  });

  return { trades: simuladas, fills, barsEvaluated: evaluadas, note: null };
}

/**
 * Qué cierra la posición en esta vela, si algo la cierra.
 *
 * El orden importa y es deliberadamente pesimista: **si en la misma vela se
 * tocan el stop y el objetivo, gana el stop**. Con las velas no se puede saber
 * cuál se tocó antes, y suponer que fue el objetivo es la suposición que hace
 * que un backtest salga mejor de lo que la estrategia es.
 */
function comprobarSalida(
  posicion: BacktestPosition,
  velas: Vela[],
  i: number,
  strategy: Strategy,
  ctx: ReturnType<typeof buildContext>,
): ExitReason | null {
  const vela = velas[i];

  if (posicion.stop !== null) {
    const tocado =
      posicion.direction === "LONG" ? vela.low <= posicion.stop : vela.high >= posicion.stop;
    if (tocado) return "STOP";
  }

  if (posicion.target !== null) {
    const tocado =
      posicion.direction === "LONG" ? vela.high >= posicion.target : vela.low <= posicion.target;
    if (tocado) return "OBJETIVO";
  }

  if (strategy.exit.maxBars !== null && i - posicion.entryIndex >= strategy.exit.maxBars) {
    return "TIEMPO";
  }

  if (strategy.exit.conditions.length > 0 && anyHolds(strategy.exit.conditions, ctx, i)) {
    return "CONDICION";
  }

  return null;
}

/**
 * A qué precio se sale.
 *
 * El stop y el objetivo salen **en su propio nivel**, dentro de la misma vela:
 * es donde estaba la orden. Las salidas por tiempo o por condición salen a la
 * apertura de la siguiente, por la misma razón que las entradas -- la decisión
 * se toma al cerrar la vela y se ejecuta después.
 */
function precioDeSalida(
  razon: ExitReason,
  posicion: BacktestPosition,
  vela: Vela,
  siguiente: Vela,
): number {
  if (razon === "STOP" && posicion.stop !== null) {
    // Si la vela abrió ya pasada del stop, se sale a la apertura y no al
    // nivel: la orden se habría ejecutado ahí, peor. Suponer el nivel sería
    // regalarle a la estrategia un precio que no existió.
    return posicion.direction === "LONG"
      ? Math.min(posicion.stop, vela.open)
      : Math.max(posicion.stop, vela.open);
  }
  if (razon === "OBJETIVO" && posicion.target !== null) {
    return posicion.direction === "LONG"
      ? Math.max(posicion.target, vela.open)
      : Math.min(posicion.target, vela.open);
  }
  return siguiente.open;
}

/** El nivel del stop o del objetivo, en múltiplos del ATR. */
function nivel(
  entrada: number,
  atr: number | null,
  multiplo: number | null,
  direccion: "LONG" | "SHORT",
  cual: "STOP" | "OBJETIVO",
): number | null {
  if (multiplo === null || atr === null || atr <= 0) return null;
  const distancia = atr * multiplo;
  const arriba = cual === "OBJETIVO" ? direccion === "LONG" : direccion === "SHORT";
  return arriba ? entrada + distancia : entrada - distancia;
}

/**
 * El deslizamiento, siempre en contra.
 *
 * Comprar sale un poco más caro y vender un poco más barato. Sin esto, un
 * backtest de estrategias rápidas sale siempre ganando: en el papel se entra
 * al precio exacto de la vela y en el mercado no.
 */
function aplicarDeslizamiento(precio: number, side: "BUY" | "SELL", costs: BacktestCosts): number {
  const desplazamiento = costs.slippageTicks * costs.tickSize;
  return side === "BUY" ? precio + desplazamiento : precio - desplazamiento;
}

function crearFill(
  time: number,
  side: "BUY" | "SELL",
  price: number,
  size: number,
  costs: BacktestCosts,
  reason: SimulatedFill["reason"],
): SimulatedFill {
  return {
    time,
    side,
    price,
    size,
    commission: new Decimal(costs.feePerContract).times(size).toNumber(),
    reason,
  };
}

/**
 * Un fill simulado con la forma exacta que espera el motor de reconstrucción.
 *
 * Los números van como cadenas decimales, igual que los de Coinbase, para que
 * el motor haga con ellos lo mismo y no tenga que distinguir de dónde vienen.
 * El identificador lleva el índice para que sea estable y único, que es lo que
 * el motor usa como desempate al ordenar.
 */
function aReconstruccion(
  fill: SimulatedFill,
  indice: number,
  productId: string,
): ReconstructionFillInput {
  const iso = new Date(fill.time * 1000).toISOString();
  return {
    entryId: `backtest-${String(indice).padStart(6, "0")}`,
    productId,
    side: fill.side,
    price: String(fill.price),
    size: String(fill.size),
    commission: String(fill.commission),
    sequenceTimestamp: iso,
    tradeTime: iso,
    tradeType: "FILL",
    hasFutureLegs: false,
  };
}
