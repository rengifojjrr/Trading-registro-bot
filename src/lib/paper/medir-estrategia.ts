import { Decimal } from "decimal.js";

import { runBacktest } from "@/lib/backtest/engine";
import { computeMetrics } from "@/lib/backtest/metrics";
import type { Strategy } from "@/lib/backtest/types";
import type { Vela } from "@/lib/charts/indicators";

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
  /** Sobre el capital que hacía falta para sostener una unidad al principio. */
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

  // El capital es lo que costaba sostener una unidad al principio: el motor
  // opera un contrato, así que el porcentaje sólo significa algo medido contra
  // lo que ese contrato costaba. Es lo mismo que hace el simulador de papel al
  // repartir el 100% del capital en una posición.
  const capital = new Decimal(velas[0].close);
  if (capital.lte(0)) return null;

  const neto = new Decimal(metricas.neto);
  const drawdown = new Decimal(metricas.drawdown);

  const brutoGanado = new Decimal(metricas.mediaGanadora).times(metricas.ganadoras);
  const brutoPerdido = new Decimal(metricas.mediaPerdedora).times(metricas.perdedoras).abs();

  return {
    pnlPct: neto.div(capital).times(100).toDecimalPlaces(2).toNumber(),
    ddPct: drawdown.div(capital).times(100).abs().toDecimalPlaces(2).toNumber(),
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
