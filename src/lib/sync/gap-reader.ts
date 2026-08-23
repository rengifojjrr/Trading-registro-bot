import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { findFillGaps, type FillGap } from "./gaps";

/**
 * Lee el cuadre por orden y aplica la regla, que vive en `gaps.ts`.
 *
 * Separado del orquestador porque no lo pregunta sólo él: la puerta de la
 * sincronización automática y la barra de salud necesitan la misma respuesta,
 * y tres sitios calculando «¿falta algún fill?» por su cuenta acaban siendo
 * tres respuestas distintas.
 */

interface TallyRow {
  order_id: string;
  expected_size: string | null;
  expected_fills: string | null;
  stored_size: string;
  stored_count: number;
}

interface TallyQuery extends PromiseLike<{ data: TallyRow[] | null; error: unknown }> {
  eq: (column: string, value: string) => TallyQuery;
}

type UntypedFrom = (table: string) => { select: (columns: string) => TallyQuery };

const COLUMNAS = "order_id, expected_size, expected_fills, stored_size, stored_count";

async function leerHuecos(filtros: Record<string, string>): Promise<FillGap[]> {
  const supabase = createAdminClient();

  // `order_fill_tallies` es una vista y los tipos generados sólo cubren
  // tablas, así que el cliente tipado no la conoce. El tipo se pierde aquí,
  // en un sitio, con el motivo escrito; la forma la garantiza la migración
  // que define la vista.
  let query = (supabase.from as unknown as UntypedFrom)("order_fill_tallies").select(COLUMNAS);
  for (const [columna, valor] of Object.entries(filtros)) query = query.eq(columna, valor);

  const { data, error } = await query;
  if (error || !data) return [];

  return findFillGaps(
    data.map((row) => ({
      orderId: row.order_id,
      filledSize: row.expected_size,
      numberOfFills: row.expected_fills === null ? null : Number(row.expected_fills),
    })),
    data.map((row) => ({
      orderId: row.order_id,
      storedSize: row.stored_size,
      storedCount: row.stored_count,
    })),
  );
}

/** Los huecos de un producto concreto, que es el ámbito de una reconstrucción. */
export function findGapsForProduct(
  userId: string,
  accountId: string,
  productId: string,
): Promise<FillGap[]> {
  return leerHuecos({ user_id: userId, account_id: accountId, product_id: productId });
}

/** Todos los huecos del usuario, para decidir si sus cifras son de fiar. */
export function findGapsForUser(userId: string): Promise<FillGap[]> {
  return leerHuecos({ user_id: userId });
}
