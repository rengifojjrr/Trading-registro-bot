import { Decimal } from "decimal.js";
import { DateTime } from "luxon";

/**
 * Qué operaciones caen en un día, y cuáles de ellas son las que lo explican.
 *
 * El calendario de P&L reparte las operaciones por su **cierre**: el día que
 * una operación deja dinero es el día que se cierra, no el que se abre. Una
 * ficha de día que buscara por apertura enseñaría otra lista y otro total que
 * la celda que se acaba de pulsar -- que es exactamente la contradicción que
 * hacía parecer que el día «no tiene nada registrado».
 *
 * Así que aquí se separan las dos cosas en vez de mezclarlas: las cerradas ese
 * día son las que suman al total, y las abiertas ese día que aún no habían
 * cerrado se enseñan aparte, sin contar. Las dos son verdad sobre el día; sólo
 * una responde a «cuánto gané».
 *
 * Todo puro: sin base de datos y sin `Date.now()`, para poder probarlo.
 */

export interface DayWindow {
  /** Instante UTC del primer momento del día local. */
  from: string;
  /** Instante UTC del último momento del día local. */
  to: string;
}

/**
 * El día natural del usuario, en instantes UTC.
 *
 * `opened_at` y `closed_at` son `timestamptz`, así que compararlos contra
 * `"2026-08-25T00:00:00"` a secas los compara contra la medianoche **del
 * servidor** (UTC). En Bogotá eso corre el día cinco horas: una operación
 * cerrada a las 20:00 del lunes cae en el martes UTC y desaparece del lunes.
 */
export function tradingDayWindow(date: string, timezone: string): DayWindow {
  const start = DateTime.fromISO(date, { zone: timezone });
  const safe = start.isValid ? start : DateTime.fromISO(date, { zone: "UTC" });

  return {
    from: safe.startOf("day").toUTC().toISO()!,
    to: safe.endOf("day").toUTC().toISO()!,
  };
}

/** Lo mínimo que hace falta para colocar una operación en un día. */
export interface DatedTrade {
  opened_at: string;
  closed_at: string | null;
}

export interface TradingDaySplit<T> {
  /** Cerradas ese día. Son las que suman al P&L del día. */
  closed: T[];
  /** Abiertas ese día pero cerradas más tarde (o todavía abiertas). No suman. */
  opened: T[];
}

/**
 * Reparte las operaciones de un día entre las que lo cierran y las que sólo
 * lo empiezan.
 *
 * Una operación abierta y cerrada el mismo día sale **sólo** en `closed`: es
 * una operación, y enseñarla dos veces en la misma pantalla haría dudar de si
 * son dos.
 */
export function splitTradingDay<T extends DatedTrade>(
  rows: T[],
  window: DayWindow,
): TradingDaySplit<T> {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);

  // Por instante y no por texto: `2026-08-25T14:00:00+00:00` y
  // `2026-08-25T14:00:00.000Z` son el mismo momento y se ordenan distinto
  // como cadenas, y Postgres devuelve el primer formato.
  const inside = (iso: string | null): boolean => {
    if (!iso) return false;
    const t = Date.parse(iso);
    return Number.isFinite(t) && t >= from && t <= to;
  };

  const closed = rows.filter((r) => inside(r.closed_at));
  const yaContada = new Set(closed);
  const opened = rows.filter((r) => !yaContada.has(r) && inside(r.opened_at));

  return {
    closed: [...closed].sort(byTime((r) => r.closed_at ?? r.opened_at)),
    opened: [...opened].sort(byTime((r) => r.opened_at)),
  };
}

function byTime<T>(pick: (row: T) => string) {
  return (a: T, b: T) => Date.parse(pick(a)) - Date.parse(pick(b));
}

/**
 * El P&L neto del día.
 *
 * Con `Decimal` y no con `+`: es la misma cifra que enseña la celda del
 * calendario, y dos caminos distintos hasta el mismo número tienen que dar el
 * mismo número hasta el último céntimo, o el calendario y la ficha del día se
 * contradicen por redondeo.
 */
export function sumNetPnl(rows: { net_pnl: string | null }[]): string {
  return rows
    .reduce((total, row) => total.plus(new Decimal(row.net_pnl ?? 0)), new Decimal(0))
    .toString();
}

/** Cuántas ganaron, cuántas perdieron y cuántas quedaron en tablas. */
export function countOutcomes(rows: { net_pnl: string | null }[]): {
  wins: number;
  losses: number;
  breakeven: number;
} {
  let wins = 0;
  let losses = 0;
  let breakeven = 0;

  for (const row of rows) {
    const pnl = new Decimal(row.net_pnl ?? 0);
    if (pnl.greaterThan(0)) wins += 1;
    else if (pnl.lessThan(0)) losses += 1;
    else breakeven += 1;
  }

  return { wins, losses, breakeven };
}
