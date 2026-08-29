import { z } from "zod";

import { DEFAULT_COSTS, EMPTY_STRATEGY, type BacktestCosts, type Strategy } from "./types";

/**
 * La forma de una estrategia guardada, y cómo se lee sin fiarse.
 *
 * Vive aparte de las acciones de servidor por dos motivos. El primero es
 * técnico: un archivo con `"use server"` sólo puede exportar funciones
 * asíncronas, y esto exporta esquemas y funciones normales. El segundo es que
 * la pantalla necesita los mismos esquemas para validar antes de mandar, y dos
 * validaciones distintas -- una amable en el cliente y otra en el servidor --
 * acaban discrepando; el síntoma es un formulario que deja guardar algo que
 * luego no se puede ejecutar.
 *
 * Puro.
 */

export const operandSchema = z.object({
  kind: z.enum(["PRECIO", "INDICADOR", "NUMERO"]),
  field: z.enum(["OPEN", "HIGH", "LOW", "CLOSE"]).optional(),
  indicator: z.string().optional(),
  value: z.number().finite().optional(),
});

export const conditionSchema = z.object({
  left: operandSchema,
  comparator: z.enum(["MAYOR", "MENOR", "CRUZA_ARRIBA", "CRUZA_ABAJO"]),
  right: operandSchema,
});

export const strategySchema = z.object({
  name: z.string().trim().min(1).max(80),
  direction: z.enum(["LONG", "SHORT", "BOTH"]),
  // Un tope de ocho condiciones no es una limitación técnica: una estrategia
  // con quince reglas no se puede ni leer ni ajustar, y lo que se guarda aquí
  // hay que poder mirarlo dentro de tres meses y entenderlo.
  entry: z.array(conditionSchema).max(8),
  exit: z.object({
    stopAtr: z.number().positive().max(50).nullable(),
    targetAtr: z.number().positive().max(50).nullable(),
    maxBars: z.number().int().positive().max(5000).nullable(),
    conditions: z.array(conditionSchema).max(8),
  }),
  size: z.number().positive().max(10000),
  hours: z.array(z.number().int().min(0).max(23)).max(24),
});

export const costsSchema = z.object({
  feePerContract: z.number().min(0).max(1000),
  slippageTicks: z.number().min(0).max(100),
  tickSize: z.number().positive().max(10000),
});

/**
 * Una estrategia leída de la base, o una vacía.
 *
 * Cae entera a la vacía y no campo a campo: al contrario que el estilo de un
 * dibujo, aquí media estrategia no es media estrategia -- es una que entra
 * donde no debe. Más vale enseñar el formulario en blanco que correr reglas
 * que nadie escribió.
 */
export function parseStoredStrategy(rules: unknown): Strategy {
  const parsed = strategySchema.safeParse(rules);
  return parsed.success ? (parsed.data as Strategy) : { ...EMPTY_STRATEGY };
}

export function parseStoredCosts(costs: unknown): BacktestCosts {
  const parsed = costsSchema.safeParse(costs);
  return parsed.success ? parsed.data : { ...DEFAULT_COSTS };
}
