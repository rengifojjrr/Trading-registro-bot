import type { BlockAllocation } from "./blocks";
import { percentile } from "./montecarlo";
import { BLOCK_DEVIATION_ALERT_POINTS, BLOCK_LABELS, type BotBlock } from "./types";

/**
 * El riesgo del portfolio entero: cuánto se puede perder en un día y de qué
 * está hecho lo que hay dentro.
 *
 * La escalera del kill-switch mira hacia atrás -- cuánto se ha caído ya -- y
 * el reparto en bloques mira la composición. Falta la pregunta de mañana:
 * «si mañana es un mal día, ¿cuánto de malo puede ser?». Eso es el VaR, y su
 * hermano el CVaR contesta la que de verdad importa: «y cuando sea uno de los
 * peores, ¿cuánto se pierde de media?».
 *
 * Puro.
 */

/** El nivel de confianza del VaR: la pérdida que sólo se supera un día de cada veinte. */
export const NIVEL_VAR = 95;

/** El del CVaR, que mira la cola: la media del peor 1% de los días. */
export const NIVEL_CVAR = 99;

/**
 * Días de muestra por debajo de los cuales el VaR no significa nada.
 *
 * Un VaR calculado con cinco observaciones es un número decorativo: da una
 * cifra con dos decimales que se lee como si fuera una medida y no lo es,
 * porque el percentil 5 de cinco datos es sencillamente el peor de los cinco.
 * Con menos de treinta días se sigue calculando -- ver un número aproximado es
 * mejor que no ver nada -- pero se avisa en la misma tarjeta, porque el
 * peligro de una cifra decorativa es que alguien la use para dimensionar.
 */
export const MINIMO_DIAS_PARA_VAR = 30;

export interface LecturaDeRiesgoDiario {
  /** Días naturales de la muestra. */
  dias: number;
  /** Pérdida diaria que sólo se supera un 5% de los días, en dinero y positiva. */
  var95: number;
  /** Media de las pérdidas del peor 1% de días, en dinero y positiva. */
  cvar99: number;
  /** Las dos anteriores sobre el capital, 0-100. `null` sin tamaño de cuenta. */
  var95Pct: number | null;
  cvar99Pct: number | null;
  /** El peor día de la muestra, en dinero y positivo. */
  peorDia: number;
  /** Cuántos días de la muestra acabaron en pérdida. */
  diasEnPerdida: number;
  /** Menos de treinta días: la cifra es orientativa y hay que decirlo. */
  muestraCorta: boolean;
  /** El CVaR se calculó sobre un solo día porque no hay cola que promediar. */
  cvarSobreUnSoloDia: boolean;
  nota: string;
}

export interface DesvioDeBloque {
  bloque: BotBlock;
  /** Lo que dice el método: 40 / 40 / 20. */
  objetivo: number;
  real: number;
  /** Puntos porcentuales de más o de menos. */
  desvio: number;
  /** Si se ha salido de la banda de diez puntos. */
  fuera: boolean;
  bots: number;
}

export interface RepartoPorBloques {
  filas: DesvioDeBloque[];
  /** Cómo se midió: por tamaño asignado, por número de bots, o nada. */
  base: BlockAllocation["basis"];
  /** El bloque más desviado, para el titular. */
  peor: DesvioDeBloque | null;
  /** Si alguno se sale de la banda. */
  desvia: boolean;
  totalSizingPct: number;
}

export interface RiesgoDelPortfolio {
  diario: LecturaDeRiesgoDiario | null;
  bloques: RepartoPorBloques;
  /** Lo que la pantalla tiene que decir arriba, en orden de importancia. */
  avisos: string[];
}

/**
 * VaR y CVaR históricos sobre el P&L diario del conjunto.
 *
 * Históricos quiere decir por percentil de la muestra: se ordenan los días de
 * peor a mejor y se lee el que corta el 5%. No es el VaR paramétrico -- media,
 * desviación típica y una normal -- a propósito. El paramétrico supone que los
 * retornos se reparten como una campana, y los de cripto no: tienen las colas
 * gordas y asimétricas, así que la normal subestima justo la parte que se está
 * intentando medir, la de los días malos de verdad. El precio de no suponer
 * nada es que hace falta muestra; de ahí el aviso de los treinta días.
 *
 * Se mide en dinero porque es lo que hay -- el P&L diario --, y el porcentaje
 * sale de dividir por el capital. Sin capital, queda a `null` en vez de
 * inventarse una base.
 */
