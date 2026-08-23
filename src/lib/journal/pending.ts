import { DateTime } from "luxon";

/**
 * Qué operaciones cerradas se quedaron sin apuntar.
 *
 * El diario es la mitad del valor de esta aplicación y era la mitad que se
 * olvidaba: la sincronización cierra la operación sola, en silencio, y si no
 * entras a la ficha ese día ya no vuelves. Meses después tienes el historial
 * financiero completo y ni una nota sobre por qué entraste.
 *
 * Tres decisiones para que el aviso no se convierta en ruido:
 *
 * 1. **Se deja pasar un rato antes de avisar.** Una operación que cerró hace
 *    diez minutos no está «sin apuntar»: probablemente sigas delante de la
 *    pantalla. `GRACE_HOURS` es ese margen.
 * 2. **Se olvidan las viejas.** Pasada `WINDOW_DAYS` no tiene sentido pedir que
 *    recuerdes qué pensabas: lo que escribieras sería inventado. Un aviso que
 *    pide algo imposible se aprende a ignorar, y con él se ignoran los demás.
 * 3. **Un aviso, no uno por operación.** Cerrar seis veces en una mañana no son
 *    seis avisos.
 *
 * Puro: recibe las operaciones ya leídas y no sabe de base de datos.
 */

/** Margen antes de considerar que una operación se quedó sin apuntar. */
export const GRACE_HOURS = 6;

/** Pasado esto ya no se pide: lo que escribieras no sería un recuerdo. */
export const WINDOW_DAYS = 14;

export interface ClosedTrade {
  id: string;
  closedAt: string;
  /** Si ya tiene entrada de diario con algo escrito. */
  hasJournal: boolean;
}

export interface PendingJournal {
  tradeIds: string[];
  /** La más antigua sin apuntar, para poder decir desde cuándo. */
  oldestClosedAt: string | null;
  message: string;
}

export function findPendingJournals(
  trades: ClosedTrade[],
  now: DateTime = DateTime.utc(),
): PendingJournal {
  const limiteReciente = now.minus({ hours: GRACE_HOURS });
  const limiteAntiguo = now.minus({ days: WINDOW_DAYS });

  const pendientes = trades
    .filter((t) => !t.hasJournal)
    .filter((t) => {
      const cerrada = DateTime.fromISO(t.closedAt, { zone: "utc" });
      if (!cerrada.isValid) return false;
      return cerrada < limiteReciente && cerrada > limiteAntiguo;
    })
    .sort((a, b) => a.closedAt.localeCompare(b.closedAt));

  if (pendientes.length === 0) {
    return { tradeIds: [], oldestClosedAt: null, message: "" };
  }

  const dias = Math.max(
    0,
    Math.floor(now.diff(DateTime.fromISO(pendientes[0].closedAt, { zone: "utc" }), "days").days),
  );

  return {
    tradeIds: pendientes.map((t) => t.id),
    oldestClosedAt: pendientes[0].closedAt,
    message:
      pendientes.length === 1
        ? `Una operación cerrada sin apuntar${dias >= 1 ? `, desde hace ${dias} día${dias === 1 ? "" : "s"}` : ""}. Lo que pensabas al entrar se olvida antes de lo que parece.`
        : `${pendientes.length} operaciones cerradas sin apuntar${dias >= 1 ? `, la más antigua de hace ${dias} día${dias === 1 ? "" : "s"}` : ""}. Lo que pensabas al entrar se olvida antes de lo que parece.`,
  };
}
