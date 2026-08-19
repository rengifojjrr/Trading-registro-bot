import { describe, expect, it } from "vitest";

import {
  checkbox,
  createdTime,
  dateStart,
  dateStartInstant,
  findProperty,
  firstFileUrl,
  knownOnly,
  multiSelectNames,
  numberValue,
  plainText,
  selectName,
} from "./properties";

describe("findProperty", () => {
  const properties = {
    "Dia de dormir ": { type: "date", date: { start: "2026-08-18" } },
    " resumen": { type: "rich_text", rich_text: [{ plain_text: "algo" }] },
    "Cuanto tiempo Dormí? ": { type: "multi_select", multi_select: [{ name: "8 horas" }] },
  };

  it("ignora el espacio colgando que llevan las columnas reales", () => {
    expect(dateStart(findProperty(properties, "Dia de dormir"))).toBe("2026-08-18");
    expect(plainText(findProperty(properties, "resumen"))).toBe("algo");
  });

  it("ignora tildes e interrogaciones", () => {
    expect(multiSelectNames(findProperty(properties, "Cuanto tiempo Dormi"))).toEqual(["8 horas"]);
  });

  it("sigue encontrándolas si alguien corrige el nombre en Notion", () => {
    expect(dateStart(findProperty({ "Dia de dormir": properties["Dia de dormir "] }, "Dia de dormir "))).toBe(
      "2026-08-18",
    );
  });

  it("encuentra «Que libro ?», donde la interrogación va tras un espacio", () => {
    // Al quitar la interrogación queda un espacio colgando. Si el recorte no
    // va al final, este campo no se encuentra y la importación se deja el
    // libro y el género sin avisar de nada.
    const crossed = {
      "Que libro ?": { type: "multi_select", multi_select: [{ name: "Meditaciones" }] },
      "Cuanto Tiempo lei ?": { type: "multi_select", multi_select: [{ name: "Espiritual" }] },
    };

    expect(multiSelectNames(findProperty(crossed, "Que libro"))).toEqual(["Meditaciones"]);
    expect(multiSelectNames(findProperty(crossed, "Cuanto Tiempo lei"))).toEqual(["Espiritual"]);
  });

  it("devuelve null si de verdad no está", () => {
    expect(findProperty(properties, "Inventada")).toBeNull();
  });
});

describe("plainText", () => {
  it("junta los trozos de un texto enriquecido", () => {
    const property = { rich_text: [{ plain_text: "dos " }, { plain_text: "trozos" }] };
    expect(plainText(property)).toBe("dos trozos");
  });

  it("trata el vacío como ausencia, no como cadena vacía", () => {
    expect(plainText({ rich_text: [{ plain_text: "   " }] })).toBeNull();
    expect(plainText({ rich_text: [] })).toBeNull();
    expect(plainText(null)).toBeNull();
  });
});

describe("selectName", () => {
  it("sirve igual para select y para status", () => {
    expect(selectName({ select: { name: "Alta" } })).toBe("Alta");
    expect(selectName({ status: { name: "Done" } })).toBe("Done");
    expect(selectName({ select: null })).toBeNull();
  });
});

describe("checkbox y numberValue", () => {
  it("una casilla ausente es un no, no un indefinido", () => {
    expect(checkbox({ checkbox: true })).toBe(true);
    expect(checkbox({ checkbox: false })).toBe(false);
    expect(checkbox(null)).toBe(false);
  });

  it("un número ausente es null y no cero", () => {
    expect(numberValue({ number: 0 })).toBe(0);
    expect(numberValue({ number: null })).toBeNull();
    expect(numberValue(null)).toBeNull();
  });
});

describe("dateStart", () => {
  it("recorta al día sin convertir a Date, que movería la fecha de zona", () => {
    expect(dateStart({ date: { start: "2026-08-19T21:00:00.000-05:00" } })).toBe("2026-08-19");
    expect(dateStart({ date: { start: "2026-08-19" } })).toBe("2026-08-19");
    expect(dateStart({ date: null })).toBeNull();
  });

  it("distingue una fecha con hora de una sin ella", () => {
    expect(dateStartInstant({ date: { start: "2026-08-19T21:00:00.000-05:00" } })).toBe(
      "2026-08-19T21:00:00.000-05:00",
    );
    expect(dateStartInstant({ date: { start: "2026-08-19" } })).toBeNull();
  });
});

describe("createdTime", () => {
  it("devuelve la marca de creación", () => {
    expect(createdTime({ created_time: "2026-02-16T14:57:04.000Z" })).toBe("2026-02-16T14:57:04.000Z");
    expect(createdTime(null)).toBeNull();
  });
});

describe("firstFileUrl", () => {
  it("acepta tanto un archivo subido como uno externo", () => {
    expect(firstFileUrl({ files: [{ file: { url: "https://s3/a.mp4" } }] })).toBe("https://s3/a.mp4");
    expect(firstFileUrl({ files: [{ external: { url: "https://drive/b" } }] })).toBe("https://drive/b");
    expect(firstFileUrl({ files: [] })).toBeNull();
  });
});

describe("knownOnly", () => {
  it("separa lo conocido de lo que habría que añadir", () => {
    expect(knownOnly(["Trabajo", "Nuevo"], ["Trabajo", "Ocio"])).toEqual({
      kept: ["Trabajo"],
      dropped: ["Nuevo"],
    });
  });
});
