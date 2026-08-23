import "server-only";

import { raiseNotification } from "@/lib/notifications/create";
import { createAdminClient } from "@/lib/supabase/admin";

import { findPendingJournals, WINDOW_DAYS, type ClosedTrade } from "./pending";

/**
 * Recuerda apuntar las operaciones que se cerraron solas.
 *
 * Se llama al final de cada sincronización, que es justo cuando aparecen: la
 * sincronización cierra la operación sin que tú hagas nada, y si no entras a la
 * ficha ese día ya no vuelves.
 *
 * El aviso lleva la lista de operaciones en la clave de deduplicación a
 * propósito: mientras sean las mismas, se actualiza el mismo aviso en vez de
 * crear uno nuevo cada sincronización; en cuanto cierras otra sin apuntar, la
 * clave cambia y sale un aviso nuevo -- que es cuando de verdad hay algo nuevo
 * que contar.
 */
export async function checkPendingJournals(userId: string): Promise<string[]> {
  const supabase = createAdminClient();

  const desde = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: trades } = await supabase
    .from("trades")
    .select("id, closed_at")
    .eq("user_id", userId)
    .is("orphaned_at", null)
    .not("closed_at", "is", null)
    .gte("closed_at", desde);

  if (!trades || trades.length === 0) return [];

  // Una fila de diario vacía no cuenta como apuntada: el formulario puede
  // haberla creado al abrirlo. Lo que cuenta es que haya algo escrito.
  const { data: journals } = await supabase
    .from("journal_entries")
    .select("trade_id, notes, lesson_learned, emotional_state, mistake_tag, strategy_id")
    .eq("user_id", userId)
    .in(
      "trade_id",
      trades.map((t) => t.id),
    );

  const conContenido = new Set(
    (journals ?? [])
      .filter(
        (j) =>
          (j.notes ?? "").trim() !== "" ||
          (j.lesson_learned ?? "").trim() !== "" ||
          j.emotional_state !== null ||
          j.mistake_tag !== null ||
          j.strategy_id !== null,
      )
      .map((j) => j.trade_id),
  );

  const candidatas: ClosedTrade[] = trades
    .filter((t) => t.closed_at !== null)
    .map((t) => ({
      id: t.id,
      closedAt: t.closed_at as string,
      hasJournal: conContenido.has(t.id),
    }));

  const pending = findPendingJournals(candidatas);
  if (pending.tradeIds.length === 0) return [];

  await raiseNotification({
    userId,
    type: "JOURNAL_PENDING",
    // Informativo, no advertencia: no hay nada roto. Subirlo de nivel haría
    // que un recordatorio opcional compitiera visualmente con un fallo de
    // sincronización, y entonces se ignoran los dos.
    severity: "INFO",
    title:
      pending.tradeIds.length === 1
        ? "Tienes una operación sin apuntar"
        : `Tienes ${pending.tradeIds.length} operaciones sin apuntar`,
    message: pending.message,
    relatedEntityType: "trade",
    relatedEntityId: pending.tradeIds[0],
    dedupKey: `JOURNAL_PENDING:${userId}:${[...pending.tradeIds].sort().join(",")}`,
  });

  return pending.tradeIds;
}
