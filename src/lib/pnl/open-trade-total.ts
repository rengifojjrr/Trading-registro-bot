import { Decimal } from "decimal.js";

/**
 * Lo que llevas ganado o perdido en una operación que todavía está abierta.
 *
 * Son dos cifras distintas y la aplicación sólo enseñaba una. Una operación en
 * la que has cerrado parte y mantienes el resto tiene:
 *
 * - **lo realizado**: dinero que ya está en la cuenta, de los contratos que
 *   cerraste. No cambia. Vive en `trades.net_pnl`.
 * - **lo no realizado**: lo que valdría cerrar ahora lo que queda abierto.
 *   Cambia cada segundo y no es dinero hasta que cierres.
 *
 * La ficha enseñaba lo segundo y escondía lo primero. En la posición del 19 de
 * agosto eso significó ver «−2.720 no realizado» y no ver por ningún lado los
 * +862 que ya estaban ganados y cerrados. Sumar las dos en una sola cifra
 * tampoco vale: mezclaría dinero que ya tienes con dinero que depende del
 * precio de dentro de un minuto.
 *
 * Así que se enseñan las tres: las dos por separado y el total, que es la que
 * contesta «¿cómo va esto?».
 */

export interface OpenTradeTotals {
  /** Lo cerrado, neto de comisiones. Null si no se ha cerrado nada todavía. */
  realized: string | null;
  /** Lo que queda abierto, a precio de mercado y sin comisiones de salida. */
  unrealized: string;
  /** La suma. Es una estimación mientras haya algo abierto, y se dice. */
  total: string;
  /** Cuántos contratos ya se cerraron; cero significa que no hay realizado. */
  closedQty: string;
  openQty: string;
}

export function summariseOpenTrade(input: {
  /** `trades.net_pnl`: lo realizado de los contratos ya cerrados. */
  realizedNetPnl: string | number | null;
  /** Lo que devuelve `calculateUnrealizedPnl` para lo que sigue abierto. */
  unrealizedGrossPnl: string | number;
  totalEntryQty: string | number;
  totalExitQty: string | number;
}): OpenTradeTotals {
  const closedQty = new Decimal(input.totalExitQty || 0);
  const openQty = new Decimal(input.totalEntryQty || 0).minus(closedQty);
  const unrealized = new Decimal(input.unrealizedGrossPnl || 0);

  // Sin nada cerrado no hay realizado, y enseñar «0,00» invitaría a leerlo
  // como «he cerrado algo y me he quedado a cero», que es otra cosa.
  const hayRealizado = closedQty.greaterThan(0) && input.realizedNetPnl !== null;
  const realized = hayRealizado ? new Decimal(input.realizedNetPnl ?? 0) : null;

  return {
    realized: realized ? realized.toString() : null,
    unrealized: unrealized.toString(),
    total: (realized ?? new Decimal(0)).plus(unrealized).toString(),
    closedQty: closedQty.toString(),
    openQty: openQty.toString(),
  };
}
