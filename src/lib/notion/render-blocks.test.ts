import { describe, expect, it } from "vitest";

import { plainFrom, renderBlock, type NotionBlock } from "./render-blocks";

function block(type: string, extra: Record<string, unknown> = {}): NotionBlock {
  return { id: "b", type, ...extra };
}

function rich(text: string, annotations = {}) {
  return { rich_text: [{ plain_text: text, annotations }] };
}

describe("renderBlock", () => {
  it("deja el párrafo tal cual", () => {
    expect(renderBlock(block("paragraph", { paragraph: rich("Hola") }))).toBe("Hola");
  });

  it("marca los tres niveles de encabezado", () => {
    expect(renderBlock(block("heading_1", { heading_1: rich("Uno") }))).toBe("# Uno");
    expect(renderBlock(block("heading_2", { heading_2: rich("Dos") }))).toBe("## Dos");
    expect(renderBlock(block("heading_3", { heading_3: rich("Tres") }))).toBe("### Tres");
  });

  it("no deja una almohadilla suelta cuando el encabezado está vacío", () => {
    // Un encabezado vacío es un bloque que quedó a medias; «# » solo se lee
    // como basura en medio del guion.
    expect(renderBlock(block("heading_1", { heading_1: rich("") }))).toBe("");
  });

  it("pinta las listas", () => {
    expect(renderBlock(block("bulleted_list_item", { bulleted_list_item: rich("Uno") }))).toBe(
      "- Uno",
    );
    expect(renderBlock(block("numbered_list_item", { numbered_list_item: rich("Uno") }))).toBe(
      "1. Uno",
    );
  });

  it("distingue las tareas hechas de las pendientes", () => {
    expect(renderBlock(block("to_do", { to_do: { ...rich("Grabar"), checked: true } }))).toBe(
      "- [x] Grabar",
    );
    expect(renderBlock(block("to_do", { to_do: { ...rich("Editar"), checked: false } }))).toBe(
      "- [ ] Editar",
    );
  });

  it("envuelve el código en vallas", () => {
    expect(renderBlock(block("code", { code: rich("npm test") }))).toBe("```\nnpm test\n```");
  });

  it("convierte la cita y la llamada en el mismo signo", () => {
    expect(renderBlock(block("quote", { quote: rich("Dijo") }))).toBe("> Dijo");
    expect(renderBlock(block("callout", { callout: rich("Ojo") }))).toBe("> Ojo");
  });

  it("calla las llamadas y los desplegables vacíos", () => {
    expect(renderBlock(block("callout", { callout: rich("") }))).toBeNull();
    expect(renderBlock(block("toggle", { toggle: rich("") }))).toBeNull();
  });

  it("nombra una subpágina sin seguirla", () => {
    // Traerla entera mezclaría dos documentos en un mismo campo de texto.
    expect(renderBlock(block("child_page", { child_page: { title: "Notas" } }))).toBe("[Notas]");
  });

  it("nombra una subpágina sin título", () => {
    expect(renderBlock(block("child_page", { child_page: {} }))).toBe("[Subpágina]");
  });

  it("pinta el separador", () => {
    expect(renderBlock(block("divider", { divider: {} }))).toBe("---");
  });

  it("deja pasar un tipo desconocido con texto en el primer nivel", () => {
    // Si trae texto, el texto es lo que importa y el tipo da igual.
    expect(renderBlock(block("synced_block", { synced_block: rich("Aviso") }), 0)).toBe("Aviso");
  });

  it("calla un tipo desconocido dentro de otro bloque", () => {
    expect(renderBlock(block("synced_block", { synced_block: rich("Aviso") }), 2)).toBeNull();
  });

  it("calla un tipo desconocido sin texto", () => {
    expect(renderBlock(block("image", { image: {} }), 0)).toBeNull();
  });

  it("no revienta con un bloque cuyo contenido falta", () => {
    expect(renderBlock(block("paragraph"))).toBe("");
  });
});

describe("plainFrom", () => {
  it("junta los trozos", () => {
    expect(plainFrom([{ plain_text: "Hola " }, { plain_text: "mundo" }])).toBe("Hola mundo");
  });

  it("conserva negrita, cursiva y código", () => {
    expect(plainFrom([{ plain_text: "x", annotations: { bold: true } }])).toBe("**x**");
    expect(plainFrom([{ plain_text: "x", annotations: { italic: true } }])).toBe("*x*");
    expect(plainFrom([{ plain_text: "x", annotations: { code: true } }])).toBe("`x`");
  });

  it("con código y negrita a la vez elige el código", () => {
    // «**`x`**» no se renderiza en ningún sitio; anidar marcas en texto plano
    // se lee peor que elegir una.
    expect(plainFrom([{ plain_text: "x", annotations: { bold: true, code: true } }])).toBe("`x`");
  });

  it("devuelve vacío sin nada que pintar", () => {
    expect(plainFrom(undefined)).toBe("");
    expect(plainFrom([])).toBe("");
    expect(plainFrom([{ plain_text: "" }])).toBe("");
  });
});
