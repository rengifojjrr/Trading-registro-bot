import "server-only";

import { CfmAdapter } from "@/lib/coinbase/venues/cfm";
import { IntxAdapter } from "@/lib/coinbase/venues/intx";
import type { MarketDataPort } from "@/lib/coinbase/ports";
import type { CoinbaseFill, CoinbaseProduct } from "@/lib/coinbase/types";
import { serverEnv } from "@/lib/env";
import { parseProductIds } from "./product-ids";
import { enqueueNotionSync } from "@/lib/notion/sync";
import { raiseNotification } from "@/lib/notifications/create";
import { publishDailyMetricsFor } from "@/core/metrics";
import { todayIn } from "@/core/today";
import { persistReconstruction } from "@/lib/reconstruction/persist";
import { describeGap, storedHighWaterMark, type FillGap } from "./gaps";
import { findGapsForProduct } from "./gap-reader";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyPositions } from "./verify-positions";
import type { Json } from "@/types/database";

const RECONSTRUCTION_ALGORITHM_VERSION = 1;
const DEFAULT_INITIAL_BACKFILL_DAYS = 90;
const CONSECUTIVE_FAILURES_BEFORE_ALERT = 3;

export interface SyncRunSummary {
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  fillsFetched: number;
  fillsNew: number;
  tradesCreated: number;
  tradesUpdated: number;
  errorSummary?: string;
}

/**
 * Runs one ~5-minute poll cycle for a single account: fetch new fills since
 * the last high-water mark (minus the configured overlap window), persist
 * them, and recompute trades. UNVERIFIED AGAINST LIVE COINBASE -- see
 * lib/coinbase/client.ts. Never called by anything until
 * docs/VALIDATION_CHECKLIST.md has passed and app_settings.auto_sync_enabled
 * is true for the account (callers are responsible for checking that gate;
 * this function itself doesn't re-check it, so it can also be invoked for
 * a one-off manual "sync now" during the validation phase itself).
 */
