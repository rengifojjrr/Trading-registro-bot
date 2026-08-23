import "server-only";

import { createClient } from "@/lib/supabase/server";

import type { CheckedTrade, PlaybookItem } from "./rules";

/**
 * El guion y lo que se marcó de él, listo para comparar contra resultados.
 *
 * Solo operaciones cerradas: un punto marcado en una operación todavía abierta
 * no tiene resultado con el que compararse, y contarla como cero arrastraría
 * todas las medianas hacia el centro sin que se vea de dónde sale.
 */
export async function fetchPlaybookAdherenceInputs(userId: string): Promise<{
  items: PlaybookItem[];
  trades: CheckedTrade[];
}> {
  const supabase = await createClient();

  const [{ data: items }, { data: checks }] = await Promise.all([
    supabase
      .from("playbook_items")
      .select("id, label")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase.from("trade_playbook_checks").select("trade_id, playbook_item_id, checked").eq("user_id", userId),
  ]);

  if (!items || items.length === 0 || !checks || checks.length === 0) {
    return { items: items ?? [], trades: [] };
  }

  const { data: trades } = await supabase
    .from("trades")
    .select("id, net_pnl")
    .eq("user_id", userId)
    .is("orphaned_at", null)
    .not("closed_at", "is", null)
    .in("id", [...new Set(checks.map((c) => c.trade_id))]);

  const porOperacion = new Map<string, CheckedTrade>();
  for (const trade of trades ?? []) {
    if (trade.net_pnl === null) continue;
    porOperacion.set(trade.id, { tradeId: trade.id, netPnl: trade.net_pnl, checks: [] });
  }

  const activos = new Set(items.map((i) => i.id));
  for (const check of checks) {
    // Un punto archivado sigue teniendo marcas viejas. Se ignoran: el guion de
    // hoy es el que se está juzgando, y mezclar puntos retirados haría que el
    // total de adherencia cambiara al archivar uno.
    if (!activos.has(check.playbook_item_id)) continue;
    const fila = porOperacion.get(check.trade_id);
    if (!fila) continue;
    fila.checks.push({ itemId: check.playbook_item_id, checked: check.checked });
  }

  return { items, trades: [...porOperacion.values()] };
}
