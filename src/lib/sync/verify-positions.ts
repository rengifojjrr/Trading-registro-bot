import "server-only";

import { Decimal } from "decimal.js";

import type { CoinbaseFuturesPosition } from "@/lib/coinbase/types";
import { raiseNotification } from "@/lib/notifications/create";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

import {
  comparePositions,
  describeMismatch,
  signedVenueSize,
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
 *
 * Y nunca lanza ni deja de escribir en silencio. Durante semanas la
 * instantánea no se guardó ni una vez -- una columna obligatoria sin valor --
 * y el descuadre tampoco se registró -- una clave ajena que apuntaba a la
 * tabla equivocada -- y ningún error llegó a ninguna parte. La red de
 * seguridad estaba rota y parecía que cuadraba todo. Ahora cada escritura
 * comprueba su error y lo cuenta.
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

  // La instantánea se guarda **siempre**, cuadre o no.
  //
  // Antes sólo se dejaba rastro de los descuadres, y eso hace indistinguibles
  // dos situaciones que no se parecen en nada: «se comprobó y coincidía» y «no
  // se llegó a comprobar». La segunda es justamente la que esconde el fallo, y
  // sin fila no hay forma de saber en cuál de las dos estabas. También es lo
  // que permite responder «¿desde cuándo?» en vez de sólo «¿ahora mismo?».
  await snapshotPositions({ userId, accountId, runId, ours, venue, mismatches });

  // Lo que volvió a cuadrar se cierra solo. Un descuadre que se arregla con la
  // siguiente sincronización -- porque llegó el fill que faltaba, o porque
  // Coinbase había cerrado parte de la posición y aún no lo sabíamos -- no
  // necesita a nadie; seguir enseñándolo sería mentir al revés.
  await settleResolvedMismatches({ userId, accountId, mismatches });

  if (mismatches.length === 0) return { checked: true, mismatches: [] };

  await recordMismatches({ userId, accountId, mismatches });

  await raiseNotification({
    userId,
    type: "DISCREPANCY",
    severity: "CRITICAL",
    title: "La posición no cuadra con Coinbase",
    message:
      `${mismatches.map(describeMismatch).join(" ")} ` +
      "Cuando Coinbase tiene menos contratos que aquí, casi siempre es un cierre " +
      "que ejecutó por su cuenta -- una liquidación, un stop o un objetivo -- y " +
      "que aún no ha llegado; cuando tiene más, falta un fill de apertura por " +
      "importar. Mientras tanto la operación se queda aquí como si no hubiera " +
      "pasado nada.",
    relatedEntityType: "account",
    relatedEntityId: accountId,
    // Una posición que no cuadra sigue sin cuadrar en la siguiente
    // sincronización: sin esto saldría un aviso cada cinco minutos.
    dedupKey: `position-mismatch:${accountId}:${mismatches.map((m) => m.productId).join(",")}`,
  });

  return { checked: true, mismatches };
}

/**
 * Deja constancia de las dos mitades de la comparación, producto a producto.
 *
 * Se recorren los dos lados y no sólo el nuestro: un producto que Coinbase
 * reporta y del que aquí no hay ninguna operación abierta es exactamente el
 * caso que hay que registrar -- posición que existe y la aplicación no ve.
 */