export async function runPollSync(accountId: string): Promise<SyncRunSummary> {
  const supabase = createAdminClient();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, user_id, venue")
    .eq("id", accountId)
    .single();

  if (accountError || !account) {
    throw new Error(`Unknown account ${accountId}: ${accountError?.message}`);
  }

  const { data: syncState } = await supabase
    .from("sync_state")
    .select("id, high_water_mark, overlap_window_seconds, consecutive_failures")
    .eq("account_id", accountId)
    .eq("sync_type", "POLL")
    .maybeSingle();

  const syncStateId = syncState?.id ?? (await ensureSyncState(accountId, account.user_id));
  const overlapSeconds = syncState?.overlap_window_seconds ?? 300;

  const { data: run, error: runError } = await supabase
    .from("sync_runs")
    .insert({ user_id: account.user_id, sync_state_id: syncStateId, status: "RUNNING" })
    .select("id")
    .single();
  if (runError || !run) {
    throw new Error(`Failed to create sync_runs row: ${runError?.message}`);
  }

  try {
    const env = serverEnv();
    const productIds = parseProductIds(env.COINBASE_PRODUCT_ID);
    if (!env.COINBASE_CDP_API_KEY_NAME || !env.COINBASE_CDP_PRIVATE_KEY || productIds.length === 0) {
      throw new Error(
        "Coinbase credentials or COINBASE_PRODUCT_ID are not configured -- see .env.example.",
      );
    }

    const adapter: MarketDataPort =
      env.COINBASE_PRODUCT_VENUE === "INTX"
        ? new IntxAdapter()
        : new CfmAdapter({
            apiKeyName: env.COINBASE_CDP_API_KEY_NAME,
            privateKeyPem: env.COINBASE_CDP_PRIVATE_KEY,
          });

    const nowIso = new Date().toISOString();
    const startIso = syncState?.high_water_mark
      ? new Date(
          new Date(syncState.high_water_mark).getTime() - overlapSeconds * 1000,
        ).toISOString()
      : new Date(Date.now() - DEFAULT_INITIAL_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Each configured product is synced and reconstructed independently --
    // position state is per (account, product), so they must never be
    // interleaved into one reconstruction pass. Counters and the high-water
    // mark are aggregated across all of them into this single run.
    let totalFills = 0;
    let totalFillsNew = 0;
    let totalTradesCreated = 0;
    let totalTradesUpdated = 0;
    let totalDiscrepancies = 0;
    let newHighWaterMark = syncState?.high_water_mark ?? "1970-01-01T00:00:00Z";

    for (const productId of productIds) {
      const productResult = await syncOneProduct({
        adapter,
        userId: account.user_id,
        accountId,
        productId,
        runId: run.id,
        startIso,
        nowIso,
      });
      totalFills += productResult.fillsFetched;
      totalFillsNew += productResult.fillsNew;
      totalTradesCreated += productResult.tradesCreated;
      totalTradesUpdated += productResult.tradesUpdated;
      totalDiscrepancies += productResult.discrepancies;
      if (productResult.highWaterMark > newHighWaterMark) {
        newHighWaterMark = productResult.highWaterMark;
      }
    }

    // Lo último, cuando las operaciones ya están reconstruidas: se le
    // pregunta a Coinbase cuántos contratos hay y se compara. Es lo que
    // detecta que falta un fill por el medio -- el fallo que deja una
    // operación cerrada figurando como abierta sin que nada lo diga.
    const positions = await verifyPositions({
      adapter,
      userId: account.user_id,
      accountId,
      runId: run.id,
    });
    totalDiscrepancies += positions.mismatches.length;

    await supabase
      .from("sync_state")
      .update({
        high_water_mark: newHighWaterMark,
        last_attempt_at: nowIso,
        last_success_at: nowIso,
        status: "SUCCESS",
        consecutive_failures: 0,
      })
      .eq("id", syncStateId);

    await supabase
      .from("sync_runs")
      .update({
        status: "SUCCESS",
        finished_at: new Date().toISOString(),
        fills_fetched: totalFills,
        fills_new: totalFillsNew,
        trades_created: totalTradesCreated,
        trades_updated: totalTradesUpdated,
        discrepancies_found: totalDiscrepancies,
      })
      .eq("id", run.id);

    return {
      status: "SUCCESS",
      fillsFetched: totalFills,
      fillsNew: totalFillsNew,
      tradesCreated: totalTradesCreated,
      tradesUpdated: totalTradesUpdated,
    };
  } catch (error) {
    // Sanitized: never include the raw error object (could theoretically
    // contain request/response details) in what gets stored -- message
    // only, and even that is meant to be human-readable, not a stack dump.
    const errorSummary = error instanceof Error ? error.message : "Unknown sync error";

    const newFailureCount = (syncState?.consecutive_failures ?? 0) + 1;
    await supabase
      .from("sync_state")
      .update({
        last_attempt_at: new Date().toISOString(),
        status: "FAILED",
        consecutive_failures: newFailureCount,
      })
      .eq("id", syncStateId);

    await supabase
      .from("sync_runs")
      .update({
        status: "FAILED",
        finished_at: new Date().toISOString(),
        error_summary: errorSummary,
      })
      .eq("id", run.id);

    if (newFailureCount >= CONSECUTIVE_FAILURES_BEFORE_ALERT) {
      await raiseNotification({
        userId: account.user_id,
        type: "SYNC_FAILURE",
        severity: "CRITICAL",
        title: "La sincronización con Coinbase sigue fallando",
        message: `${newFailureCount} intentos consecutivos han fallado. Último error: ${errorSummary}`,
        dedupKey: `SYNC_FAILURE:account:${accountId}`,
        // Also push this one out by email: a sync that stays broken is
        // exactly the failure the user would otherwise not notice until
        // they happened to open the app.
        alsoEmail: {
          subject: "Trading Registro Bot: la sincronización con Coinbase sigue fallando",
          body: `${newFailureCount} intentos consecutivos de sincronización han fallado para la cuenta ${accountId}.\n\nÚltimo error: ${errorSummary}\n\nRevisa la sección Actividad de la app para más detalle.`,
        },
      });
    }

    return { status: "FAILED", fillsFetched: 0, fillsNew: 0, tradesCreated: 0, tradesUpdated: 0, errorSummary };
  }
}

interface SyncOneProductResult {
  fillsFetched: number;
  fillsNew: number;
  tradesCreated: number;
  tradesUpdated: number;
  discrepancies: number;
  highWaterMark: string;
}

/**
 * One product's slice of a poll cycle. Extracted so runPollSync can loop
 * over every configured product without interleaving their state:
 * reconstruction is per (account, product), so each product's fills must
 * be persisted and reconstructed as its own pass.
 */
async function syncOneProduct(params: {
  adapter: MarketDataPort;
  userId: string;
  accountId: string;
  productId: string;
  runId: string;
  startIso: string;
  nowIso: string;
}): Promise<SyncOneProductResult> {
  const { adapter, userId, accountId, productId, runId, startIso, nowIso } = params;

  const product = await refreshProductSpec(adapter, productId);
  if (!product.contractSize) {
    await raiseNotification({
      userId: userId,
      type: "MISSING_CONTRACT_SPEC",
      severity: "CRITICAL",
      title: "Falta la especificación de contrato",
      message: `Coinbase no devolvió un contract_size para ${productId}. La sincronización se detuvo -- el motor de P&L no puede calcular resultados sin el multiplicador real del contrato.`,
      dedupKey: `MISSING_CONTRACT_SPEC:${productId}`,
    });
    throw new Error(`Missing contract_size for product ${productId}`);
  }

  const fills = await adapter.listFills({
    product_ids: [productId],
    product_types: ["FUTURE"],
    start_sequence_timestamp: startIso,
    end_sequence_timestamp: nowIso,
    limit: 100,
  });

  // Las órdenes primero, aunque ya no sea obligatorio: desde la migración
  // `el_fill_no_depende_de_su_orden` el fill se guarda aunque su orden no
  // esté, porque el fill es el hecho y la orden es contexto. Se siguen
  // pidiendo antes porque son ellas las que traen `filled_size` y
  // `number_of_fills`, que es con lo que se cuadra justo después.
  const orderIds = [...new Set(fills.map((f) => f.order_id))];
  await upsertRawOrders(adapter, userId, accountId, productId, runId, orderIds);
  const storedFills = await upsertRawFills(userId, accountId, runId, fills);

  // Antes de reconstruir, cuadrar. La reconstrucción da por supuesto que
  // están todos los fills; si falta uno, no falla nada de forma visible --
  // simplemente la posición nunca vuelve a cero, y como una operación muere
  // cuando la posición vuelve a cero, todas las siguientes se funden en una
  // sola operación interminable. Reconstruir sobre datos incompletos produce
  // cifras coherentes y falsas, que es lo peor que puede pasar aquí.
  const repaired = await repairFillGaps({ adapter, userId, accountId, productId, runId });

  const result = await persistReconstruction({
    userId: userId,
    accountId,
    productId,
    contractSize: product.contractSize,
    algorithmVersion: RECONSTRUCTION_ALGORITHM_VERSION,
  });

  await Promise.all(
    result.touchedTradeIds.map((tradeId) => enqueueNotionSync(userId, tradeId)),
  );

  await publishTradingMetrics(userId);

  if (result.unclassifiedFillIds.length > 0) {
    await raiseNotification({
      userId: userId,
      type: "UNCLASSIFIED_FILL",
      severity: "WARNING",
      title: "Fills sin clasificar",
      message: `${result.unclassifiedFillIds.length} fill(s) no se procesaron automáticamente (tipo de ajuste o combo no confirmado -- ver docs/COINBASE_INTEGRATION.md). No afectan las operaciones ya calculadas, pero no están incluidos.`,
      relatedEntityType: "product",
      relatedEntityId: productId,
      dedupKey: `UNCLASSIFIED_FILL:account:${accountId}:product:${productId}`,
    });
  }

  if (result.orphanedOpeningFillIds.length > 0) {
    await raiseNotification({
      userId: userId,
      type: "DISCREPANCY",
      severity: "WARNING",
      title: "Límites de operación cambiaron",
      message: `${result.orphanedOpeningFillIds.length} operación(es) ya no corresponden a un límite de posición bajo el recálculo más reciente. Revísalas manualmente -- no se eliminaron automáticamente.`,
      dedupKey: `TRADE_BOUNDARY_CHANGED:account:${accountId}:product:${productId}`,
    });
  }

  return {
    fillsFetched: fills.length,
    fillsNew: storedFills.inserted + repaired.recovered,
    tradesCreated: result.tradesCreated,
    tradesUpdated: result.tradesUpdated,
    discrepancies: result.orphanedOpeningFillIds.length + repaired.remaining.length,
    // La marca de agua avanza sobre lo que quedó **guardado**, no sobre lo
    // que se trajo. Es la diferencia entre un fallo que se reintenta y un
    // agujero permanente: si la marca pasa por encima de un fill que no llegó
    // a guardarse, ninguna sincronización posterior vuelve a mirar ahí jamás
    // -- sólo se pide lo más nuevo que la marca, menos la ventana de solape.
    highWaterMark: storedHighWaterMark(fills, storedFills.stored),
  };
}

async function ensureSyncState(accountId: string, userId: string): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sync_state")
    .insert({ user_id: userId, account_id: accountId, sync_type: "POLL" })
    .select("id")
    .single();
  if (error || !data) throw new Error(`Failed to create sync_state: ${error?.message}`);
  return data.id;
}

