/**
 * Las operaciones que fueron, en realidad, un solo episodio.
 *
 * Doce entradas en veinte minutos no son doce decisiones: son una, tomada mal
 * y repetida. Pero el motor de reconstrucción las guarda como doce operaciones
 * -- y con razón, porque financieramente lo son -- así que apuntarlas obliga a
 * escribir «FOMO» doce veces, y nadie lo hace. El resultado es que el episodio
 * que más caro sale es justo el que se queda sin apuntar.
 *
 * Esto no cambia nada de lo financiero. Solo agrupa por cercanía en el tiempo
 * para poder apuntar las doce de una vez.
 *
 * Puro: recibe las operaciones ya leídas y no sabe de base de datos.
 */

/** Hueco máximo entre dos operaciones para que sigan siendo el mismo episodio. */
export const DEFAULT_GAP_MINUTES = 30;

export interface BurstTrade {
  id: string;
  openedAt: string;
  productId: string;
}

export interface Burst {
  tradeIds: string[];
  startedAt: string;
  endedAt: string;
  /** Minutos entre la primera y la última. */
  spanMinutes: number;
}

/**
 * Las operaciones agrupadas por cercanía en el tiempo.
 *
 * El corte es el hueco **entre operaciones consecutivas**, no una ventana fija
 * desde la primera: una ráfaga de dos horas seguidas sin parar es un episodio,
 * y partirla en trozos de treinta minutos inventaría fronteras donde no las
 * hubo. Lo que separa dos episodios es haber parado.
 *
 * Se agrupa por producto: dos instrumentos a la vez son dos decisiones
 * distintas aunque coincidan en el reloj.
 */
export function groupIntoBursts(
  trades: BurstTrade[],
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): Burst[] {
  const gapMs = Math.max(1, gapMinutes) * 60 * 1000;
  const porProducto = new Map<string, BurstTrade[]>();

  for (const trade of trades) {
    const t = Date.parse(trade.openedAt);
    if (Number.isNaN(t)) continue;
    const lista = porProducto.get(trade.productId);
    if (lista) lista.push(trade);
    else porProducto.set(trade.productId, [trade]);
  }

  const bursts: Burst[] = [];

  for (const lista of porProducto.values()) {
    const ordenadas = [...lista].sort((a, b) => a.openedAt.localeCompare(b.openedAt));
    let actual: BurstTrade[] = [];

    for (const trade of ordenadas) {
      const anterior = actual[actual.length - 1];
      const separadas =
        anterior !== undefined && Date.parse(trade.openedAt) - Date.parse(anterior.openedAt) > gapMs;

      if (separadas) {
        bursts.push(toBurst(actual));
        actual = [];
      }
      actual.push(trade);
    }

    if (actual.length > 0) bursts.push(toBurst(actual));
  }

  return bursts.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * La ráfaga a la que pertenece una operación concreta.
 *
 * Es lo que necesita el botón de «seleccionar toda la ráfaga»: se pulsa sobre
 * una y salen todas las de ese mismo episodio.
 */
export function burstContaining(
  tradeId: string,
  trades: BurstTrade[],
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): Burst | null {
  return groupIntoBursts(trades, gapMinutes).find((b) => b.tradeIds.includes(tradeId)) ?? null;
}

/** Solo las ráfagas de verdad: una operación suelta no es un episodio. */
export function multiTradeBursts(
  trades: BurstTrade[],
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): Burst[] {
  return groupIntoBursts(trades, gapMinutes).filter((b) => b.tradeIds.length > 1);
}

export function describeBurst(burst: Burst): string {
  const n = burst.tradeIds.length;
  const operaciones = `${n} operaci${n === 1 ? "ón" : "ones"}`;

  if (burst.spanMinutes < 1) return `${operaciones} casi a la vez`;
  if (burst.spanMinutes < 60) return `${operaciones} en ${burst.spanMinutes} minutos`;

  const horas = Math.round((burst.spanMinutes / 60) * 10) / 10;
  return `${operaciones} en ${String(horas).replace(".", ",")} horas`;
}

function toBurst(trades: BurstTrade[]): Burst {
  const startedAt = trades[0].openedAt;
  const endedAt = trades[trades.length - 1].openedAt;

  return {
    tradeIds: trades.map((t) => t.id),
    startedAt,
    endedAt,
    spanMinutes: Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 60000),
  };
}
