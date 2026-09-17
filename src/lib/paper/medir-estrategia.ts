import { Decimal } from "decimal.js";

import { runBacktest, type SimulatedTrade } from "@/lib/backtest/engine";
import { computeMetrics } from "@/lib/backtest/metrics";
import type { Strategy } from "@/lib/backtest/types";
import type { Vela } from "@/lib/charts/indicators";
import { calculatePnl } from "@/lib/pnl/calculate";

/**
 * Medir una estrategia de la biblioteca sobre histórico real.
 *
 * De las veintidós del catálogo, once salían como «Sin medir». No era un
 * descuido: la regla del módulo prohíbe escribirles cifras a mano --«un número
 * de rentabilidad inventado en una ficha que el usuario va a enseñar es una
 * mentira, y una que nadie va a poder detectar»-- y esas once no estaban en el
 * estudio de agosto. La salida es medirlas, no rellenarlas.
 *
 * Se mide con el mismo `runBacktest` y las mismas `computeMetrics` con las que
 * se midieron las otras, para que las cifras de una ficha y las de la de al
 * lado signifiquen lo mismo. Lo único que se añade aquí es traducir el
 * resultado a las cuatro cifras con las que se comparan estrategias, y decir
 * con qué supuestos se llegó a ellas.
 *
 * **Lo que esto no es**: una promesa. Es lo que habría hecho esta regla sobre
 * las velas que hubo, con unos costes supuestos y sin apalancamiento. La
 * ventana se guarda con la medición justamente porque un +30% en doce días de
 * velas de cinco minutos y un +30% en cinco años no son la misma frase, y sin
 * la ventana las dos se leen igual.
 */

/** Las cuatro cifras, y sobre qué se sacaron. */
export interface Medicion {
  /** Compuesto: cada operación gana o pierde un porcentaje de lo que había. */
  pnlPct: number;
  ddPct: number;
  trades: number;
  /** Bruto ganado entre bruto perdido. Null cuando no perdió nunca: dividir por cero no es infinito, es «no se sabe». */
  profitFactor: number | null;
  velas: number;
  desde: string;
  hasta: string;
  comisionPct: number;
}

/**
 * La comisión por lado con la que se mide, en porcentaje.
 *
 * Es la que declara el estudio de agosto en la ventana de cada estrategia
 * medida («comisión 0,20% por lado»). Se repite aquí para que lo nuevo y lo
 * viejo se puedan poner en la misma tabla sin una nota al pie.
 */
export const COMISION_POR_LADO_PCT = 0.2;

/**
 * Por qué la comisión se convierte a dinero con el precio medio.
 *
 * El motor cobra `feePerContract`: una cantidad fija de dinero por contrato y
 * lado. Una comisión de exchange es un porcentaje del importe, y sobre un
 * histórico largo de Bitcoin ese porcentaje son cantidades muy distintas al
 * principio y al final. Cobrar el porcentaje del precio **medio** de la
 * ventana es la aproximación que cabe sin tocar el motor: sobreestima el coste
 * de las operaciones baratas y lo subestima en las caras, y en conjunto queda
 * cerca. Se dice aquí y se guarda con la medición en vez de disimularlo.
 */
function comisionEnDinero(velas: Vela[]): number {
  const medio = velas.reduce((suma, v) => suma + v.close, 0) / velas.length;
  return (medio * COMISION_POR_LADO_PCT) / 100;
}

/** Lo mínimo para que una medición signifique algo. */
export const VELAS_MINIMAS = 60;

/**
 * Mide, o dice por qué no puede.
 *
 * Devuelve null en vez de unas cifras malas cuando no hay histórico
 * suficiente: una medición sobre veinte velas es ruido con aspecto de dato, y
 * el aspecto es lo peligroso.
 */
export function medirSobreVelas(
  estrategia: { reglas: Strategy; mercado: string },
  velas: Vela[],
): Medicion | null {
  if (velas.length < VELAS_MINIMAS) return null;

  const fee = comisionEnDinero(velas);
  const resultado = runBacktest({
    strategy: estrategia.reglas,
    velas,
    productId: estrategia.mercado,
    // El deslizamiento se queda en el del motor: un tick en contra por punta,
    // que es lo que separa un backtest creíble de uno que entra siempre al
    // precio exacto de la vela.
    costs: { feePerContract: fee, slippageTicks: 1, tickSize: 1 },
  });

  const metricas = computeMetrics(resultado.trades, 1);
  const curva = curvaCompuesta(resultado.trades);

  const brutoGanado = new Decimal(metricas.mediaGanadora).times(metricas.ganadoras);
  const brutoPerdido = new Decimal(metricas.mediaPerdedora).times(metricas.perdedoras).abs();

  return {
    pnlPct: curva.retornoPct,
    ddPct: curva.caidaPct,
    trades: metricas.operaciones,
    profitFactor: brutoPerdido.lte(0)
      ? null
      : brutoGanado.div(brutoPerdido).toDecimalPlaces(2).toNumber(),
    velas: velas.length,
    desde: new Date(velas[0].time).toISOString(),
    hasta: new Date(velas[velas.length - 1].time).toISOString(),
    comisionPct: COMISION_POR_LADO_PCT,
  };
}