async function refreshProductSpec(
  adapter: MarketDataPort,
  productId: string,
): Promise<{ contractSize: string | null }> {
  const supabase = createAdminClient();
  const product: CoinbaseProduct = await adapter.getProduct(productId);
  const details = product.future_product_details;

  await supabase.from("products").upsert(
    {
      product_id: product.product_id,
      venue: product.product_venue ?? "FCM",
      product_type: product.product_type,
      base_currency_id: product.base_currency_id,
      quote_currency_id: product.quote_currency_id,
      contract_size: details?.contract_size,
      contract_root_unit: details?.contract_root_unit,
      contract_expiry_type: details?.contract_expiry_type,
      contract_expiry: details?.contract_expiry,
      contract_expiry_timezone: details?.contract_expiry_timezone,
      risk_managed_by: details?.risk_managed_by,
      display_name: product.display_name,
      raw_metadata: product as unknown as Json,
      fetched_at: new Date().toISOString(),
      is_stale: false,
    },
    { onConflict: "product_id" },
  );

  return { contractSize: details?.contract_size ?? null };
}

interface StoredFillsResult {
  /** Cuántos no estaban y ahora sí. */
  inserted: number;
  /** Los `entry_id` que están en la base de datos, ya estuvieran o no. */
  stored: Set<string>;
}

