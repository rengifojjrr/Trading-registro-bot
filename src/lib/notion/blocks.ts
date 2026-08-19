import "server-only";

import { getNotionClient } from "./client";
import { renderBlock, type NotionBlock } from "./render-blocks";

/**
 * El cuerpo de una página de Notion, como texto.
 *
 * La importación sólo leía propiedades, y en tu espacio el trabajo de verdad
 * está en el cuerpo: cada pieza de contenido lleva dentro su guion con la
 * estructura HOOK / SCRIPT/NOTES / TAGS, y las tareas llevan su explicación
 * («Hacer inventario de trendy sports»). Todo eso se quedaba fuera entero.
 *
 * Se traduce a Markdown y no a HTML ni a un árbol de bloques. Markdown es lo
 * que se puede volver a escribir a mano en un área de texto sin perder nada,
 * y este contenido está para leerlo y editarlo, no para renderizarlo con
 * fidelidad tipográfica.
 */

/** Cuántos bloques se traen como mucho, para que una página enorme no cuelgue. */
const MAX_BLOCKS = 400;

export async function fetchPageBody(pageId: string): Promise<string | null> {
  const blocks = await listBlocks(pageId, 0);
  if (blocks === null) return null;

  const text = blocks.join("\n").trim();
  return text === "" ? null : text;
}

/**
 * Trae los bloques de un contenedor, recursivamente.
 *
 * `depth` corta a tres niveles: más allá de eso son listas anidadas que en un
 * área de texto plano ya no se distinguen, y cada nivel es otra ronda de
 * llamadas a la API.
 */
async function listBlocks(blockId: string, depth: number): Promise<string[] | null> {
  if (depth > 3) return [];

  const notion = getNotionClient();
  const lines: string[] = [];
  let cursor: string | undefined;

  try {
    do {
      const response = await notion.blocks.children.list({
        block_id: blockId,
        start_cursor: cursor,
        page_size: 100,
      });

      for (const result of response.results) {
        if (!("type" in result)) continue;
        const block = result as unknown as NotionBlock;

        const line = renderBlock(block, depth);
        if (line !== null) lines.push(line);

        if (block.has_children && lines.length < MAX_BLOCKS) {
          const children = await listBlocks(block.id, depth + 1);
          for (const child of children ?? []) lines.push(`  ${child}`);
        }

        if (lines.length >= MAX_BLOCKS) return lines;
      }

      cursor = response.next_cursor ?? undefined;
    } while (cursor);
  } catch {
    // Una página sin permisos de lectura de bloques no debe tumbar la
    // importación entera: se importa sin cuerpo y se sigue.
    return null;
  }

  return lines;
}
