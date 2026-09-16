import { describe, expect, it } from "vitest";

import { primeraSinContestar, resumen } from "@/core/encuesta/pasos";

import {
  aRespuestas,
  deRespuestas,
  nivelesAlReves,
  PLAN_LABELS,
  PLAN_STEP_IDS,
  PLAN_STEPS,
  PLAN_TOTAL,
  PLAN_VACIO,
  planVacio,
  ratioDelPlan,
  resumenCorto,
  type PlanAnswers,
} from "./plan";

function plan(parcial: Partial<PlanAnswers> = {}): PlanAnswers {
  return { ...PLAN_VACIO, ...parcial };
}

/** Un largo de manual: entrada 100, stop 90, objetivo 130. */
const LARGO = plan({ direccion: "LONG", entrada: 100, stop: 90, objetivo: 130 });
/** Su espejo exacto. */
const CORTO = plan({ direccion: "SHORT", entrada: 100, stop: 110, objetivo: 70 });

describe("las preguntas", () => {
  it("hay una por identificador y ninguna de más", () => {
    expect(PLAN_STEPS.map((p) => p.id)).toEqual([...PLAN_STEP_IDS]);
    expect(PLAN_TOTAL).toBe(PLAN_STEPS.length);
  });

  it("todas tienen etiqueta corta para el resumen", () => {
    for (const paso of PLAN_STEPS) expect(PLAN_LABELS[paso.id]).toBeTruthy();
  });

  it("la dirección va primero, que es de la que cuelgan las demás", () => {
    // El stop de un largo está debajo y el de un corto encima: preguntarlos sin
    // saber qué buscas es preguntarlos a ciegas.
    expect(PLAN_STEPS[0].id).toBe("direccion");
  });

  it("los precios piden teclado numérico y llevan el símbolo puesto", () => {
    for (const id of ["entrada", "stop", "objetivo", "riesgo"]) {
      const paso = PLAN_STEPS.find((p) => p.id === id);
      if (paso?.tipo !== "numero") throw new Error(`${id} debería ser un número`);
      expect(paso.prefijo).toBe("$");
    }
  });
});

describe("la frontera con el diccionario del motor", () => {
  it("ida y vuelta no pierde nada", () => {
    const original = plan({
      direccion: "SHORT",
      idea: "rechazo del máximo de ayer",
      entrada: 68450,
      stop: 68800,
      objetivo: 67400,
      riesgo: 50,
      animo: ["Calma"],
      foto: "u/planes/1.png",
    });
    expect(deRespuestas(aRespuestas(original))).toEqual(original);
  });

  it("una dirección que no existe se descarta en vez de guardarse", () => {
    expect(deRespuestas({ direccion: "ARRIBA" }).direccion).toBe("");
  });

  it("un diccionario vacío da un plan vacío y no un montón de undefined", () => {
    expect(deRespuestas({})).toEqual(PLAN_VACIO);
  });
});

describe("cuánto ganas por lo que arriesgas", () => {
  it("un largo: 30 de premio contra 10 de riesgo son 3 a 1", () => {
    expect(ratioDelPlan(LARGO)).toBe(3);
  });

  it("y un corto da exactamente lo mismo, que es el espejo", () => {
    expect(ratioDelPlan(CORTO)).toBe(3);
  });

  it("sin los tres precios no hay ratio que dar", () => {
    expect(ratioDelPlan(plan({ direccion: "LONG", entrada: 100, stop: 90 }))).toBeNull();
    expect(ratioDelPlan(plan({ entrada: 100, stop: 90, objetivo: 130 }))).toBeNull();
  });

  it("con los niveles al revés devuelve null, no un número malo", () => {
    // Un stop por encima de la entrada en un largo no es un ratio pobre: es un
    // error de tecleo, y devolver un número lo escondería.
    const alReves = plan({ direccion: "LONG", entrada: 100, stop: 110, objetivo: 130 });
    expect(ratioDelPlan(alReves)).toBeNull();
  });
});

describe("avisar de un nivel del lado que no toca", () => {
  it("un largo con el stop por encima de la entrada", () => {
    expect(nivelesAlReves(plan({ direccion: "LONG", entrada: 100, stop: 110 }))).toBe(true);
  });

  it("un corto con el objetivo por encima de la entrada", () => {
    expect(nivelesAlReves(plan({ direccion: "SHORT", entrada: 100, objetivo: 130 }))).toBe(true);
  });

  it("los dos planes de manual no avisan de nada", () => {
    expect(nivelesAlReves(LARGO)).toBe(false);
    expect(nivelesAlReves(CORTO)).toBe(false);
  });

  it("sin dirección o sin entrada no hay nada que comparar", () => {
    expect(nivelesAlReves(plan({ stop: 110, objetivo: 130 }))).toBe(false);
  });
});

describe("cuándo un plan está vacío", () => {
  it("recién abierto lo está", () => {
    expect(planVacio(PLAN_VACIO)).toBe(true);
  });

  it("con sólo la dirección ya no", () => {
    // Un plan a medias es infinitamente mejor que ningún plan, así que basta
    // una respuesta para que se quede esperando.
    expect(planVacio(plan({ direccion: "LONG" }))).toBe(false);
  });

  it("y una lección en blanco no cuenta como contestar", () => {
    expect(planVacio(plan({ idea: "   " }))).toBe(true);
  });
});

describe("el plan en una línea", () => {
  it("dice la dirección y los tres precios", () => {
    expect(resumenCorto(LARGO)).toBe("Largo · entrada 100 · stop 90 · objetivo 130");
  });

  it("y se salta lo que no esté, en vez de escribir huecos", () => {
    expect(resumenCorto(plan({ direccion: "SHORT", stop: 110 }))).toBe("Corto · stop 110");
  });

  it("un plan vacío no da una línea de separadores sueltos", () => {
    expect(resumenCorto(PLAN_VACIO)).toBe("");
  });
});

describe("cómo se comportan estas preguntas en el motor", () => {
  it("con la dirección puesta, se sigue por la idea", () => {
    expect(primeraSinContestar(PLAN_STEPS, aRespuestas(plan({ direccion: "LONG" })))).toBe("idea");
  });

  it("el resumen traduce la dirección a su palabra y los precios con separador", () => {
    const lineas = resumen(PLAN_STEPS, aRespuestas(plan({ direccion: "LONG", entrada: 68450 })), PLAN_LABELS);
    expect(lineas).toEqual([
      { etiqueta: "Dirección", valor: "Largo" },
      { etiqueta: "Entrada", valor: "$68.450" },
    ]);
  });

  it("no enseña lo que no se contestó: saltar era una opción legítima", () => {
    expect(resumen(PLAN_STEPS, aRespuestas(PLAN_VACIO), PLAN_LABELS)).toEqual([]);
  });
});
