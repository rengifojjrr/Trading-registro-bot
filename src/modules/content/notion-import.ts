import "server-only";

import { serverEnv } from "@/lib/env";
import { getNotionClient } from "@/lib/notion/client";
import { createClient } from "@/lib/supabase/server";

import { mapNotionPage, type NotionMappedPiece } from "./domain/notion-mapping";

/**
 * Trae el calendario de contenido desde Notion.
 *
 * Una sola dirección, y a propósito. Mientras el editor trabaje en Notion,
 * Notion manda en Contenido y la aplicación refleja; dos direcciones exigirían
 * resolver conflictos -- él cambia el estado allí, yo aquí, ¿cuál gana? -- y
 * ese problema no hace falta tenerlo todavía. El día que se le abra esta
 * aplicación, se apaga la importación y la dirección se invierte de golpe, sin
 * un periodo en que las dos escriban.
 *
 * La reimportación es idempotente: cada pieza recuerda de qué página de Notion
 * vino, y el índice único sobre `(user_id, notion_page_id)` convierte el
 * segundo intento en una actualización.
 */

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  /** Valores de Notion que no reconocemos, sin repetir. */
  warnings: string[];
  error: string | null;
}

const EMPTY: ImportResult = { imported: 0, updated: 0, skipped: 0, warnings: [], error: null };

export function contentDatabaseId(): string | null {
  return serverEnv().NOTION_CONTENT_DATABASE_ID ?? null;
}

export async function importContentCalendar(): Promise<ImportResult> {
  const env = serverEnv();
  if (!env.NOTION_API_TOKEN) {
    return { ...EMPTY, error: "Falta configurar NOTION_API_TOKEN en el servidor." };
  }
  const databaseId = env.NOTION_CONTENT_DATABASE_ID;
  if (!databaseId) {
    return { ...EMPTY, error: "Falta configurar NOTION_CONTENT_DATABASE_ID en el servidor." };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ...EMPTY, error: "No hay sesión." };

  const notion = getNotionClient();

  let dataSourceId: string;
  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });
    const found = (database as { data_sources?: { id: string }[] }).data_sources?.[0]?.id;
    if (!found) {
      return { ...EMPTY, error: "La base de datos de Notion no tiene ningún data source." };
    }
    dataSourceId = found;
  } catch {
    return {
      ...EMPTY,
      error: "No se pudo abrir la base de datos de Notion. Revisa el identificador y los permisos.",
    };
  }

  // Se leen todas las páginas antes de escribir nada: una importación a
  // medias por un fallo de red a mitad de la paginación dejaría el tablero
  // diciendo que faltan piezas que sí existen.
  const pages: { id: string; properties: Record<string, unknown> }[] = [];
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
            properties: result.properties as unknown as Record<string, unknown>,
          });
        }
      }

      cursor = response.next_cursor ?? undefined;
    } while (cursor);
  } catch {
    return { ...EMPTY, error: "Notion devolvió un error al leer las páginas." };
  }

  const warnings = new Set<string>();
  const rows: (NotionMappedPiece & { user_id: string; updated_at: string })[] = [];
  let skipped = 0;

  for (const page of pages) {
    const mapped = mapNotionPage(page);
    if (!mapped) {
      skipped += 1;
      continue;
    }
    for (const warning of mapped.warnings) warnings.add(warning);
    rows.push({ user_id: auth.user.id, ...mapped.piece, updated_at: new Date().toISOString() });
  }

  if (rows.length === 0) {
    return { ...EMPTY, skipped, warnings: [...warnings] };
  }

  // Cuáles ya existían, para poder distinguir «nuevas» de «actualizadas» en el
  // informe. Sin esto la importación diría «120 importadas» cada vez.
  const { data: existing } = await supabase
    .from("content_pieces")
    .select("notion_page_id")
    .eq("user_id", auth.user.id)
    .not("notion_page_id", "is", null);

  const known = new Set((existing ?? []).map((row) => row.notion_page_id));

  const { error } = await supabase
    .from("content_pieces")
    .upsert(rows, { onConflict: "user_id,notion_page_id" });

  if (error) {
    return { ...EMPTY, error: "No se pudieron guardar las piezas importadas." };
  }

  const updated = rows.filter((row) => known.has(row.notion_page_id)).length;

  return {
    imported: rows.length - updated,
    updated,
    skipped,
    warnings: [...warnings],
    error: null,
  };
}