/**
 * Guarda los fills nuevos y **confirma leyendo** cuáles quedaron dentro.
 *
 * Devolver «he insertado N» no vale para mover la marca de agua: lo que
 * importa no es cuántos se intentaron sino cuáles están, y esas dos cosas se
 * separan en cuanto una fila se cae. Se relee después de insertar porque la
 * base de datos es la única que sabe la respuesta.
 */
async function upsertRawFills(
  userId: string,
  accountId: string,
  syncRunId: string,
  fills: CoinbaseFill[],
): Promise<StoredFillsResult> {
  if (fills.length === 0) return { inserted: 0, stored: new Set() };
  const supabase = createAdminClient();

  const entryIds = fills.map((f) => f.entry_id);
  const { data: existing } = await supabase
    .from("raw_fills")
    .select("entry_id")
    .in("entry_id", entryIds);
  const existingIds = new Set((existing ?? []).map((r) => r.entry_id));
  const newFills = fills.filter((f) => !existingIds.has(f.entry_id));
  if (newFills.length === 0) return { inserted: 0, stored: existingIds };

  const { error: insertError } = await supabase.from("raw_fills").insert(
    newFills.map((f) => ({
      entry_id: f.entry_id,
      user_id: userId,
      account_id: accountId,
      order_id: f.order_id,
      product_id: f.product_id,
      coinbase_trade_id: f.trade_id,
      trade_time: f.trade_time,
      sequence_timestamp: f.sequence_timestamp,
      trade_type: f.trade_type,
      side: f.side,
      price: f.price,
      size: f.size,
      commission: f.commission,
      commission_detail: f.commission_detail_total as unknown as Json,
      liquidity_indicator: f.liquidity_indicator,
      size_in_quote: f.size_in_quote ?? false,
      retail_portfolio_id: f.retail_portfolio_id,
      future_legs: (f.future_legs ?? []) as unknown as Json,
      raw_payload: f as unknown as Json,
      sync_run_id: syncRunId,
    })),
  );
  if (insertError) {
    throw new Error(`Failed to insert raw_fills: ${insertError.message}`);
  }

  // Se relee en vez de dar por hecho que entraron todos: si alguna fila se
  // hubiera caído, la marca de agua no debe pasar por encima de ella.
  const { data: confirmed } = await supabase
    .from("raw_fills")
    .select("entry_id")
    .in("entry_id", entryIds);

  return {
    inserted: newFills.length,
    stored: new Set((confirmed ?? []).map((r) => r.entry_id)),
  };
}


