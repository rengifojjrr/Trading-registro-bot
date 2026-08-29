import { computeIndicator, type Serie, type Vela } from "@/lib/charts/indicators";

import type { Condition, Operand, Strategy } from "./types";

/**
 * Evaluar las condiciones de una estrategia sobre una serie de velas.
 *
 * Todo se precalcula una vez y se consulta por índice: una condición sobre la
 * EMA 21 en la vela 4.000 no puede recalcular la EMA entera cada vez, o probar
 * una estrategia sobre un año de velas de un minuto tardaría minutos en vez de
 * milisegundos.
 *
 * Puro. Sin esto separado, el motor tendría dentro tanto «cuándo entrar» como
 * «qué pasa cuando entras», y las dos cosas fallan de formas distintas.
 */

/** Todas las series que una estrategia necesita, calculadas una sola vez. */
export interface EvaluationContext {
  velas: Vela[];
  series: Map<string, Serie>;
}

/** Los indicadores que menciona una estrategia, sin repetidos. */
export function indicatorsUsed(strategy: Strategy): string[] {
  const usados = new Set<string>();

  const desdeCondicion = (c: Condition) => {
    for (const lado of [c.left, c.right]) {
      if (lado.kind === "INDICADOR" && lado.indicator) usados.add(lado.indicator);
    }
  };

  strategy.entry.forEach(desdeCondicion);
  strategy.exit.conditions.forEach(desdeCondicion);

  // El ATR hace falta siempre que haya stop u objetivo, aunque ninguna
  // condición lo mencione: los dos se miden en múltiplos suyos.
  if (strategy.exit.stopAtr !== null || strategy.exit.targetAtr !== null) usados.add("ATR14");

  return [...usados];
}

export function buildContext(strategy: Strategy, velas: Vela[]): EvaluationContext {
  const sesionDe = (t: number) => String(Math.floor(t / 86400));
  const series = new Map<string, Serie>();

  for (const id of indicatorsUsed(strategy)) {
    // `computeIndicator` sólo entiende identificadores del catálogo; los que
    // no lo sean se quedan fuera y sus condiciones nunca se cumplen, que es
    // más seguro que inventar una serie.
    series.set(id, computeIndicator(id as never, velas, sesionDe));
  }

  return { velas, series };
}

/**
 * El valor de un operando en una vela concreta.
 *
 * `null` cuando no se puede saber -- un indicador que todavía no arrancó --
 * y ese `null` se propaga: una condición sobre un valor que no existe no se
 * cumple, no se aproxima.
 */
export function operandValue(op: Operand, ctx: EvaluationContext, i: number): number | null {
  if (i < 0 || i >= ctx.velas.length) return null;

  switch (op.kind) {
    case "NUMERO":
      return typeof op.value === "number" && Number.isFinite(op.value) ? op.value : null;
    case "PRECIO": {
      const vela = ctx.velas[i];
      switch (op.field) {
        case "OPEN":
          return vela.open;
        case "HIGH":
          return vela.high;
        case "LOW":
          return vela.low;
        default:
          return vela.close;
      }
    }
    case "INDICADOR": {
      if (!op.indicator) return null;
      return ctx.series.get(op.indicator)?.[i] ?? null;
    }
  }
}

/**
 * Si una condición se cumple en la vela `i`.
 *
 * Los cruces miran también `i - 1`: sin la vela anterior, «cruza hacia arriba»
 * sería lo mismo que «está por encima», que es verdad durante treinta velas
 * seguidas en vez de en una. Una estrategia de cruce de medias entraría en
 * cada vela mientras dure la tendencia.
 */
export function conditionHolds(cond: Condition, ctx: EvaluationContext, i: number): boolean {
  const izq = operandValue(cond.left, ctx, i);
  const der = operandValue(cond.right, ctx, i);
  if (izq === null || der === null) return false;

  if (cond.comparator === "MAYOR") return izq > der;
  if (cond.comparator === "MENOR") return izq < der;

  const izqAntes = operandValue(cond.left, ctx, i - 1);
  const derAntes = operandValue(cond.right, ctx, i - 1);
  if (izqAntes === null || derAntes === null) return false;

  if (cond.comparator === "CRUZA_ARRIBA") return izqAntes <= derAntes && izq > der;
  return izqAntes >= derAntes && izq < der;
}

/** Todas las condiciones, en `y`. Sin ninguna, nunca se entra. */
export function allHold(conditions: Condition[], ctx: EvaluationContext, i: number): boolean {
  // Una lista vacía significaría «entrar en cada vela», que es un backtest
  // sin estrategia y con muchísimas operaciones. Se exige al menos una.
  if (conditions.length === 0) return false;
  return conditions.every((c) => conditionHolds(c, ctx, i));
}

/** Cualquiera de ellas. Sin ninguna, nunca cierra por condición. */
export function anyHolds(conditions: Condition[], ctx: EvaluationContext, i: number): boolean {
  return conditions.some((c) => conditionHolds(c, ctx, i));
}

/**
 * Si la vela cae dentro del horario de la estrategia.
 *
 * En hora UTC porque es lo que traen las velas; el horario se elige mirando el
 * gráfico, así que lo que importa es que las dos cosas usen la misma
 * referencia, no cuál.
 */
export function withinHours(strategy: Strategy, time: number): boolean {
  if (strategy.hours.length === 0) return true;
  const hora = new Date(time * 1000).getUTCHours();
  return strategy.hours.includes(hora);
}

/**
 * Los problemas de una estrategia antes de correrla.
 *
 * Correr una estrategia imposible y devolver «cero operaciones» es peor que
 * decir por qué: el usuario piensa que la idea no funciona, cuando lo que pasa
 * es que le falta una regla.
 */
export function validateStrategy(strategy: Strategy): string[] {
  const problemas: string[] = [];

  if (strategy.entry.length === 0) {
    problemas.push("Sin ninguna condición de entrada no hay nada que probar.");
  }
  if (
    strategy.exit.stopAtr === null &&
    strategy.exit.targetAtr === null &&
    strategy.exit.maxBars === null &&
    strategy.exit.conditions.length === 0
  ) {
    problemas.push("Sin ninguna forma de salir, las operaciones no se cerrarían nunca.");
  }
  if (strategy.size <= 0) {
    problemas.push("El tamaño tiene que ser mayor que cero.");
  }
  for (const cond of [...strategy.entry, ...strategy.exit.conditions]) {
    if (cond.left.kind === "NUMERO" && cond.right.kind === "NUMERO") {
      problemas.push("Una condición que compara dos números fijos siempre da lo mismo.");
      break;
    }
  }

  return problemas;
}