async function snapshotPositions(params: {
  userId: string;
  accountId: string;
  runId: string;
  ours: ReconstructedPosition[];
  venue: CoinbaseFuturesPosition[];
  mismatches: PositionMismatch[];
}): Promise<void> {
  const { userId, accountId, runId, ours, venue, mismatches } = params;
  const supabase = createAdminClient();

  const nuestroPorProducto = new Map(ours.map((p) => [p.productId, p.size]));

  // Coinbase puede devolver varias filas del mismo producto (por vencimiento);
  // se guardan todas juntas y se compara la suma, igual que en la comparación.
  const suyasPorProducto = new Map<string, CoinbaseFuturesPosition[]>();
  for (const posicion of venue) {
    const lista = suyasPorProducto.get(posicion.product_id) ?? [];
    lista.push(posicion);
    suyasPorProducto.set(posicion.product_id, lista);
  }

  const descuadrados = new Set(mismatches.map((m) => m.productId));

  const productos = new Set([...nuestroPorProducto.keys(), ...suyasPorProducto.keys()]);
  if (productos.size === 0) return;

  const filas = [...productos].map((productId) => {
    const suyas = suyasPorProducto.get(productId) ?? [];
    const conSigno = suyas.map(signedVenueSize).filter((s): s is Decimal => s !== null);
    const venueSize =
      conSigno.length > 0 ? conSigno.reduce((a, b) => a.plus(b), new Decimal(0)) : null;
    const primera = suyas[0];

    return {
      user_id: userId,
      account_id: accountId,
      sync_run_id: runId,
      product_id: productId,
      side:
        venueSize === null || venueSize.isZero()
          ? (primera?.side ?? null)
          : venueSize.isNegative()
            ? ("SHORT" as const)
            : ("LONG" as const),
      number_of_contracts: venueSize === null ? null : venueSize.abs().toString(),
      avg_entry_price: primera?.avg_entry_price ?? null,
      unrealized_pnl: primera?.unrealized_pnl ?? null,
      // Lo que contestó Coinbase, tal cual. Es lo único que permite volver a
      // mirar más tarde qué decía exactamente, y antes no se guardaba: la
      // columna era obligatoria, nadie la rellenaba y la fila entera se caía.
      raw_payload: (suyas.length === 1 ? suyas[0] : suyas) as unknown as Json,
      reconstructed_size: nuestroPorProducto.get(productId) ?? "0",
      venue_size: venueSize === null ? null : venueSize.toString(),
      matches: !descuadrados.has(productId),
    };
  });

  const { error } = await supabase.from("position_snapshots").insert(filas);
  if (!error) return;

  // Una fila mala -- un producto que Coinbase reporta y del que aquí no hay
  // ficha en `products`, por ejemplo -- no puede llevarse por delante a las
  // demás. Se intentan de una en una y se cuenta cuál falló.
  console.error("[sync] no se pudo guardar la instantánea de posición en bloque", error);
  for (const fila of filas) {
    const { error: errorFila } = await supabase.from("position_snapshots").insert(fila);
    if (errorFila) {
      console.error(`[sync] no se pudo guardar la instantánea de ${fila.product_id}`, errorFila);
    }
  }
}

/**
 * Registra los descuadres nuevos como discrepancias, con una corrida propia.
 *
 * Antes se colgaban de la corrida de **sincronización**, y la clave ajena
 * apunta a las corridas de **conciliación**: la inserción fallaba siempre y
 * nadie miraba el error. Cada tanda nueva abre su propia corrida de
 * conciliación, instantánea (la ventana empieza y acaba ahora), porque eso es
 * lo que fue: comparar la posición de este momento.
 *
 * Sólo las nuevas. Un producto que sigue sin cuadrar ya tiene su fila
 * abierta, y una por sincronización sería una por cada cinco minutos.
 */
