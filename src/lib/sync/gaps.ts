import Decimal from "decimal.js";

/**
 * Encontrar los fills que Coinbase ejecutó y nosotros no guardamos.
 *
 * La reconstrucción parte de que `raw_fills` contiene *todos* los fills. Si
 * falta uno, no falla nada: la posición reconstruida queda desplazada, y como
 * una operación nace cuando la posición sale de cero y muere cuando vuelve a
 * cero, un solo contrato de más impide que vuelva a cero nunca. Todas las
 * operaciones siguientes se funden en una sola, interminable, con un precio de
 * entrada promediado sobre contratos que ya se cerraron hace días.
 *
 * Eso es exactamente lo que pasó aquí: una compra de 1 contrato del 11 de
 * agosto de 2026 no se guardó, y a partir del 17 de agosto la aplicación
 * enseñaba una operación fantasma de 151 contratos con 2.845 dólares de
 * pérdida que no existían.
 *
 * Lo que hace que el hueco sea *detectable* es que la propia orden lo delata:
 * Coinbase devuelve en cada orden cuánto se ejecutó (`filled_size`) y en
 * cuántos trozos (`number_of_fills`). Comparar eso contra lo guardado no es
 * una heurística -- es una cuadratura exacta, y además dice qué orden hay que
 * volver a pedir, que es todo lo que hace falta para reparar el hueco.
 *
 * Este módulo es puro a propósito: no habla con Coinbase ni con la base de
 * datos. Recibe las dos caras y dice en qué no cuadran.
 */

/** Lo que la orden dice de sí misma, sacado de su payload de Coinbase. */
export interface OrderExpectation {
  orderId: string;
  /** `filled_size` de Coinbase. Nulo si la orden no lo trae. */
  filledSize: string | null;
  /** `number_of_fills` de Coinbase. Nulo si la orden no lo trae. */
  numberOfFills: number | null;
}

/** Lo que tenemos guardado de esa orden. */
export interface StoredFillTally {
  orderId: string;
  storedSize: string;
  storedCount: number;
}

export interface FillGap {
  orderId: string;
  expectedSize: string | null;
  storedSize: string;
  expectedCount: number | null;
  storedCount: number;
  /** En contratos. Positivo = falta por guardar. */
  missingSize: string | null;
  missingCount: number | null;
}

/**
 * Las órdenes cuyos fills guardados no cuadran con lo que Coinbase dice.
 *
 * Sólo se mira si falta, nunca si sobra. Guardar de más es imposible --
 * `raw_fills` está indexado por el `entry_id` de Coinbase, así que reinsertar
 * un fill no hace nada -- y si algún día Coinbase corrige una orden a la baja,
 * tratarlo como hueco haría que la aplicación pidiera para siempre unos fills
 * que ya no existen.
 *
 * Una orden sin `filled_size` ni `number_of_fills` no se puede cuadrar y no se
 * reporta: no saber no es lo mismo que faltar.
 */
export function findFillGaps(
  orders: OrderExpectation[],
  stored: StoredFillTally[],
): FillGap[] {
  const byOrder = new Map(stored.map((s) => [s.orderId, s]));
  const gaps: FillGap[] = [];

  for (const order of orders) {
    const tally = byOrder.get(order.orderId);
    const storedSize = tally?.storedSize ?? "0";
    const storedCount = tally?.storedCount ?? 0;

    const expectedSize = parseSize(order.filledSize);
    const expectedCount =
      order.numberOfFills !== null && Number.isFinite(order.numberOfFills)
        ? order.numberOfFills
        : null;

    const missingSize =
      expectedSize !== null ? expectedSize.minus(new Decimal(storedSize)) : null;
    const missingCount = expectedCount !== null ? expectedCount - storedCount : null;

    const faltaTamano = missingSize !== null && missingSize.greaterThan(0);
    const faltaCuenta = missingCount !== null && missingCount > 0;

    if (faltaTamano || faltaCuenta) {
      gaps.push({
        orderId: order.orderId,
        expectedSize: expectedSize?.toString() ?? null,
        storedSize,
        expectedCount,
        storedCount,
        missingSize: faltaTamano ? missingSize.toString() : null,
        missingCount: faltaCuenta ? missingCount : null,
      });
    }
  }

  return gaps;
}

function parseSize(value: string | null): Decimal | null {
  if (value === null || value.trim() === "") return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Hasta dónde puede avanzar la marca de agua.
 *
 * Sólo hasta el último fill **guardado** que no tenga por delante ninguno sin
 * guardar. Parar en el primer hueco es lo que convierte un fallo puntual en
 * algo que la siguiente sincronización reintenta, en lugar de en un agujero
 * permanente: la ventana normal sólo pide lo posterior a la marca, así que lo
 * que quede por detrás no se vuelve a mirar nunca.
 *
 * Recibe sólo lo que necesita -- el identificador y el sello de tiempo -- para
 * no arrastrar aquí el tipo entero de un fill de Coinbase.
 */
export function storedHighWaterMark(
  fills: { entry_id: string; sequence_timestamp: string }[],
  stored: Set<string>,
): string {
  const enOrden = [...fills].sort((a, b) =>
    a.sequence_timestamp < b.sequence_timestamp
      ? -1
      : a.sequence_timestamp > b.sequence_timestamp
        ? 1
        : 0,
  );

  let marca = "1970-01-01T00:00:00Z";
  for (const fill of enOrden) {
    if (!stored.has(fill.entry_id)) break;
    marca = fill.sequence_timestamp;
  }
  return marca;
}

/** Cómo se le cuenta a una persona, sin jerga y sin asustar de más. */
export function describeGap(gap: FillGap): string {
  const trozos =
    gap.missingCount !== null
      ? `${gap.missingCount} ${gap.missingCount === 1 ? "ejecución" : "ejecuciones"}`
      : null;
  const contratos =
    gap.missingSize !== null
      ? `${gap.missingSize} ${gap.missingSize === "1" ? "contrato" : "contratos"}`
      : null;

  const falta = [trozos, contratos].filter(Boolean).join(" · ");
  return `Orden ${gap.orderId.slice(0, 8)}: falta ${falta} por registrar (Coinbase dice ${gap.expectedSize ?? "?"}, tenemos ${gap.storedSize}).`;
}
