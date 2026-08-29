import type { IndicatorId } from "@/lib/charts/indicators";

/**
 * Una estrategia de backtest, descrita con bloques y no con código.
 *
 * La forma la decide una restricción concreta: esto tiene que poder
 * **guardarse en la base de datos y editarse desde una pantalla**. Una
 * estrategia que fuera una función de JavaScript no se puede ni guardar ni
 * enseñar en un formulario, y una que fuera un lenguaje propio obliga a
 * escribir un intérprete -- y a mantenerlo -- antes de poder probar la
 * primera idea.
 *
 * Así que son condiciones sobre lo que el gráfico ya sabe calcular: los mismos
 * indicadores, la misma sesión, los mismos precios. Nada de lo que hay aquí
 * necesita un dato que la plataforma no tenga ya.
 *
 * Puro: describe la estrategia, no la ejecuta.
 */

/** De dónde sale el número que se compara. */
export type OperandKind =
  /** Un precio de la vela: apertura, máximo, mínimo o cierre. */
  | "PRECIO"
  /** El valor de un indicador en esa vela. */
  | "INDICADOR"
  /** Una constante que escribes tú. */
  | "NUMERO";

export type PriceField = "OPEN" | "HIGH" | "LOW" | "CLOSE";

export interface Operand {
  kind: OperandKind;
  /** Cuando `kind` es PRECIO. */
  field?: PriceField;
  /** Cuando `kind` es INDICADOR. */
  indicator?: IndicatorId;
  /** Cuando `kind` es NUMERO. */
  value?: number;
}

/**
 * Cómo se comparan los dos lados.
 *
 * `CRUZA_ARRIBA` y `CRUZA_ABAJO` no son «mayor que» y «menor que»: miran
 * también la vela anterior. Es la diferencia entre «la EMA rápida está por
 * encima» -- verdad durante treinta velas seguidas -- y «acaba de cruzar»,
 * que pasa en una. Sin el cruce, una estrategia de cruce de medias entraría
 * en cada vela mientras dure la tendencia.
 */
export type Comparator =
  | "MAYOR"
  | "MENOR"
  | "CRUZA_ARRIBA"
  | "CRUZA_ABAJO";

export const COMPARATOR_LABELS: Record<Comparator, string> = {
  MAYOR: "es mayor que",
  MENOR: "es menor que",
  CRUZA_ARRIBA: "cruza hacia arriba",
  CRUZA_ABAJO: "cruza hacia abajo",
};

export interface Condition {
  left: Operand;
  comparator: Comparator;
  right: Operand;
}

/** Cómo se cierra una posición abierta. */
export interface ExitRules {
  /**
   * Stop en múltiplos del ATR de la vela de entrada.
   *
   * En ATR y no en dólares ni en porcentaje fijo, porque es lo único que se
   * adapta a lo que se mueve el mercado ese día: un stop de cien dólares es
   * enorme en una sesión tranquila y ridículo en una volátil, y una estrategia
   * probada con uno de los dos no dice nada del otro.
   */
  stopAtr: number | null;
  /** Objetivo, también en múltiplos del ATR. */
  targetAtr: number | null;
  /** Cerrar por tiempo si no ha saltado ni el stop ni el objetivo. */
  maxBars: number | null;
  /** Condiciones que también cierran, si se cumple cualquiera. */
  conditions: Condition[];
}

export interface Strategy {
  name: string;
  /** LONG, SHORT o las dos. */
  direction: "LONG" | "SHORT" | "BOTH";
  /** Se entra cuando **todas** se cumplen. */
  entry: Condition[];
  exit: ExitRules;
  /** Cuántos contratos por operación. */
  size: number;
  /**
   * Sólo dentro de estas horas locales, 0-23. Vacío = a cualquier hora.
   *
   * Está aquí y no como una condición más porque el horario es la regla que
   * más se toca al ajustar una estrategia, y enterrada entre condiciones
   * genéricas se pierde.
   */
  hours: number[];
}

export const EMPTY_STRATEGY: Strategy = {
  name: "",
  direction: "LONG",
  entry: [],
  exit: { stopAtr: 2, targetAtr: 3, maxBars: 48, conditions: [] },
  size: 1,
  hours: [],
};

/** Qué comisión se cobra, para que el resultado no salga optimista. */
export interface BacktestCosts {
  /** Comisión por contrato y lado, en dinero. */
  feePerContract: number;
  /**
   * Deslizamiento en ticks, aplicado en contra en cada entrada y salida.
   *
   * Sin esto un backtest de estrategias rápidas sale siempre ganando: en el
   * papel se entra al precio exacto de la vela, y en el mercado no.
   */
  slippageTicks: number;
  tickSize: number;
}

export const DEFAULT_COSTS: BacktestCosts = {
  feePerContract: 0.5,
  slippageTicks: 1,
  tickSize: 1,
};

/** Una entrada o salida simulada, antes de pasar por el motor de verdad. */
export interface SimulatedFill {
  time: number;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  commission: number;
  reason: ExitReason | "ENTRADA";
}

export type ExitReason = "STOP" | "OBJETIVO" | "TIEMPO" | "CONDICION" | "FIN_DE_DATOS";

export const EXIT_REASON_LABELS: Record<ExitReason, string> = {
  STOP: "Saltó el stop",
  OBJETIVO: "Llegó al objetivo",
  TIEMPO: "Se agotó el tiempo",
  CONDICION: "Se cumplió una condición de salida",
  FIN_DE_DATOS: "Se acabaron las velas",
};
