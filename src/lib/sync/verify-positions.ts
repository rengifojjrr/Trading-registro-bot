import "server-only";

import type { CoinbaseFuturesPosition } from "@/lib/coinbase/types";
import { raiseNotification } from "@/lib/notifications/create";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  comparePositions,
  describeMismatch,
  type PositionMismatch,
  type ReconstructedPosition,
} from "./position-check";

/**
 * Preguntarle a Coinbase cuántos contratos hay y compararlo con lo nuestro.
 *
 * Se llama al final de cada sincronización. Lo que busca es el fallo que no
 * se ve: una operación cerrada de verdad que aquí figura abierta porque falta
 * un fill por el medio. No da error, no rompe nada, sólo deja de contar en
 * las cifras -- y sin esta comprobación no hay forma de enterarse.
 *
 * **Nunca corrige nada.** Registra la diferencia y avisa. Cuadrar la posición
 * a la fuerza inventaría un fill que nadie hizo, y este módulo entero existe
 * porque los números tienen que poder reconstruirse desde datos crudos.
 */

/** Cuántos contratos dice cada operación abierta que quedan, con signo. */
async function reconstructedPositions(
  userId: string,
  accountId: string,
): Promise<ReconstructedPosition[]> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("trades")
    .select("product_id, direction, total_entry_qty, total_exit_qty")
    .eq("user_id", userId)
    .is("orphaned_at", null)
    .eq("account_id", accountId)
    .eq("status", "OPEN");

  const byProduct = new Map<string, number>();
  for (const trade of data ?? []) {
    const open = Number(trade.total_entry_qty) - Number(trade.total_exit_qty);
    if (!Number.isFinite(open)) continue;
    const signed = trade.direction === "SHORT" ? -open : open;
    byProduct.set(trade.product_id, (byProduct.get(trade.product_id) ?? 0) + signed);
  }

  return [...byProduct].map(([productId, size]) => ({ productId, size: String(size) }));
}

export interface PositionCheckResult {
  /** Falso cuando no se pudo preguntar: sin posiciones no hay nada que decir. */
  checked: boolean;
  mismatches: PositionMismatch[];
}

export async function verifyPositions(params: {
  /**
   * El adaptador del broker, sin tipar.
   *
   * La sincronización sólo conoce el `MarketDataPort`, que no declara
   * posiciones porque INTX no las expone -- ver `venues/intx.ts`. Pedir aquí
   * un tipo con el método opcional no vale: TypeScript rechaza asignar un
   * objeto que no comparte **ninguna** propiedad con él. Así que se recibe sin
   * tipo y se comprueba en tiempo de ejecución, que es lo que de verdad
   * decide si el broker sabe contestar.
   */
  adapter: unknown;
  userId: string;
  accountId: string;
  runId: string;
}): Promise<PositionCheckResult> {
  const { adapter, userId, accountId, runId } = params;

  // INTX no expone posiciones. Sin ellas no se comprueba nada, y eso es
  // distinto de comprobar y no encontrar nada.
  const listOpenPositions = (
    adapter as { listOpenPositions?: () => Promise<CoinbaseFuturesPosition[]> }
  ).listOpenPositions;

  if (typeof listOpenPositions !== "function") {
    return { checked: false, mismatches: [] };
  }

  let venue: CoinbaseFuturesPosition[];
  try {
    venue = await listOpenPositions.call(adapter);
  } catch {
    // Un fallo preguntando por las posiciones no puede tumbar una
    // sincronización que ya trajo los fills y reconstruyó bien.
    return { checked: false, mismatches: [] };
  }

  const ours = await reconstructedPositions(userId, accountId);
  const mismatches = comparePositions(ours, venue);
  if (mismatches.length === 0) return { checked: true, mismatches: [] };

  const supabase = createAdminClient();

  await supabase.from("reconciliation_discrepancies").insert(
    mismatches.map((mismatch) => ({
      user_id: userId,
      reconciliation_run_id: runId,
      discrepancy_type: "POSITION_MISMATCH" as const,
      entity_type: "product",
      entity_id: mismatch.productId,
      expected: { contratos: mismatch.venue },
      actual: { contratos: mismatch.reconstructed, diferencia: mismatch.difference },
    })),
  );

  await raiseNotification({
    userId,
    type: "DISCREPANCY",
    severity: "CRITICAL",
    title: "La posición no cuadra con Coinbase",
    message:
      `${mismatches.map(describeMismatch).join(" ")} ` +
      "Suele significar que falta un fill por importar, y mientras tanto la " +
      "operación se queda abierta aquí aunque la hayas cerrado.",
    relatedEntityType: "account",
    relatedEntityId: accountId,
    // Una posición que no cuadra sigue sin cuadrar en la siguiente
    // sincronización: sin esto saldría un aviso cada cinco minutos.
    dedupKey: `position-mismatch:${accountId}:${mismatches.map((m) => m.productId).join(",")}`,
  });

  return { checked: true, mismatches };
}
