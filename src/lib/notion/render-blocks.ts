/**
 * Un bloque de Notion, como una línea de texto.
 *
 * Puro y sin red, aparte de quien los va a buscar: así se puede probar contra
 * los bloques raros de verdad -- una lista de tareas a medias, un bloque de
 * código, un tipo que la API todavía no documenta -- sin llamar a nadie.
 *
 * Se traduce a Markdown y no a HTML. Markdown es lo que se puede volver a
 * escribir a mano en un área de texto sin perder nada, y este contenido está
 * para leerlo y editarlo, no para renderizarlo con fidelidad tipográfica.
 */

export interface RichText {
  plain_text?: string;
  annotations?: { bold?: boolean; italic?: boolean; code?: boolean };
}

export interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  [key: string]: unknown;
}

/**
 * Devuelve la línea, o `null` si el bloque no aporta nada.
 *
 * `depth` es cero en el primer nivel. Sirve para una sola decisión: los tipos
 * desconocidos se dejan pasar arriba si traen texto -- porque entonces el
 * texto es lo que importa y el tipo da igual -- y se callan dentro, donde
 * probablemente sean el relleno de un bloque que ya se pintó.
 */
export function renderBlock(block: NotionBlock, depth = 0): string | null {
  const content = block[block.type] as
    | { rich_text?: RichText[]; checked?: boolean }
    | undefined;
  const text = plainFrom(content?.rich_text);

  switch (block.type) {
    case "paragraph":
      return text;
    case "heading_1":
      return text === "" ? "" : `# ${text}`;
    case "heading_2":
      return text === "" ? "" : `## ${text}`;
    case "heading_3":
      return text === "" ? "" : `### ${text}`;
    case "bulleted_list_item":
      return `- ${text}`;
    case "numbered_list_item":
      return `1. ${text}`;
    case "to_do":
      return `- [${content?.checked ? "x" : " "}] ${text}`;
    case "quote":
      return `> ${text}`;
    case "code":
      return `\`\`\`\n${text}\n\`\`\``;
    case "callout":
      return text === "" ? null : `> ${text}`;
    case "toggle":
      return text === "" ? null : `**${text}**`;
    case "divider":
      return "---";
    case "child_page":
      // Una subpágina se nombra pero no se sigue: traerla entera mezclaría dos
      // documentos en un mismo campo de texto.
      return `[${String((block.child_page as { title?: string })?.title ?? "Subpágina")}]`;
    default:
      // Los tipos que no se saben pintar se callan en lugar de escribir
      // «[no soportado]» en medio de un guion.
      return depth === 0 && text !== "" ? text : null;
  }
}

/** El texto de un `rich_text`, con las marcas que sobreviven en Markdown. */
export function plainFrom(rich: RichText[] | undefined): string {
  if (!rich) return "";
  return rich
    .map((part) => {
      const value = part.plain_text ?? "";
      if (value === "") return "";
      // El código gana a la negrita: `**`código`**` no se renderiza en ningún
      // sitio, y anidar marcas en texto plano se lee peor que elegir una.
      if (part.annotations?.code) return `\`${value}\``;
      if (part.annotations?.bold) return `**${value}**`;
      if (part.annotations?.italic) return `*${value}*`;
      return value;
    })
    .join("");
}
