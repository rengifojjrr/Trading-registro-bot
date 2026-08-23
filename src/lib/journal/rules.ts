import { Decimal } from "decimal.js";

/**
 * Si seguir tu propio guion cambia algo.
 *
 * El guion ya existía: `playbook_items` guarda los puntos de cada estrategia y
 * `trade_playbook_checks` lo que marcaste en cada operación. Lo que no existía
 * es la pregunta que le da sentido a marcarlos -- «¿me va mejor cuando los
 * cumplo?». Sin ella, la lista es una ceremonia: se marca por marcar, y da
 * igual lo que salga.
 *
 * Puede que la respuesta sea que un punto no cambia nada. Eso también es
 * información: un guion de doce puntos que no se cumple nunca es peor que uno
 * de tres que sí, porque el de doce enseña a marcar sin leer.
 *
 * Las mismas tres cautelas que en el cruce con el sueño, por el mismo motivo:
 * medianas en vez de medias, un mínimo de operaciones antes de decir nada, y
 * un texto que habla de coincidencia y no de causa.
 *
 * Puro: recibe lo ya leído y no sabe de base de datos.
 */

/** Menos de esto a un lado y la comparación es una anécdota. */
export const MIN_TRADES_PER_SIDE = 5;

export interface CheckedTrade {
  tradeId: string;
  netPnl: string;
  /** Los puntos del guion marcados en esta operación, por id. */
  checks: { itemId: string; checked: boolean }[];
}

export interface PlaybookItem {
  id: string;
  label: string;
}

export interface ItemAdherence {
  itemId: string;
  label: string;
  /** Operaciones en las que este punto se miró, de una forma u otra. */
  reviewed: number;
  met: number;
  /** Porcentaje de veces que se cumplió, 0-100. Null si nunca se miró. */
  adherencePct: number | null;
  /** Null cuando no hay operaciones suficientes a los dos lados. */
  medianWhenMet: string | null;
  medianWhenMissed: string | null;
  /** Cumplido menos incumplido. Positivo = coincide con operaciones mejores. */
  difference: string | null;
}

export interface PlaybookAdherence {
  items: ItemAdherence[];
  /** Marcas cumplidas sobre marcas totales, en todas las operaciones. */
  overallPct: number | null;
  reviewedTrades: number;
  verdict: string;
}

export function computePlaybookAdherence(
  trades: CheckedTrade[],
  items: PlaybookItem[],
): PlaybookAdherence {
  const conGuion = trades.filter((t) => t.checks.length > 0);

  const filas = items.map((item) => adherenceFor(item, conGuion));

  let marcas = 0;
  let cumplidas = 0;
  for (const trade of conGuion) {
    for (const check of trade.checks) {
      marcas += 1;
      if (check.checked) cumplidas += 1;
    }
  }

  return {
    items: filas,
    overallPct: marcas === 0 ? null : (cumplidas / marcas) * 100,
    reviewedTrades: conGuion.length,
    verdict: describe(filas, conGuion.length),
  };
}

function adherenceFor(item: PlaybookItem, trades: CheckedTrade[]): ItemAdherence {
  const miradas = trades.filter((t) => t.checks.some((c) => c.itemId === item.id));
  const cumplidas = miradas.filter(
    (t) => t.checks.find((c) => c.itemId === item.id)?.checked === true,
  );
  const rotas = miradas.filter(
    (t) => t.checks.find((c) => c.itemId === item.id)?.checked === false,
  );

  // Sin muestra a los dos lados no se enseña resultado. Con dos operaciones
  // incumplidas siempre sale una diferencia, y enseñarla invitaría a tirar un
  // punto bueno del guion por dos casualidades.
  const hayMuestra = cumplidas.length >= MIN_TRADES_PER_SIDE && rotas.length >= MIN_TRADES_PER_SIDE;

  const medianaCumplida = hayMuestra
    ? median(cumplidas.map((t) => new Decimal(t.netPnl))).toFixed(2)
    : null;
  const medianaRota = hayMuestra ? median(rotas.map((t) => new Decimal(t.netPnl))).toFixed(2) : null;

  return {
    itemId: item.id,
    label: item.label,
    reviewed: miradas.length,
    met: cumplidas.length,
    adherencePct: miradas.length === 0 ? null : (cumplidas.length / miradas.length) * 100,
    medianWhenMet: medianaCumplida,
    medianWhenMissed: medianaRota,
    difference:
      medianaCumplida !== null && medianaRota !== null
        ? new Decimal(medianaCumplida).minus(medianaRota).toFixed(2)
        : null,
  };
}

function describe(items: ItemAdherence[], reviewedTrades: number): string {
  if (reviewedTrades === 0) {
    return "Todavía no has marcado el guion en ninguna operación. Se marca desde la ficha de cada una, y hasta entonces aquí no hay nada que comparar.";
  }

  const comparables = items.filter((i) => i.difference !== null);
  if (comparables.length === 0) {
    return `Has marcado el guion en ${reviewedTrades} operación${reviewedTrades === 1 ? "" : "es"}, pero todavía no hay ${MIN_TRADES_PER_SIDE} de cada lado en ningún punto. Hasta entonces cualquier diferencia sería ruido.`;
  }

  const ordenados = [...comparables].sort(
    (a, b) => Number(b.difference) - Number(a.difference),
  );
  const mejor = ordenados[0];
  const peor = ordenados[ordenados.length - 1];

  // «Coincide», nunca «por eso». Puede que cumplas el guion justo los días
  // tranquilos, y que sea la calma la que gana el dinero y no el guion.
  if (new Decimal(mejor.difference ?? 0).lessThanOrEqualTo(0)) {
    return `Ningún punto del guion coincide con operaciones mejores. Puede que el guion no esté midiendo lo que importa, o que se marque sin leerlo. Es una coincidencia observada, no una causa demostrada.`;
  }

  const cola =
    peor.itemId !== mejor.itemId && new Decimal(peor.difference ?? 0).lessThan(0)
      ? ` En cambio «${peor.label}» coincide con operaciones peores cuando se cumple, que es señal de que ese punto sobra o está mal escrito.`
      : "";

  return `Cumplir «${mejor.label}» coincide con una operación mediana ${new Decimal(mejor.difference ?? 0).toFixed(2)} mejor.${cola} Es una coincidencia observada, no una causa demostrada.`;
}

function median(values: Decimal[]): Decimal {
  if (values.length === 0) return new Decimal(0);
  const ordenados = [...values].sort((a, b) => a.comparedTo(b));
  const medio = Math.floor(ordenados.length / 2);
  return ordenados.length % 2 === 0
    ? ordenados[medio - 1].plus(ordenados[medio]).dividedBy(2)
    : ordenados[medio];
}
