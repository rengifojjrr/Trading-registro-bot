import "server-only";

import { fetchPageBody } from "./blocks";
import { getNotionClient } from "./client";
import type { NotionProperties } from "./properties";

/**
 * Lee una base de datos de Notion entera.
 *
 * Todas las importaciones hacen exactamente esto -- resolver el data source,
 * paginar de cien en cien y devolver las páginas -- así que está una sola vez.
 *
 * Se leen todas las páginas antes de que nadie escriba nada. Una importación
 * a medias por un fallo de red en mitad de la paginación dejaría el módulo
 * diciendo que faltan cosas que sí existen, y en un tablero eso se lee como
 * «se me perdió trabajo», que es peor que no haber importado.
 */

export interface NotionPage {
  id: string;
  properties: NotionProperties;
  /**
   * Cuándo se creó la página en Notion.
   *
   * Hace falta porque varias bases no tienen columna de fecha propia y su
   * única marca temporal es esta -- y porque sin ella, todo lo importado
   * parece creado el día de la importación, que convierte cualquier gráfica
   * de «cuántas entran por día» en un pico falso.
   */
  createdTime: string | null;
  /**
   * El emoji de la página, cuando lo tiene.
   *
   * Tus registros de sueño llevan 💤 y las piezas de contenido llevan uno
   * propio; no es decoración, es lo que hace que reconozcas una fila sin
   * llegar a leerla.
   *
   * Sólo emoji: un icono subido como imagen es una URL que caduca, y guardar
   * una URL caducada en la columna del icono deja un hueco roto para siempre.
   */
  icon: string | null;
  /**
   * El cuerpo de la página, en Markdown. Sólo si se pidió.
   *
   * Cuesta una llamada por página, así que se pide sólo donde el cuerpo es el
   * dato -- guiones y descripciones de tareas -- y no en las bases donde todo
   * está en propiedades.
   */
  body: string | null;
}

export type ReadResult =
  | { ok: true; pages: NotionPage[] }
  | { ok: false; error: string };

export interface ReadOptions {
  /**
   * Traer también el cuerpo de cada página.
   *
   * Es una llamada extra por página. En una base de sesenta filas eso son
   * sesenta llamadas más, unos veinte segundos con el límite de tres por
   * segundo de Notion -- asumible en una importación que se lanza a mano, y
   * caro en una que se lanzara sola.
   */
  withBodies?: boolean;
}

export async function readNotionDatabase(
  databaseId: string,
  options: ReadOptions = {},
): Promise<ReadResult> {
  const notion = getNotionClient();

  let dataSourceId: string;
  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });
    const found = (database as { data_sources?: { id: string }[] }).data_sources?.[0]?.id;
    if (!found) return { ok: false, error: "La base de datos de Notion no tiene ningún data source." };
    dataSourceId = found;
  } catch {
    return {
      ok: false,
      error: "No se pudo abrir la base de datos de Notion. Revisa el identificador y los permisos.",
    };
  }

  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  try {
    do {
      const response = await notion.dataSources.query({
        data_source_id: dataSourceId,
        start_cursor: cursor,
        page_size: 100,
      });

      for (const result of response.results) {
        if ("properties" in result) {
          const icon = "icon" in result ? result.icon : null;
          pages.push({
            id: result.id,
            properties: result.properties as unknown as NotionProperties,
            createdTime:
              "created_time" in result && typeof result.created_time === "string"
                ? result.created_time
                : null,
            icon:
              icon !== null && typeof icon === "object" && "emoji" in icon
                ? ((icon as { emoji?: string }).emoji ?? null)
                : null,
            body: null,
          });
        }
      }

      cursor = response.next_cursor ?? undefined;
    } while (cursor);
  } catch {
    return { ok: false, error: "Notion devolvió un error al leer las páginas." };
  }

  if (options.withBodies) {
    // De cinco en cinco: en serie una base de sesenta filas tarda un minuto, y
    // de golpe Notion responde 429. Cinco a la vez se queda por debajo de su
    // límite de tres por segundo contando la latencia.
    for (let i = 0; i < pages.length; i += 5) {
      const slice = pages.slice(i, i + 5);
      const bodies = await Promise.all(slice.map((page) => fetchPageBody(page.id)));
      slice.forEach((page, index) => {
        page.body = bodies[index];
      });
    }
  }

  return { ok: true, pages };
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  /** Lo que la importación no supo interpretar, sin repetir. */
  warnings: string[];
  /** Una línea por cosa que conviene saber aunque no sea un fallo. */
  notes: string[];
  error: string | null;
}

export const EMPTY_RESULT: ImportResult = {
  imported: 0,
  updated: 0,
  skipped: 0,
  warnings: [],
  notes: [],
  error: null,
};