export function riesgoDiario(
  pnlDiario: number[],
  accountSize: number | null,
): LecturaDeRiesgoDiario | null {
  if (pnlDiario.length === 0) return null;

  const ordenados = [...pnlDiario].sort((a, b) => a - b);
  const dias = ordenados.length;

  // El corte del 5% peor. Si a esa altura el día todavía es ganador, la
  // pérdida esperada es cero: no se inventa un negativo que no existe.
  const corte = percentile(ordenados, 100 - NIVEL_VAR);
  const var95 = Math.max(0, -corte);

  // La cola: al menos un día, porque el 1% de treinta días es un tercio de día
  // y de un tercio de día no se saca una media.
  const enLaCola = Math.max(1, Math.floor((dias * (100 - NIVEL_CVAR)) / 100));
  const peores = ordenados.slice(0, enLaCola);
  const cvar99 = Math.max(0, -(peores.reduce((acc, v) => acc + v, 0) / peores.length));

  const pct = (v: number) => (accountSize && accountSize > 0 ? (v / accountSize) * 100 : null);
  const muestraCorta = dias < MINIMO_DIAS_PARA_VAR;
  const cvarSobreUnSoloDia = enLaCola === 1;

  return {
    dias,
    var95,
    cvar99,
    var95Pct: pct(var95),
    cvar99Pct: pct(cvar99),
    peorDia: Math.max(0, -ordenados[0]),
    diasEnPerdida: ordenados.filter((v) => v < 0).length,
    muestraCorta,
    cvarSobreUnSoloDia,
    nota: notaDeLaMuestra(dias, muestraCorta, cvarSobreUnSoloDia),
  };
}

/**
 * El reparto real contra el 40/40/20, bloque a bloque.
 *
 * No recalcula nada: el reparto ya lo hace `blockAllocation`, que además sabe
 * que sólo cuentan los bots con dinero de verdad. Aquí se le pone encima la
 * lectura de riesgo -- cuánto se desvía cada uno y cuál es el peor -- para que
 * la tarjeta no tenga que hacer cuentas.
 */
export function repartoPorBloques(allocation: BlockAllocation): RepartoPorBloques {
  const filas: DesvioDeBloque[] = allocation.rows.map((r) => ({
    bloque: r.block,
    objetivo: r.target,
    real: r.actual,
    desvio: r.delta,
    fuera: Math.abs(r.delta) > BLOCK_DEVIATION_ALERT_POINTS,
    bots: r.bots,
  }));

  const peor =
    allocation.basis === "NONE"
      ? null
      : filas.reduce((a, b) => (Math.abs(b.desvio) > Math.abs(a.desvio) ? b : a));

  return {
    filas,
    base: allocation.basis,
    peor,
    desvia: filas.some((f) => f.fuera) && allocation.basis !== "NONE",
    totalSizingPct: allocation.totalSizingPct,
  };
}

export function riesgoDelPortfolio(entrada: {
  /** El P&L de cada día natural, con los días sin operar a cero. */
  pnlDiario: number[];
  accountSize: number | null;
  allocation: BlockAllocation;
}): RiesgoDelPortfolio {
  const diario = riesgoDiario(entrada.pnlDiario, entrada.accountSize);
  const bloques = repartoPorBloques(entrada.allocation);
  const avisos: string[] = [];

  if (diario === null) {
    avisos.push("Todavía no hay ningún día con operaciones cerradas: no hay VaR que calcular.");
  } else {
    if (diario.muestraCorta) avisos.push(diario.nota);
    if (diario.var95Pct === null) {
      avisos.push(
        "Falta el tamaño de la cuenta, así que el VaR sale en dinero pero no en porcentaje del capital.",
      );
    }
  }

  for (const fila of bloques.filas.filter((f) => f.fuera)) {
    avisos.push(
      `${BLOCK_LABELS[fila.bloque]} al ${fila.real.toFixed(0)}% con un objetivo del ${fila.objetivo}%: ` +
        `${Math.abs(fila.desvio).toFixed(0)} puntos de desvío. Se rebalancea en la revisión mensual.`,
    );
  }

  return { diario, bloques, avisos };
}

function notaDeLaMuestra(dias: number, muestraCorta: boolean, cvarSobreUnSoloDia: boolean): string {
  if (muestraCorta) {
    return (
      `Sólo ${dias} día${dias === 1 ? "" : "s"} de muestra y hacen falta ${MINIMO_DIAS_PARA_VAR}. ` +
      "Con tan pocos, el percentil no mide nada: es el peor día de la lista con dos decimales."
    );
  }
  if (cvarSobreUnSoloDia) {
    return (
      `Percentil histórico sobre ${dias} días. El peor 1% de esa muestra es un solo día, ` +
      "así que el CVaR al 99% es ese día y no una media de la cola."
    );
  }
  return `Percentil histórico sobre ${dias} días de P&L, sin suponer que los retornos sean normales.`;
}
