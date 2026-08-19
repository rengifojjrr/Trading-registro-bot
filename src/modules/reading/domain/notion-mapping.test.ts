import { describe, expect, it } from "vitest";

import { booksIn, mapNotionSession, parseDurationLabel } from "./notion-mapping";

function page(properties: Record<string, unknown>, id = "read-1") {
  return {
    id,
    properties: {
      Inicio: { type: "created_time", created_time: "2026-02-16T14:57:04.000Z" },
      ...properties,
    },
  };
}

const select = (name: string) => ({ type: "select", select: { name } });
const multi = (...names: string[]) => ({
  type: "multi_select",
  multi_select: names.map((name) => ({ name })),
});
const text = (value: string) => ({ type: "rich_text", rich_text: [{ plain_text: value }] });

describe("parseDurationLabel", () => {
  it("lee los minutos de la etiqueta real «40 minutos»", () => {
    expect(parseDurationLabel("40 minutos")).toBe(40);
    expect(parseDurationLabel("40 min")).toBe(40);
  });

  it("lee también horas, y horas con minutos", () => {
    expect(parseDurationLabel("1 hora")).toBe(60);
    expect(parseDurationLabel("2 horas")).toBe(120);
    expect(parseDurationLabel("1h 30m")).toBe(90);
    expect(parseDurationLabel("1,5 horas")).toBe(90);
  });

  it("devuelve null en vez de cero cuando no hay duración legible", () => {
    expect(parseDurationLabel(null)).toBeNull();
    expect(parseDurationLabel("un rato")).toBeNull();
  });
});

describe("mapNotionSession", () => {
  it("saca los minutos de «Cuantas Hojas», que es donde acabaron", () => {
    const result = mapNotionSession(page({ "Cuantas Hojas": select("40 minutos") }));

    expect(result?.session.minutes).toBe(40);
    expect(result?.warnings).toEqual([]);
  });

  it("deja las páginas sin valor, porque no existen en ningún campo", () => {
    const result = mapNotionSession(page({ "Cuantas Hojas": select("40 minutos") }));
    expect(result?.session.pages).toBeNull();
  });

  it("junta el género de los dos campos que lo guardan", () => {
    const result = mapNotionSession(
      page({
        "Tipo de lectura": multi("Espiritual"),
        "Cuanto Tiempo lei ?": multi("Metafisica"),
      }),
    );

    // «Metafisica» sin tilde en Notion; aquí el género se llama «Metafísica».
    expect(result?.session.genres).toEqual(["Espiritual", "Metafísica"]);
  });

  it("no repite un género que esté en los dos campos", () => {
    const result = mapNotionSession(
      page({ "Tipo de lectura": multi("Marketing"), "Cuanto Tiempo lei ?": multi("Marketing") }),
    );

    expect(result?.session.genres).toEqual(["Marketing"]);
  });

  it("usa la fecha de creación como día de la lectura", () => {
    expect(mapNotionSession(page({}))?.session.session_date).toBe("2026-02-16");
  });

  it("traduce la hora de inicio", () => {
    expect(mapNotionSession(page({ "A que hora empece": select("8am") }))?.session.start_clock).toBe(
      "08:00",
    );
  });

  it("trae el resumen, el puntaje, el libro y el autor", () => {
    const result = mapNotionSession(
      page({
        "Resumen ": text("Leí sobre hormonas"),
        Puntaje: { type: "number", number: 6 },
        "Que libro ?": multi("Google"),
        Autor: multi("Google"),
      }),
    );

    expect(result?.session.summary).toBe("Leí sobre hormonas");
    expect(result?.session.score).toBe(6);
    expect(result?.session.book_title).toBe("Google");
    expect(result?.session.book_author).toBe("Google");
  });

  it("descarta una fila sin fecha de creación", () => {
    expect(mapNotionSession({ id: "x", properties: {} })).toBeNull();
  });
});

describe("booksIn", () => {
  it("deduce los libros de las lecturas y les junta los géneros", () => {
    const sessions = [
      mapNotionSession(
        page({ "Que libro ?": multi("Meditaciones"), "Tipo de lectura": multi("Espiritual") }, "a"),
      )!.session,
      mapNotionSession(
        page({ "Que libro ?": multi("Meditaciones"), "Tipo de lectura": multi("Metafisica") }, "b"),
      )!.session,
    ];

    expect(booksIn(sessions)).toEqual([
      { title: "Meditaciones", author: null, genres: ["Espiritual", "Metafísica"] },
    ]);
  });

  it("ignora las lecturas sin libro en lugar de crear uno sin nombre", () => {
    const sessions = [mapNotionSession(page({}, "a"))!.session];
    expect(booksIn(sessions)).toEqual([]);
  });

  it("se queda con el primer autor que aparezca", () => {
    const sessions = [
      mapNotionSession(page({ "Que libro ?": multi("Libro") }, "a"))!.session,
      mapNotionSession(page({ "Que libro ?": multi("Libro"), Autor: multi("Tracy") }, "b"))!.session,
    ];

    expect(booksIn(sessions)[0].author).toBe("Tracy");
  });
});