/**
 * Busca fills que Coinbase ejecutó y nosotros no tenemos, y los pide otra vez.
 *
 * La comprobación no es una estimación: cada orden trae de Coinbase cuánto se
 * ejecutó y en cuántos trozos, así que el hueco se calcula restando. Y como el
 * hueco viene con el `order_id` puesto, repararlo es volver a pedir los fills
 * **de esa orden** -- no un rebarrido del histórico entero.
 *
 * Esto existe porque el remedio anterior era un botón escondido en
 * Configuración que había que saber que estaba ahí. La aplicación tenía la
 * información para darse cuenta sola desde el primer día y no la miraba: una
 * compra de 1 contrato del 11 de agosto de 2026 se perdió, y durante ocho días
 * el panel enseñó una operación fantasma de 151 contratos sin que nada
 * chistara.
 */
async function repairFillGaps(params: {
  adapter: MarketDataPort;
  userId: string;
  accountId: string;
  productId: string;
  runId: string;
}): Promise<{ recovered: number; remaining: FillGap[] }> {
  const { adapter, userId, accountId, productId, runId } = params;

  const gaps = await findGapsForProduct(userId, accountId, productId);
  if (gaps.length === 0) return { recovered: 0, remaining: [] };

  let recovered = 0;
  try {
    const fills = await adapter.listFills({
      order_ids: gaps.map((g) => g.orderId),
      limit: 100,
    });
    if (fills.length > 0) {
      const stored = await upsertRawFills(userId, accountId, runId, fills);
      recovered = stored.inserted;
    }
  } catch (error) {
    console.error("[sync] no se pudieron recuperar los fills que faltaban", error);
  }

  // Se vuelve a cuadrar contra la base de datos en vez de suponer que lo
  // recuperado tapa el hueco: puede que Coinbase no devuelva el fill, y en ese
  // caso hay que decirlo, no dar el problema por resuelto.
  const remaining = await findGapsForProduct(userId, accountId, productId);

  if (remaining.length > 0) {
    await raiseNotification({
      userId,
      type: "DISCREPANCY",
      severity: "CRITICAL",
      title: "Faltan ejecuciones por registrar",
      message:
        `Coinbase dice que estas órdenes se ejecutaron por más de lo que tenemos guardado, y volver a pedirlas no lo ha resuelto. ` +
        `Mientras falte un fill, la posición reconstruida no cuadra y las operaciones pueden aparecer unidas o abiertas cuando no lo están.\n\n` +
        remaining.map((gap) => describeGap(gap)).join("\n"),
      relatedEntityType: "product",
      relatedEntityId: productId,
      dedupKey: `FILL_GAP:account:${accountId}:product:${productId}`,
    });
  } else if (recovered > 0) {
    await raiseNotification({
      userId,
      type: "DISCREPANCY",
      severity: "INFO",
      title: "Se recuperaron ejecuciones que faltaban",
      message: `Faltaban ${recovered} ejecución(es) por registrar y se han recuperado de Coinbase. Las operaciones afectadas se han vuelto a calcular.`,
      relatedEntityType: "product",
      relatedEntityId: productId,
      dedupKey: `FILL_GAP_FIXED:account:${accountId}:product:${productId}:${recovered}`,
    });
  }

  return { recovered, remaining };
}

