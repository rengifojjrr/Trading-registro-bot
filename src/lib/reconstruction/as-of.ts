import "server-only";

import { Decimal } from "decimal.js";
import { DateTime } from "luxon";

import { calculatePnl } from "@/lib/pnl/calculate";
import { createClient } from "@/lib/supabase/server";

import { reconstructTrades } from "./engine";
import type { GroupingOverrideInput, ReconstructionFillInput } from "./types";

/**
 * Cómo estaba la cuenta a una fecha, según lo que se sabía entonces.
 *
 * Esta es la razón de que la capa cruda sea inmutable y el motor sea una
 * función pura. Coinbase emite correcciones retroactivas -- `REVERSAL`,
 * `CORRECTION` -- y cualquier ajuste manual cambia el pasado en la vista de
 * hoy. Sin esto no hay forma de contestar «¿de verdad iba ganando a final de
 * julio, o lo que pasó es que en agosto llegó una corrección?», que es la
 * única pregunta que distingue un registro de un rumor.
 *
 * **No escribe nada.** Corre el mismo motor sobre un subconjunto de fills y
 * devuelve el resultado en memoria. Guardarlo sería reescribir la
 * reconstrucción actual con una vista parcial, que es exactamente el fallo que
 * esto existe para detectar.
 */
export interface AsOfTrade {
  productId: string;
  direction: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  openedAt: string;
  closedAt: string | null;
  size: string;
  entryWap: string;
  exitWap: string | null;
  netPnl: string | null;
}

export interface AsOfResult {
  /** La fecha pedida, en la zona del usuario. */
  asOf: string;
  trades: AsOfTrade[];
  closedCount: number;
  openCount: number;
  /** Suma de lo cerrado hasta esa fecha. */
  realisedNetPnl: string;
  fillsConsidered: number;
  /** Fills que existen hoy y llegaron después: lo que aún no se sabía. */
  fillsIgnored: number;
  /** Ajustes que Coinbase mandó después de la fecha y afectan a lo anterior. */
  laterCorrections: number;
  note: string;
}

export async function reconstructAsOf(params: {
  userId: string;
  accountId: string;
  /** `YYYY-MM-DD`, inclusive: cuenta todo lo ocurrido durante ese día. */
  date: string;
  timezone: string;
}): Promise<AsOfResult | { error: string }> {
  const supabase = await createClient();

  const fin = DateTime.fromISO(params.date, { zone: params.timezone }).endOf("day");
  if (!fin.isValid) return { error: "Esa fecha no se pudo leer." };
  if (fin > DateTime.now().setZone(params.timezone)) {
    return { error: "Esa fecha todavía no ha pasado." };
  }
  const corte = fin.toUTC().toISO();
  if (corte === null) return { error: "Esa fecha no se pudo convertir a UTC." };

  const [{ data: rawFills }, { data: overrideRows }, { data: products }] = await Promise.all([
    supabase
      .from("raw_fills")
      .select(
        "entry_id, product_id, side, price, size, commission, sequence_timestamp, trade_time, trade_type, future_legs",
      )
      .eq("account_id", params.accountId)
      .order("sequence_timestamp"),
    supabase
      .from("trade_grouping_overrides")
      .select("id, override_type, anchor_fill_id, payload, is_active, created_at")
      .eq("account_id", params.accountId)
      .eq("is_active", true),
    supabase.from("products").select("product_id, contract_size"),
  ]);

  const todos = rawFills ?? [];
  const hasta = todos.filter((f) => f.sequence_timestamp <= corte);
  const despues = todos.filter((f) => f.sequence_timestamp > corte);

  if (hasta.length === 0) {
    return { error: "No hay ninguna ejecución guardada hasta esa fecha." };
  }

  const engineFills: ReconstructionFillInput[] = hasta.map((f) => ({
    entryId: f.entry_id,
    productId: f.product_id,
    side: f.side,
    price: f.price,
    size: f.size,
    commission: f.commission,
    sequenceTimestamp: f.sequence_timestamp,
    tradeTime: f.trade_time,
    tradeType: f.trade_type,
    hasFutureLegs: Array.isArray(f.future_legs) ? f.future_legs.length > 0 : false,
  }));

  // Los ajustes manuales también viajan en el tiempo: uno creado en agosto no
  // existía en julio, y aplicarlo aquí enseñaría una versión del pasado que
  // nunca se vio. Es el mismo criterio que con los fills.
  const engineOverrides: GroupingOverrideInput[] = (overrideRows ?? [])
    .filter((o) => o.created_at <= corte)
    .map((o) => ({
      id: o.id,
      overrideType: o.override_type,
      anchorFillId: o.anchor_fill_id,
      payload: o.payload,
      isActive: o.is_active,
    }));

  const { trades } = reconstructTrades(engineFills, engineOverrides);

  const contractSizes = new Map(
    (products ?? []).map((p) => [p.product_id, p.contract_size] as const),
  );

  const salida: AsOfTrade[] = [];
  let realised = new Decimal(0);

  for (const trade of trades) {
    const contractSize = contractSizes.get(trade.productId);
    let netPnl: string | null = null;

    // Sin multiplicador no se inventa una cifra: se deja en blanco. Un P&L
    // calculado con el multiplicador equivocado es peor que ninguno, porque
    // parece bueno.
    if (trade.status === "CLOSED" && contractSize != null) {
      const pnl = calculatePnl({
        direction: trade.direction,
        entryWap: trade.entryWap,
        exitWap: trade.exitWap,
        totalEntryQty: trade.totalEntryQty,
        totalExitQty: trade.totalExitQty,
        entryCommissions: trade.entryCommissions,
        exitCommissions: trade.exitCommissions,
        contractSize: String(contractSize),
      });
      netPnl = pnl.netPnl;
      if (pnl.netPnl !== null) realised = realised.plus(pnl.netPnl);
    }

    salida.push({
      productId: trade.productId,
      direction: trade.direction,
      status: trade.status,
      openedAt: trade.openedAt,
      closedAt: trade.closedAt,
      size: trade.maxSize,
      entryWap: trade.entryWap,
      exitWap: trade.exitWap,
      netPnl,
    });
  }

  // Un ajuste posterior con `trade_time` anterior al corte es Coinbase
  // corrigiendo el pasado: es la causa concreta de que la vista de hoy no
  // cuadre con lo que se vio entonces, y merece nombrarse.
  const laterCorrections = despues.filter(
    (f) => f.trade_type !== "FILL" && f.trade_time <= corte,
  ).length;

  const closedCount = salida.filter((t) => t.status === "CLOSED").length;

  return {
    asOf: params.date,
    trades: salida.sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
    closedCount,
    openCount: salida.length - closedCount,
    realisedNetPnl: realised.toFixed(2),
    fillsConsidered: hasta.length,
    fillsIgnored: despues.length,
    laterCorrections,
    note:
      laterCorrections > 0
        ? `Después de esta fecha llegaron ${laterCorrections} ajuste${laterCorrections === 1 ? "" : "s"} de Coinbase que afectan a operaciones anteriores. Eso es exactamente por qué estas cifras no coinciden con las de hoy.`
        : despues.length > 0
          ? `Se han ignorado ${despues.length} ejecuciones posteriores a esa fecha. Ninguna corrige nada anterior, así que las diferencias con hoy son solo operaciones nuevas.`
          : "No hay nada posterior a esta fecha: estas cifras son las mismas que las de hoy.",
  };
}
