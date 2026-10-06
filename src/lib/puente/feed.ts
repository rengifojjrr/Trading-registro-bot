import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";

import { ENTIDADES, esEntidad, recortarFila, type Entidad, type TablaDelPuente } from "./tablas";

/**
 * El feed de cambios: lo que pasó en la aplicación desde la última vez que el
 * bot preguntó.
 *
 * El bot pide «después del número N» y recibe, en orden, la foto de cada fila
 * que cambió (no la diferencia): si la versión es más nueva que la suya, la
 * aplica; si no, la deja. Entrega «al menos una vez» y aplicación idempotente
 * dan el efecto «exactamente una vez», aunque la Mac se duerma a la mitad.
 *
 * La foto lleva **sólo** las columnas de `ENTIDADES` (`tablas.ts`), aunque la
 * base devolviera más: lo vigila `feed.test.ts`.
 */

type Admin = ReturnType<typeof createAdminClient>;

export const FEED_LIMITE = 200;
export const FEED_LIMITE_MAX = 500;

export interface CambioDelFeed {
  seq: number;
  entidad: Entidad;
  id: string;
  op: "upsert" | "delete";
  version: number | null;
  /** Lo hizo un cliente del puente (para no avisar de lo propio); nulo = la aplicación. */
  por: string | null;
  en: string;
  fila: Record<string, unknown> | null;
}

export interface PaginaDelFeed {
  cambios: CambioDelFeed[];
  /** El cursor para la siguiente llamada. */
  siguiente: number;
  /** Hay más detrás: pedir otra vez enseguida. */
  mas: boolean;
  /**
   * El último número que hay. Si el cursor del bot va por delante, la base
   * volvió de una copia (el feed no va en las copias): el bot empieza de cero.
   */
  ultimo: number;
}

interface FilaDeCambio {
  seq: number;
  entidad: string;
  entidad_id: string;
  op: "upsert" | "delete";
  version: number | null;
  por: string | null;
  cambiado_en: string;
}

/** Leer filas de una tabla de la lista por ids. El nombre de la tabla sólo sale de `ENTIDADES`. */
interface LecturaSinTipo {
  select: (columnas: string) => {
    eq: (c: string, v: string) => {
      in: (c: string, v: string[]) => PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
  };
}

function tablaDe(entidad: Entidad): TablaDelPuente {
  return ENTIDADES[entidad].tabla;
}

export async function leerFeed(
  admin: Admin,
  userId: string,
  despuesDe: number,
  limite: number = FEED_LIMITE,
): Promise<PaginaDelFeed> {
  const tope = Math.max(1, Math.min(FEED_LIMITE_MAX, Math.floor(limite)));
  const { data, error } = await admin
    .from("puente_cambios")
    .select("seq, entidad, entidad_id, op, version, por, cambiado_en")
    .eq("user_id", userId)
    .gt("seq", despuesDe)
    .order("seq", { ascending: true })
    .limit(tope + 1);
  if (error) throw new Error("feed");

  const filas = (data ?? []) as FilaDeCambio[];
  const mas = filas.length > tope;
  let ultimo = filas.length > 0 ? filas[filas.length - 1].seq : 0;
  if (!mas) {
    const { data: final } = await admin
      .from("puente_cambios")
      .select("seq")
      .eq("user_id", userId)
      .order("seq", { ascending: false })
      .limit(1)
      .maybeSingle();
    ultimo = Math.max(ultimo, final?.seq ?? 0);
  }
  const pagina = filas.slice(0, tope);
  const siguiente = pagina.length > 0 ? pagina[pagina.length - 1].seq : despuesDe;

  // De cada fila, sólo el último cambio de la página: la foto ya es la de ahora.
  const ultimoDeCada = new Map<string, FilaDeCambio>();
  for (const c of pagina) if (esEntidad(c.entidad)) ultimoDeCada.set(`${c.entidad}:${c.entidad_id}`, c);

  const porEntidad = new Map<Entidad, string[]>();
  for (const c of ultimoDeCada.values()) {
    const entidad = c.entidad as Entidad;
    porEntidad.set(entidad, [...(porEntidad.get(entidad) ?? []), c.entidad_id]);
  }

  const fotos = new Map<string, Record<string, unknown>>();
  for (const [entidad, ids] of porEntidad) {
    const consulta = admin.from(tablaDe(entidad)) as unknown as LecturaSinTipo;
    const { data: filasDeTabla, error: errorDeTabla } = await consulta
      .select(ENTIDADES[entidad].columnas.join(", "))
      .eq("user_id", userId)
      .in("id", ids);
    // Sin foto no se puede decir si la fila sigue ahí: mejor no avanzar el
    // cursor que mandar un borrado que no fue. El bot vuelve a pedir.
    if (errorDeTabla) throw new Error("feed");
    for (const fila of filasDeTabla ?? []) {
      fotos.set(`${entidad}:${String(fila.id)}`, recortarFila(entidad, fila));
    }
  }

  const cambios: CambioDelFeed[] = [...ultimoDeCada.values()]
    .sort((a, b) => a.seq - b.seq)
    .map((c) => {
      const entidad = c.entidad as Entidad;
      const fila = fotos.get(`${entidad}:${c.entidad_id}`) ?? null;
      return {
        seq: c.seq,
        entidad,
        id: c.entidad_id,
        // Sin foto es que ya no está (se borró después, o era un borrado).
        op: fila ? "upsert" : "delete",
        version: fila && typeof fila.version === "number" ? fila.version : c.version,
        por: c.por,
        en: c.cambiado_en,
        fila,
      };
    });

  return { cambios, siguiente, mas, ultimo };
}
