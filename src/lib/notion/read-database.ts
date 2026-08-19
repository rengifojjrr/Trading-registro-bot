import "server-only";

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
}

export type ReadResult =
  | { ok: true; pages: NotionPage[] }
  | { ok: false; error: string };

export async function readNotionDatabase(databaseId: string): Promise<ReadResult> {
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
          pages.push({
            id: result.id,
            properties: result.properties as unknown as NotionProperties,
          });
        }
      }

      cursor = response.next_cursor ?? undefined;
    } while (cursor);
  } catch {
    return { ok: false, error: "Notion devolvió un error al leer las páginas." };
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