async function recordMismatches(params: {
  userId: string;
  accountId: string;
  mismatches: PositionMismatch[];
}): Promise<void> {
  const { userId, accountId, mismatches } = params;
  const supabase = createAdminClient();

  const { data: abiertas, error: readError } = await supabase
    .from("reconciliation_discrepancies")
    .select("entity_id")
    .eq("user_id", userId)
    .eq("discrepancy_type", "POSITION_MISMATCH")
    .is("resolved_at", null);
  if (readError) {
    console.error("[sync] no se pudieron leer los descuadres abiertos", readError);
    return;
  }

  const yaRegistrados = new Set((abiertas ?? []).map((d) => d.entity_id));
  const nuevos = mismatches.filter((m) => !yaRegistrados.has(m.productId));
  if (nuevos.length === 0) return;

  const ahora = new Date().toISOString();
  const { data: run, error: runError } = await supabase
    .from("reconciliation_runs")
    .insert({
      user_id: userId,
      account_id: accountId,
      window_start: ahora,
      window_end: ahora,
      status: "SUCCESS",
      finished_at: ahora,
      resolved: false,
    })
    .select("id")
    .single();
  if (runError || !run) {
    console.error("[sync] no se pudo abrir la corrida de conciliación del descuadre", runError);
    return;
  }

  const { error } = await supabase.from("reconciliation_discrepancies").insert(
    nuevos.map((mismatch) => ({
      user_id: userId,
      reconciliation_run_id: run.id,
      discrepancy_type: "POSITION_MISMATCH" as const,
      entity_type: "product",
      entity_id: mismatch.productId,
      expected: { contratos: mismatch.venue },
      actual: { contratos: mismatch.reconstructed, diferencia: mismatch.difference },
    })),
  );
  if (error) {
    console.error("[sync] no se pudo registrar el descuadre de posición", error);
  }
}

/**
 * Cierra los descuadres que ya no lo son.
 *
 * Se resuelven las discrepancias de posición abiertas de cualquier producto
 * que **no** esté en la lista de descuadres de ahora -- incluidos los que ya
 * no tienen posición en ningún lado -- y, si no queda ninguno, también el
 * aviso. Y se marca como resuelta la corrida que los abrió, cuando ya no le
 * queda nada abierto.
 */
async function settleResolvedMismatches(params: {
  userId: string;
  accountId: string;
  mismatches: PositionMismatch[];
}): Promise<void> {
  const { userId, accountId, mismatches } = params;
  const supabase = createAdminClient();
  const ahora = new Date().toISOString();

  const { data: abiertas, error: readError } = await supabase
    .from("reconciliation_discrepancies")
    .select("id, entity_id, reconciliation_run_id")
    .eq("user_id", userId)
    .eq("discrepancy_type", "POSITION_MISMATCH")
    .is("resolved_at", null);
  if (readError) {
    console.error("[sync] no se pudieron leer los descuadres abiertos", readError);
    return;
  }

  const siguenMal = new Set(mismatches.map((m) => m.productId));
  const resueltas = (abiertas ?? []).filter((d) => !siguenMal.has(d.entity_id));

  if (resueltas.length > 0) {
    const { error } = await supabase
      .from("reconciliation_discrepancies")
      .update({
        resolved_at: ahora,
        resolution_note: "La posición volvió a cuadrar con Coinbase en una sincronización posterior.",
      })
      .in(
        "id",
        resueltas.map((d) => d.id),
      );
    if (error) {
      console.error("[sync] no se pudo cerrar el descuadre de posición resuelto", error);
    }

    // Las corridas a las que no les queda nada abierto.
    const pendientesPorCorrida = new Set(
      (abiertas ?? []).filter((d) => siguenMal.has(d.entity_id)).map((d) => d.reconciliation_run_id),
    );
    const corridasResueltas = [...new Set(resueltas.map((d) => d.reconciliation_run_id))].filter(
      (id) => !pendientesPorCorrida.has(id),
    );
    if (corridasResueltas.length > 0) {
      await supabase
        .from("reconciliation_runs")
        .update({ resolved: true, resolved_at: ahora })
        .in("id", corridasResueltas);
    }
  }

  if (mismatches.length === 0) {
    const { error } = await supabase
      .from("notifications")
      .update({ resolved_at: ahora })
      .eq("user_id", userId)
      .like("dedup_key", `position-mismatch:${accountId}:%`)
      .is("resolved_at", null);
    if (error) {
      console.error("[sync] no se pudo cerrar el aviso de posición descuadrada", error);
    }
  }
}
