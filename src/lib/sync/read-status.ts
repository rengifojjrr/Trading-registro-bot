import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { evaluateSyncHealth, type SyncHealth } from "@/lib/sync/freshness";

import { findGapsForUser } from "./gap-reader";

/**
 * Todo lo que hace falta para responder «¿me puedo creer esta pantalla?».
 *
 * Antes había que mirar en tres sitios distintos y ninguno estaba donde se
 * miran las cifras: la frescura salía en un aviso, el descuadre con Coinbase
 * sólo en la ficha de una operación abierta, y los fills que faltaban no
 * salían en ninguna parte. Se podía tener las tres cosas mal a la vez y ver
 * un panel perfectamente tranquilo, que es exactamente lo que pasó.
 *
 * Aquí se juntan, porque las tres contestan a la misma pregunta y ninguna la
 * contesta sola: datos frescos que no cuadran son tan poco fiables como datos
 * que cuadran y son de la semana pasada.
 */

export interface SyncStatus {
  health: SyncHealth;
  /** Órdenes con ejecuciones sin registrar. Cualquiera descuadra la posición. */
  fillGaps: number;
  /**
   * Cómo fue la última comparación de posición contra Coinbase.
   * `null` cuando nunca se ha podido preguntar -- que no es lo mismo que
   * cuadrar, y por eso se distingue.
   */
  positionMatches: boolean | null;
  positionCheckedAt: string | null;
  autoSyncEnabled: boolean;
  /** Lo peor de las tres, para decidir de qué color va el aviso. */
  severity: "ok" | "watch" | "alarm";
}

export async function readSyncStatus(userId: string): Promise<SyncStatus> {
  const supabase = createAdminClient();

  const [{ data: state }, { data: settings }, { data: snapshots }, gaps] = await Promise.all([
    supabase
      .from("sync_state")
      .select("last_success_at")
      .eq("user_id", userId)
      .eq("sync_type", "POLL")
      .maybeSingle(),
    supabase
      .from("app_settings")
      .select("sync_interval_minutes, auto_sync_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("position_snapshots")
      .select("matches, snapshotted_at")
      .eq("user_id", userId)
      .not("matches", "is", null)
      .order("snapshotted_at", { ascending: false })
      .limit(20),
    findGapsForUser(userId),
  ]);

  const autoSyncEnabled = settings?.auto_sync_enabled ?? false;

  const health = evaluateSyncHealth({
    lastSuccessAt: state?.last_success_at ?? null,
    intervalMinutes: settings?.sync_interval_minutes ?? 5,
    autoSyncEnabled,
  });

  // Sólo las de la comprobación más reciente: las de hace tres días describen
  // una posición que ya no existe.
  const ultimas = snapshots ?? [];
  const masReciente = ultimas[0]?.snapshotted_at ?? null;
  const deLaUltima = masReciente ? ultimas.filter((s) => s.snapshotted_at === masReciente) : [];

  const positionMatches =
    deLaUltima.length === 0 ? null : deLaUltima.every((s) => s.matches === true);

  // Un hueco de fills o una posición que no cuadra son fallos de exactitud:
  // las cifras están mal *ahora*. Que la sincronización vaya con retraso es
  // un fallo de actualidad: están bien pero son viejas. Lo primero pesa más.
  const severity: SyncStatus["severity"] =
    gaps.length > 0 || positionMatches === false || health.freshness === "STALE"
      ? "alarm"
      : health.freshness === "LATE" || health.freshness === "NEVER" || positionMatches === null
        ? "watch"
        : "ok";

  return {
    health,
    fillGaps: gaps.length,
    positionMatches,
    positionCheckedAt: masReciente,
    autoSyncEnabled,
    severity,
  };
}
