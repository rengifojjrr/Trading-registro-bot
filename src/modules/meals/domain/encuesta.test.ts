import { describe, expect, it } from "vitest";

import { diaMenos, textoDeRespuesta, type PasoFecha } from "@/core/encuesta/pasos";

import { ETIQUETAS_COMIDA, pasosDeComida, puedeNacer } from "./encuesta";

const HOY = "2026-03-15";

function pasoDia(): PasoFecha {
  return pasosDeComida(HOY).find((p): p is PasoFecha => p.id === "meal_date")!;
}

describe("el orden de las preguntas", () => {
  /**
   * El tipo va primero pero viene contestado --del hueco de la rejilla o de
   * almuerzo por defecto--, así que la encuesta abre en el nombre, que es la
   * primera que hay que pensar y la única que la base exige.
   */
  it("abre en lo que hay que pensar y no en lo que ya viene puesto", () => {
    expect(pasosDeComida(HOY).map((p) => p.id)).toEqual([
      "meal_type",
      "name",
      "ingredients",
      "cook",
      "notes",
      "meal_date",
    ]);
  });

  it("todas las respuestas tienen nombre corto para el resumen", () => {
    for (const paso of pasosDeComida(HOY)) {
      expect(ETIQUETAS_COMIDA[paso.id]).toBeTruthy();
    }
  });

  it("los ingredientes son un bloque y no una pregunta por ingrediente", () => {
    const paso = pasosDeComida(HOY).find((p) => p.id === "ingredients");
    expect(paso).toMatchObject({ tipo: "texto" });
  });
});

describe("el día de un planificador", () => {
  it("va hacia delante además de hacia atrás: planificar es escribir el martes que viene", () => {
    const atajos = pasoDia().atajos ?? [];
    expect(atajos.map((a) => a.etiqueta)).toEqual(["Ayer", "Hoy", "Mañana", "Pasado"]);
  });

  it("los negativos caen después de hoy, no antes", () => {
    expect(diaMenos(HOY, -1)).toBe("2026-03-16");
    expect(diaMenos(HOY, -2)).toBe("2026-03-17");
  });

  it("y se leen por su nombre en el resumen", () => {
    const paso = pasoDia();
    expect(textoDeRespuesta(paso, { meal_date: "2026-03-16" })).toBe("Mañana");
    expect(textoDeRespuesta(paso, { meal_date: "2026-03-14" })).toBe("Ayer");
  });
});

describe("cuándo puede nacer una comida", () => {
  /**
   * `name` y `meal_type` son `not null`, pero el tipo viene puesto siempre, así
   * que en la práctica lo que crea la comida es el nombre. Y no es una pega
   * técnica: una comida sin nombre no se puede enseñar en la rejilla de la
   * semana, que es para lo que existe el módulo.
   */
  it("hace falta saber qué se come", () => {
    expect(puedeNacer({ name: "Lentejas" })).toBe(true);
    expect(puedeNacer({ name: "" })).toBe(false);
    expect(puedeNacer({})).toBe(false);
  });

  it("un nombre de sólo espacios no es un nombre", () => {
    expect(puedeNacer({ name: "   " })).toBe(false);
  });
});