async function upsertRawOrders(
  adapter: MarketDataPort,
  userId: string,
  accountId: string,
  productId: string,
  syncRunId: string,
  orderIds: string[],
): Promise<void> {
  if (orderIds.length === 0) return;
  const supabase = createAdminClient();

  try {
    const orders = await adapter.listOrders(orderIds);
    await supabase.from("raw_orders").upsert(
      orders.map((o) => ({
        order_id: o.order_id,
        user_id: userId,
        account_id: accountId,
        product_id: o.product_id ?? productId,
        order_side: o.side,
        status: o.status,
        raw_payload: o as unknown as Json,
        sync_run_id: syncRunId,
        fetched_at: new Date().toISOString(),
      })),
      { onConflict: "order_id" },
    );
  } catch {
    // Order detail is supplementary context, not required for
    // reconstruction (which only reads fills) -- a failure here must never
    // fail the whole sync run.
  }
}

/**
 * Publica el resumen de hoy de trading en el contrato del núcleo.
 *
 * Es el único punto por el que la tarjeta de trading de la pantalla de Hoy
 * se entera de algo: esa pantalla no importa nada de trading, sólo lee
 * core_daily_metrics. Se recalcula desde la base tras cada sincronización,
 * así que corregir una operación corrige también la tarjeta.
 *
 * Va con el cliente de servicio porque la sincronización corre desde un cron
 * y ahí no hay sesión de la que deducir el usuario.
 */
async function publishTradingMetrics(userId: string): Promise<void> {
  try {
    const supabase = createAdminClient();

    const { data: settings } = await supabase
      .from("app_settings")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle();
    const today = todayIn(settings?.timezone || "UTC");

    const { data: trades } = await supabase
      .from("trades")
      .select("net_pnl, closed_at")
      .eq("user_id", userId)
      .not("closed_at", "is", null)
      .gte("closed_at", `${today}T00:00:00Z`)
      .lte("closed_at", `${today}T23:59:59Z`)
      .is("orphaned_at", null);

    const rows = trades ?? [];
    const net = rows.reduce((sum, t) => sum + Number(t.net_pnl ?? 0), 0);

    await publishDailyMetricsFor(userId, today, [
      { module: "trading", key: "operaciones", value: rows.length },
      { module: "trading", key: "resultado_neto", value: Math.round(net * 100) / 100, unit: "USD" },
    ]);
  } catch (error) {
    console.error("[sync] no se pudieron publicar las métricas de trading", error);
  }
}
