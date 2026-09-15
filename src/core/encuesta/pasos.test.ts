import { describe, expect, it } from "vitest";

import {
  contestadas,
  estaContestado,
  indiceDe,
  pasoAnterior,
  pasoPorId,
  primeraSinContestar,
  respuestasVacias,
  resumen,
  siguientePaso,
  textoDeRespuesta,
  type Paso,
} from "./pasos";

const PASOS: Paso[] = [
  {
    id: "nota",
    tipo: "escala",
    pregunta: "¿Qué tal?",
    opciones: [
      { valor: 0, etiqueta: "Fatal" },
      { valor: 1, etiqueta: "Regular" },
      { valor: 2, etiqueta: "Bien" },
    ],
  },
  { id: "hora", tipo: "hora", pregunta: "¿A qué hora?", atajos: ["22:00", "23:00"] },
  {
    id: "cosas",
    tipo: "chips",
    pregunta: "¿Qué hiciste?",
    multiple: true,
    opciones: ["Leer", "Ejercicio"],
    ninguno: "Nada",
  },
  { id: "sitio", tipo: "chips", pregunta: "¿Dónde?", multiple: false, opciones: ["Casa", "Fuera"] },
  { id: "nota_libre", tipo: "texto", pregunta: "¿Algo más?" },
];

describe("qué cuenta como contestado", () => {
  it("una lista vacía y una cadena de espacios no lo son", () => {
    expect(estaContestado(PASOS[2], { cosas: [] })).toBe(false);
    expect(estaContestado(PASOS[4], { nota_libre: "   " })).toBe(false);
    expect(estaContestado(PASOS[4], { nota_libre: "algo" })).toBe(true);
  });

  it("un cero sí: en una escala es una respuesta, y de las más informativas", () => {
    expect(estaContestado(PASOS[0], { nota: 0 })).toBe(true);
  });

  it("lo que falta del diccionario no está contestado", () => {
    expect(estaContestado(PASOS[0], {})).toBe(false);
    expect(estaContestado(PASOS[0], { nota: null })).toBe(false);
  });

  it("cuenta las contestadas", () => {
    expect(contestadas(PASOS, {})).toBe(0);
    expect(contestadas(PASOS, { nota: 2, cosas: ["Leer"], nota_libre: " " })).toBe(2);
  });
});

describe("por dónde se empieza", () => {
  it("por la primera cuando no hay nada", () => {
    expect(primeraSinContestar(PASOS, {})).toBe("nota");
  });

  it("por la primera sin contestar, para no repetir lo ya escrito", () => {
    expect(primeraSinContestar(PASOS, { nota: 1 })).toBe("hora");
    expect(primeraSinContestar(PASOS, { nota: 1, hora: "23:00" })).toBe("cosas");
  });

  it("vuelve a la primera con todo contestado, que es reabrirla para cambiar algo", () => {
    const todas = { nota: 1, hora: "23:00", cosas: ["Leer"], sitio: "Casa", nota_libre: "x" };
    expect(primeraSinContestar(PASOS, todas)).toBe("nota");
  });
});

describe("moverse entre preguntas", () => {
  it("la última no tiene siguiente y la primera no tiene anterior", () => {
    expect(siguientePaso(PASOS, "nota_libre")).toBeNull();
    expect(pasoAnterior(PASOS, "nota")).toBeNull();
  });

  it("ida y vuelta dan el mismo sitio", () => {
    for (const paso of PASOS) {
      const siguiente = siguientePaso(PASOS, paso.id);
      if (siguiente) expect(pasoAnterior(PASOS, siguiente)).toBe(paso.id);
    }
  });

  it("indiceDe sigue el orden de la lista", () => {
    expect(indiceDe(PASOS, "cosas")).toBe(2);
  });

  it("pasoPorId lanza con un identificador que no existe, en vez de pintar otra pregunta", () => {
    expect(() => pasoPorId(PASOS, "inventado")).toThrow();
  });
});

describe("respuestas vacías", () => {
  it("cada tipo arranca con lo suyo: lista para varias, null para una nota", () => {
    expect(respuestasVacias(PASOS)).toEqual({
      nota: null,
      hora: "",
      cosas: [],
      sitio: "",
      nota_libre: "",
    });
  });
});

describe("cómo se lee una respuesta", () => {
  it("la nota sale por su palabra, no por su número", () => {
    expect(textoDeRespuesta(PASOS[0], { nota: 2 })).toBe("Bien");
  });

  it("una lista se une con comas", () => {
    expect(textoDeRespuesta(PASOS[2], { cosas: ["Leer", "Ejercicio"] })).toBe("Leer, Ejercicio");
  });

  it("las opciones agrupadas salen por su etiqueta y no por su código", () => {
    const paso: Paso = {
      id: "errores",
      tipo: "chips",
      pregunta: "¿Errores?",
      multiple: true,
      grupos: [{ titulo: "ENTRADA", opciones: [{ valor: "FOMO", etiqueta: "Miedo a quedarme fuera" }] }],
    };
    expect(textoDeRespuesta(paso, { errores: ["FOMO"] })).toBe("Miedo a quedarme fuera");
  });

  it("sin contestar devuelve null, no una cadena vacía que parezca una respuesta", () => {
    expect(textoDeRespuesta(PASOS[0], {})).toBeNull();
  });
});

describe("el resumen del final", () => {
  it("no enseña lo que no se contestó: saltar era una opción legítima", () => {
    expect(resumen(PASOS, {}, {})).toEqual([]);
  });

  it("usa la etiqueta corta, no la pregunta entera", () => {
    const lineas = resumen(PASOS, { nota: 2 }, { nota: "Noche" });
    expect(lineas).toEqual([{ etiqueta: "Noche", valor: "Bien" }]);
  });

  it("sin etiqueta corta cae en la pregunta, que es peor pero nunca vacío", () => {
    const lineas = resumen(PASOS, { nota: 2 }, {});
    expect(lineas).toEqual([{ etiqueta: "¿Qué tal?", valor: "Bien" }]);
  });

  it("respeta el orden de las preguntas", () => {
    const lineas = resumen(PASOS, { nota_libre: "b", nota: 0 }, { nota: "N", nota_libre: "L" });
    expect(lineas.map((l) => l.etiqueta)).toEqual(["N", "L"]);
  });
});
