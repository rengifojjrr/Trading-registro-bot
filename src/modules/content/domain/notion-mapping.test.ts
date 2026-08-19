import { describe, expect, it } from "vitest";

import { mapNotionPage, statusMappingIsComplete } from "./notion-mapping";

function page(properties: Record<string, unknown>, id = "page-1") {
  return { id, properties: { Post: title("Un vídeo"), ...properties } };
}

function title(text: string) {
  return { type: "title", title: [{ plain_text: text }] };
}

function richText(text: string) {
  return { type: "rich_text", rich_text: [{ plain_text: text }] };
}

function multi(...names: string[]) {
  return { type: "multi_select", multi_select: names.map((name) => ({ name })) };
}

describe("mapNotionPage", () => {
  it("traduce los diez estados reales", () => {
    const result = mapNotionPage(page({ Status: { type: "status", status: { name: "Falta editar" } } }));
    expect(result?.piece.status).toBe("FALTA_EDITAR");
    expect(result?.warnings).toEqual([]);
  });

  it("encuentra las propiedades cuyo nombre lleva espacios de más", () => {
    // En el calendario real son « resumen», «Guión » y «Miniatura A/B ».
    const result = mapNotionPage(
      page({
        " resumen": richText("De qué va"),
        "Guión ": { type: "checkbox", checkbox: true },
        "Miniatura A/B ": { type: "checkbox", checkbox: true },
      }),
    );

    expect(result?.piece.summary).toBe("De qué va");
    expect(result?.piece.has_script).toBe(true);
    expect(result?.piece.has_thumbnail_ab).toBe(true);
  });

  it("sigue encontrándolas si alguien corrige el espacio en Notion", () => {
    const result = mapNotionPage(page({ resumen: richText("Sin espacio") }));
    expect(result?.piece.summary).toBe("Sin espacio");
  });

  it("traduce las etiquetas de tiempo a minutos", () => {
    const result = mapNotionPage(
      page({
        "Tiempo de Grabacion": multi("3 horas"),
        "Tiempo de Edicion": multi("2 Horas"),
      }),
    );

    expect(result?.piece.record_minutes).toBe(180);
    expect(result?.piece.edit_minutes).toBe(120);
    expect(result?.piece.edit_time_uncapped).toBe(false);
  });

  it("marca como suelo el «deje de contar» en lugar de tomarlo por una medida", () => {
    const result = mapNotionPage(
      page({ "Tiempo de Edicion": multi("despues de las 10 deje de contar") }),
    );

    expect(result?.piece.edit_minutes).toBe(600);
    expect(result?.piece.edit_time_uncapped).toBe(true);
  });

  it("descarta las opciones que no conocemos y avisa de ello", () => {
    const result = mapNotionPage(page({ CANAL: multi("PEKAS", "CANAL NUEVO") }));

    expect(result?.piece.channels).toEqual(["PEKAS"]);
    expect(result?.warnings).toContain("Opción desconocida: «CANAL NUEVO»");
  });

  it("cae a idea con un estado desconocido, pero lo dice", () => {
    const result = mapNotionPage(page({ Status: { type: "status", status: { name: "Inventado" } } }));

    expect(result?.piece.status).toBe("IDEA");
    expect(result?.warnings).toContain("Estado desconocido: «Inventado»");
  });

  it("se queda con el día de una fecha con hora", () => {
    const result = mapNotionPage(
      page({ "Publish Date": { type: "date", date: { start: "2026-08-19T15:00:00.000-05:00" } } }),
    );

    expect(result?.piece.planned_date).toBe("2026-08-19");
  });

  it("saca el enlace de un archivo subido o externo", () => {
    const result = mapNotionPage(
      page({
        Videos: { type: "files", files: [{ file: { url: "https://s3/video.mp4" } }] },
        Listo: { type: "files", files: [{ external: { url: "https://drive/final" } }] },
      }),
    );

    expect(result?.piece.video_url).toBe("https://s3/video.mp4");
    expect(result?.piece.final_url).toBe("https://drive/final");
  });

  it("descarta las filas sin título, que en Notion son filas vacías", () => {
    expect(mapNotionPage({ id: "x", properties: { Post: title("") } })).toBeNull();
    expect(mapNotionPage({ id: "x", properties: {} })).toBeNull();
  });

  it("traduce el tipo y deja null lo que no reconoce", () => {
    expect(mapNotionPage(page({ Type: { type: "select", select: { name: "Video" } } }))?.piece.content_type).toBe(
      "VIDEO",
    );
    expect(mapNotionPage(page({ Type: { type: "select", select: { name: "Photo" } } }))?.piece.content_type).toBe(
      "FOTO",
    );

    const raro = mapNotionPage(page({ Type: { type: "select", select: { name: "Audio" } } }));
    expect(raro?.piece.content_type).toBeNull();
    expect(raro?.warnings).toContain("Tipo desconocido: «Audio»");
  });

  it("no inventa nada cuando la página sólo tiene título", () => {
    const result = mapNotionPage({ id: "x", properties: { Post: title("Sólo el título") } });

    expect(result?.piece.status).toBe("IDEA");
    expect(result?.piece.channels).toEqual([]);
    expect(result?.piece.record_minutes).toBeNull();
    expect(result?.piece.planned_date).toBeNull();
    expect(result?.warnings).toEqual([]);
  });

  it("guarda el identificador de la página para no duplicar al reimportar", () => {
    expect(mapNotionPage(page({}, "abc-123"))?.piece.notion_page_id).toBe("abc-123");
  });
});

describe("statusMappingIsComplete", () => {
  it("cubre los diez estados: si se añade uno, esto falla antes que la importación", () => {
    expect(statusMappingIsComplete()).toBe(true);
  });
});