/**
 * La curva de la estrategia en porcentaje, compuesta operación a operación.
 *
 * Cada operación gana o pierde un porcentaje **de lo que valía la posición al
 * abrirla**, y ese porcentaje se compone sobre lo que hubiera. Es cómo mide el
 * estudio de agosto, y es lo único que funciona sobre una ventana larga.
 *
 * Lo de antes era dividir el P&L en dólares por el cierre de la primera vela
 * --«lo que costaba sostener una unidad al principio»--, y sobre doce días de
 * velas de cinco minutos eso está bien porque el precio apenas se mueve. Sobre
 * diez años de velas diarias es otra cosa: la primera vela de ETH en esta
 * ventana es de noviembre de 2016 y vale **10,84 dólares**, con el precio
 * moviéndose 715 veces de mínimo a máximo. Dividir por 10,84 unos dólares
 * ganados en 2025 daba «+39.495%» y, peor, una caída máxima del **3.090%**.
 *
 * Una caída del 3.090% no es una cifra optimista ni pesimista: es imposible.
 * No se puede perder treinta veces el máximo que se llegó a tener. Y era justo
 * la clase de número que esta biblioteca existe para no publicar -- el módulo
 * prohíbe escribir cifras a mano porque «una mentira que nadie va a poder
 * detectar», y ésta llevaba dentro su propia prueba de que era falsa.
 *
 * Compuesto, la caída está acotada por construcción: es una fracción del
 * máximo alcanzado, así que no puede pasar del 100%.
 *
 * Sin operaciones devuelve ceros y no null: una estrategia que se corrió sobre
 * diez años y no entró ni una vez **sí se midió**, y lo que hay que enseñar es
 * eso --0 operaciones-- y no «Sin medir», que suena a que falta por hacer.
 */
function curvaCompuesta(trades: SimulatedTrade[]): { retornoPct: number; caidaPct: number } {
  let equity = new Decimal(1);
  let pico = new Decimal(1);
  let peor = new Decimal(0);

  for (const simulada of trades) {
    const t = simulada.trade;

    // El mismo `calculatePnl` que usa `computeMetrics`, y que produce el P&L de
    // las operaciones reales de Coinbase. Lo que cambia aquí es contra qué se
    // divide, no cómo se gana.
    const pnl = calculatePnl({
      direction: t.direction,
      entryWap: t.entryWap,
      exitWap: t.exitWap,
      totalEntryQty: t.totalEntryQty,
      totalExitQty: t.totalExitQty,
      entryCommissions: t.entryCommissions,
      exitCommissions: t.exitCommissions,
      contractSize: "1",
    });
    if (pnl.netPnl === null) continue;

    // Lo que costaba la posición al abrirla, en el precio de entonces.
    const nocional = new Decimal(t.entryWap).times(t.totalEntryQty);
    if (nocional.lte(0)) continue;

    equity = equity.times(new Decimal(pnl.netPnl).div(nocional).plus(1));

    // Una cuenta en cero o en negativo se acabó, y lo que venga después no se
    // habría podido operar: no hay dinero con el que hacerlo.
    if (equity.lte(0)) return { retornoPct: -100, caidaPct: 100 };

    if (equity.greaterThan(pico)) pico = equity;
    const caida = pico.minus(equity).div(pico);
    if (caida.greaterThan(peor)) peor = caida;
  }

  return {
    retornoPct: equity.minus(1).times(100).toDecimalPlaces(2).toNumber(),
    caidaPct: peor.times(100).toDecimalPlaces(2).toNumber(),
  };
}

/** La ventana de una medición, dicha como se lee en una ficha. */
export function ventanaEnPalabras(
  medicion: Pick<Medicion, "velas" | "desde" | "hasta" | "comisionPct">,
  mercado: string,
  temporalidad: string,
): string {
  const dia = (iso: string) => iso.slice(0, 10);
  return (
    `${dia(medicion.desde)} → ${dia(medicion.hasta)} (${medicion.velas} velas) ` +
    `en ${mercado} ${temporalidad}, comisión ${String(medicion.comisionPct).replace(".", ",")}% ` +
    `por lado, contado y sin apalancamiento`
  );
}
