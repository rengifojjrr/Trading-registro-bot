import "server-only";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";

import { groupIntoBursts, type Burst } from "./bursts";
import { WINDOW_DAYS } from "./pending";

/**
 * Lo que está esperando a que lo apuntes.
 *
 * Ya existía el aviso que detecta operaciones cerradas sin diario, y no
 * existía ninguna pantalla que las enseñara: el aviso decía «tienes seis sin
 * apuntar» y para encontrarlas había que ir mirando la tabla una por una. Un
 * aviso que no lleva a ninguna parte se aprende a ignorar en una semana.
 *
 * Salen **ya agrupadas en ráfagas**, que es la forma en que de verdad se
 * apuntan: doce entradas en veinte minutos son un episodio y se despachan de
 * una vez, no doce veces.
 */
export interface InboxTrade {
  id: string;
  productId: string;
  direction: "LONG" | "SHORT";
  openedAt: string;
  closedAt: string | null;
  netPnl: string | null;
  size: string;
}

export interface InboxGroup {
  /** Las de un mismo episodio, o una sola cuando fue suelta. */
  trades: InboxTrade[];
  burst: Burst | null;
  netPnl: string;
}

export interface JournalInbox {
  groups: InboxGroup[];
  total: number;
  /** Días distintos con algo pendiente, para poder decir «tres días sin apuntar». */
  days: number;
}

export async function fetchJournalInbox(): Promise<JournalInbox> {
  const user = await requireUser();
  const supabase = await createClient();

  const desde = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: trades } = await supabase
    .from("trades")
    .select("id, product_id, direction, opened_at, closed_at, net_pnl, max_size")
    .eq("user_id", user.id)
    .is("orphaned_at", null)
    .not("closed_at", "is", null)
    .gte("closed_at", desde)
    .order("opened_at", { ascending: false })
    .limit(300);

  if (!trades || trades.length === 0) return { groups: [], total: 0, days: 0 };

  // Una fila de diario vacía no cuenta: el formulario puede haberla creado al
  // abrirlo. Lo que cuenta es que haya algo escrito, igual que en el aviso.
  const [{ data: journals }, { data: mistakes }] = await Promise.all([
    supabase
      .from("journal_entries")
      .select("trade_id, notes, lesson_learned, emotional_state, mistake_tag, strategy_id")
      .eq("user_id", user.id)
      .in(
        "trade_id",
        trades.map((t) => t.id),
      ),
    supabase
      .from("trade_mistakes")
      .select("trade_id")
      .eq("user_id", user.id)
      .in(
        "trade_id",
        trades.map((t) => t.id),
      ),
  ]);

  const apuntadas = new Set<string>();
  for (const j of journals ?? []) {
    const tieneAlgo =
      (j.notes ?? "").trim() !== "" ||
      (j.lesson_learned ?? "").trim() !== "" ||
      j.emotional_state !== null ||
      j.mistake_tag !== null ||
      j.strategy_id !== null;
    if (tieneAlgo) apuntadas.add(j.trade_id);
  }
  for (const m of mistakes ?? []) apuntadas.add(m.trade_id);

  const pendientes: InboxTrade[] = trades
    .filter((t) => !apuntadas.has(t.id))
    .map((t) => ({
      id: t.id,
      productId: t.product_id,
      direction: t.direction,
      openedAt: t.opened_at,
      closedAt: t.closed_at,
      netPnl: t.net_pnl,
      size: t.max_size,
    }));

  if (pendientes.length === 0) return { groups: [], total: 0, days: 0 };

  const bursts = groupIntoBursts(
    pendientes.map((t) => ({ id: t.id, openedAt: t.openedAt, productId: t.productId })),
  );

  const porId = new Map(pendientes.map((t) => [t.id, t]));
  const groups: InboxGroup[] = bursts.map((burst) => {
    const trades = burst.tradeIds
      .map((id) => porId.get(id))
      .filter((t): t is InboxTrade => t !== undefined);

    return {
      trades,
      burst: trades.length > 1 ? burst : null,
      netPnl: trades
        .reduce((sum, t) => sum + Number(t.netPnl ?? 0), 0)
        .toFixed(2),
    };
  });

  return {
    groups: groups.filter((g) => g.trades.length > 0),
    total: pendientes.length,
    days: new Set(pendientes.map((t) => t.closedAt?.slice(0, 10) ?? "")).size,
  };
}
