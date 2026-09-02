import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { resolveCoinbaseAccountId } from "./account";
import { runPollSync } from "./orchestrator";

/**
 * Sincronizar al entrar, cuando lo que hay en pantalla ya está rancio.
 *
 * Los crons no bastan. En el plan Hobby de Vercel sólo se permiten tareas
 * programadas **una vez al día**, así que un horario cada cinco minutos ni
 * siquiera despliega; y aunque el plan lo permitiera, seguir dependiendo de
 * que una máquina externa dispare para que tus propias cifras sean ciertas es
 * frágil. Esto lo resuelve por el otro lado: si abres la aplicación y lo
 * último que sabemos es viejo, se pide a Coinbase lo que falte antes de que
 * mires nada.
 *
 * Tres cosas lo hacen seguro de llamar desde cualquier pantalla:
 *
 * 1. **Sólo corre si toca.** Se compara contra el intervalo configurado, así
 *    que abrir cinco páginas seguidas lanza una sincronización, no cinco.
 * 2. **Se reserva el turno antes de empezar**, escribiendo `last_attempt_at`.
 *    Dos pestañas abiertas a la vez no disparan dos sincronizaciones.
 * 3. **Nunca lanza.** Que no se pueda refrescar es un fastidio; que la página
 *    no cargue por eso, no. El aviso de frescura ya cuenta lo que pasa.
 *
 * Con `force`, el intervalo configurado no cuenta y sólo queda el margen
 * mínimo: es lo que pide la ficha de una operación cuando ve que Coinbase
 * tiene otros contratos. Ahí no hay que esperar cinco minutos a nada.
 */

/** Margen mínimo entre intentos, pase lo que pase en la configuración. */
const MIN_MINUTES_BETWEEN_ATTEMPTS = 2;

export interface OnVisitResult {
  ran: boolean;
  reason: "fresco" | "sin-cuenta" | "sin-credenciales" | "lanzado" | "fallo";
}

export async function syncOnVisitIfStale(
  userId: string,
  options: { force?: boolean } = {},
): Promise<OnVisitResult> {
  try {
    const supabase = createAdminClient();

    const { data: settings } = await supabase
      .from("app_settings")
      .select("sync_interval_minutes")
      .eq("user_id", userId)
      .maybeSingle();

    const intervalMinutes = options.force
      ? MIN_MINUTES_BETWEEN_ATTEMPTS
      : Math.max(MIN_MINUTES_BETWEEN_ATTEMPTS, settings?.sync_interval_minutes ?? 5);

    const { data: state } = await supabase
      .from("sync_state")
      .select("id, last_attempt_at")
      .eq("user_id", userId)
      .eq("sync_type", "POLL")
      .maybeSingle();

    if (state?.last_attempt_at) {
      const minutosDesde = (Date.now() - new Date(state.last_attempt_at).getTime()) / 60000;
      if (minutosDesde < intervalMinutes) return { ran: false, reason: "fresco" };
    }

    // El turno se reserva antes de trabajar, no después: entre pedir la
    // sincronización y terminarla pasan segundos, y en ese hueco caben todas
    // las pestañas que tengas abiertas.
    if (state?.id) {
      await supabase
        .from("sync_state")
        .update({ last_attempt_at: new Date().toISOString() })
        .eq("id", state.id);
    }

    const accountId = await resolveCoinbaseAccountId(userId);
    if (!accountId) return { ran: false, reason: "sin-cuenta" };

    const summary = await runPollSync(accountId);
    return { ran: true, reason: summary.status === "FAILED" ? "fallo" : "lanzado" };
  } catch (error) {
    console.error("[sync] la sincronización al entrar no pudo completarse", error);
    return { ran: false, reason: "fallo" };
  }
}
