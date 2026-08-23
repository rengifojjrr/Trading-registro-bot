import "server-only";

import { todayIn } from "@/core/today";
import { raiseNotification } from "@/lib/notifications/create";
import { createAdminClient } from "@/lib/supabase/admin";

import { evaluateDailyLimits, type DailyLimitStatus } from "./daily-limits";

/**
 * Mira si el día de hoy ya se pasó de los topes, y avisa una vez.
 *
 * Se llama al final de cada sincronización, que es justo cuando puede haber
 * cambiado: una operación acaba de cerrarse. Antes no lo llamaba nadie --
 * `max_daily_loss` y `max_trades_per_day` se configuraban y no disparaban
 * nada.
 *
 * El aviso lleva la fecha en la clave de deduplicación a propósito: uno por
 * día y por límite. Sin eso saldría uno en cada sincronización mientras el día
 * siguiera en rojo, y un aviso que se repite cada pocos minutos se aprende a
 * ignorar en una tarde -- que es exactamente el día en que hacía falta.
 */
export async function checkDailyLimits(userId: string): Promise<DailyLimitStatus | null> {
  const supabase = createAdminClient();

  const { data: settings } = await supabase
    .from("app_settings")
    .select("timezone, max_daily_loss, max_trades_per_day")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings) return null;
  if (settings.max_daily_loss === null && settings.max_trades_per_day === null) return null;

  // El día del usuario, no el del servidor: un cierre a las 23:30 en Bogotá
  // es de hoy, aunque en UTC ya sea mañana.
  const today = todayIn(settings.timezone || "UTC");

  const { data: trades } = await supabase
    .from("trades")
    .select("net_pnl")
    .eq("user_id", userId)
    .is("orphaned_at", null)
    .not("closed_at", "is", null)
    .gte("closed_at", `${today}T00:00:00Z`)
    .lte("closed_at", `${today}T23:59:59.999Z`);

  const status = evaluateDailyLimits({
    netPnlsToday: (trades ?? []).map((t) => t.net_pnl),
    maxDailyLoss: settings.max_daily_loss,
    maxTradesPerDay: settings.max_trades_per_day,
  });

  for (const breach of status.breaches) {
    await raiseNotification({
      userId,
      type: "RISK_LIMIT",
      severity: "WARNING",
      title:
        breach === "PERDIDA_DIARIA"
          ? "Has llegado a tu tope de pérdida diaria"
          : "Has llegado a tu tope de operaciones del día",
      message: status.message ?? "",
      dedupKey: `${breach}:${userId}:${today}`,
    });
  }

  return status;
}
