import "server-only";

import { findGapsForUser } from "@/lib/sync/gap-reader";
import { createAdminClient } from "@/lib/supabase/admin";

import type { GateEvidence } from "./gate";

/**
 * Reúne las pruebas con las que se decide si la sincronización automática
 * puede encenderse.
 *
 * Todas se leen en el momento, ninguna se guarda como «ya validado». Es la
 * diferencia entre una puerta que se abre una vez y una que se vuelve a
 * cerrar sola: si mañana aparece un hueco de fills o la posición deja de
 * cuadrar, la siguiente lectura ya no da permiso.
 */
export async function readGateEvidence(userId: string): Promise<GateEvidence> {
  const supabase = createAdminClient();

  const [{ data: verifications }, { data: snapshots }, { count: successfulSyncs }, gaps] =
    await Promise.all([
      supabase.from("trade_verifications").select("matches").eq("user_id", userId),
      // La última comparación de posición, sea del producto que sea. Basta con
      // una que no cuadre para que no se abra: una posición mal calculada es
      // una posición mal calculada, aunque las otras estén bien.
      supabase
        .from("position_snapshots")
        .select("matches, snapshotted_at")
        .eq("user_id", userId)
        .not("matches", "is", null)
        .order("snapshotted_at", { ascending: false })
        .limit(20),
      supabase
        .from("sync_runs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "SUCCESS"),
      findGapsForUser(userId),
    ]);

  const revisiones = verifications ?? [];
  const ultimas = snapshots ?? [];

  // Sólo las de la comprobación más reciente: las de hace tres días describen
  // una posición que ya no existe.
  const masReciente = ultimas[0]?.snapshotted_at ?? null;
  const deLaUltima = masReciente
    ? ultimas.filter((s) => s.snapshotted_at === masReciente)
    : [];

  return {
    manualMatches: revisiones.filter((v) => v.matches).length,
    manualMismatches: revisiones.filter((v) => !v.matches).length,
    positionCheck:
      deLaUltima.length === 0 ? null : { matched: deLaUltima.every((s) => s.matches === true) },
    fillGaps: gaps.length,
    hasSyncedSuccessfully: (successfulSyncs ?? 0) > 0,
  };
}
