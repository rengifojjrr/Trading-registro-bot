import { Decimal } from "decimal.js";

/**
 * Qué ejecuciones hay en un momento del gráfico, y qué resumen sale de ellas.
 *
 * El gráfico escribía el tamaño y el precio encima de cada flecha. Con dos
 * ejecuciones se lee; con veinticinco es una pared de texto morado y naranja
 * que tapa las velas, se solapa consigo misma y no deja ver ni el precio ni la
 * flecha -- justo lo que se iba a mirar.
 *
 * TradingView resuelve esto de la única forma que funciona: la flecha sola, y
 * el detalle cuando lo pides. Esto es la parte que decide qué detalle sale.
 *
 * Puro: recibe las ejecuciones y un instante, y no sabe nada de canvas.
 */

export interface ChartFill {
  time: number; // unix en segundos
  price: number;
  size: number;
  role: "ENTRY" | "EXIT";
}

export interface FillGroup {
  time: number;
  fills: ChartFill[];
  entryQty: string;
  exitQty: string;
  /** Precio medio ponderado de lo que pasó en ese instante. */
  wap: string;
  /** Null cuando en ese instante hubo entradas y salidas a la vez (una vuelta). */
  role: "ENTRY" | "EXIT" | null;
}

/**
 * Las ejecuciones agrupadas por instante.
 *
 * Coinbase parte una orden en varias ejecuciones del mismo segundo y precio, y
 * seis flechas idénticas sobre la misma vela tapan la vela sin decir nada que
 * no diga una. Se agrupan por segundo, no por vela: la vela depende de la
 * granularidad elegida y el instante no.
 */
export function groupFillsByTime(fills: ChartFill[]): Map<number, FillGroup> {
  const porInstante = new Map<number, ChartFill[]>();

  for (const fill of fills) {
    const lista = porInstante.get(fill.time);
    if (lista) lista.push(fill);
    else porInstante.set(fill.time, [fill]);
  }

  const salida = new Map<number, FillGroup>();
  for (const [time, lista] of porInstante) {
    salida.set(time, describeGroup(time, lista));
  }
  return salida;
}

function describeGroup(time: number, fills: ChartFill[]): FillGroup {
  let entryQty = new Decimal(0);
  let exitQty = new Decimal(0);
  let ponderado = new Decimal(0);
  let total = new Decimal(0);

  for (const fill of fills) {
    const size = new Decimal(fill.size);
    if (fill.role === "ENTRY") entryQty = entryQty.plus(size);
    else exitQty = exitQty.plus(size);
    ponderado = ponderado.plus(new Decimal(fill.price).times(size));
    total = total.plus(size);
  }

  return {
    time,
    fills,
    entryQty: entryQty.toString(),
    exitQty: exitQty.toString(),
    wap: total.isZero() ? "0" : ponderado.dividedBy(total).toFixed(2),
    // Null cuando en el mismo instante entraste y saliste: llamarlo «entrada»
    // o «salida» sería elegir una de las dos y esconder la otra.
    role: entryQty.isZero() ? "EXIT" : exitQty.isZero() ? "ENTRY" : null,
  };
}

/**
 * El grupo más cercano al instante señalado, si está lo bastante cerca.
 *
 * El cursor nunca cae exactamente sobre el segundo de una ejecución: cae sobre
 * una vela, y una vela de una hora abarca tres mil seiscientos segundos. Se
 * busca dentro de la tolerancia que corresponde a la granularidad -- media
 * vela a cada lado -- para que señalar la vela donde entraste enseñe lo que
 * entraste, sin que señalar la de al lado enseñe lo mismo.
 */
export function findGroupNear(
  groups: Map<number, FillGroup>,
  time: number,
  toleranceSeconds: number,
): FillGroup | null {
  let mejor: FillGroup | null = null;
  let distanciaMejor = Number.POSITIVE_INFINITY;

  for (const group of groups.values()) {
    const distancia = Math.abs(group.time - time);
    if (distancia > toleranceSeconds) continue;
    if (distancia < distanciaMejor) {
      distanciaMejor = distancia;
      mejor = group;
    }
  }

  return mejor;
}

/** Lo que se enseña al pasar por encima, en una línea por concepto. */
export function describeGroupLines(group: FillGroup): string[] {
  const lineas: string[] = [];

  if (group.role === null) {
    lineas.push(`Entrada ${group.entryQty} · Salida ${group.exitQty}`);
  } else if (group.role === "ENTRY") {
    lineas.push(`Entrada de ${group.entryQty}`);
  } else {
    lineas.push(`Salida de ${group.exitQty}`);
  }

  lineas.push(`Precio ${group.wap}`);

  // Sólo se dice cuántas ejecuciones cuando fue más de una: «1 ejecución» es
  // una línea que no aporta nada y que aparecería en la mayoría de los casos.
  if (group.fills.length > 1) {
    lineas.push(`${group.fills.length} ejecuciones en el mismo momento`);
  }

  return lineas;
}

/**
 * Cuánta tolerancia dar al cursor según el tamaño de la vela.
 *
 * Media vela a cada lado: con más, dos velas contiguas enseñarían la misma
 * ejecución; con menos, habría que acertar el píxel exacto.
 */
export function toleranceFor(granularitySeconds: number): number {
  return Math.max(1, Math.floor(granularitySeconds / 2));
}
