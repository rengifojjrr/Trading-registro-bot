import { describe, expect, it } from "vitest";

import { opcionesDe, primeraSinContestar, resumen } from "@/core/encuesta/pasos";

import { MISTAKE_META } from "./mistakes";
import { SETUP_GRADES } from "./setup-grade";
import {
  aRespuestas,
  deRespuestas,
  RESPUESTAS_VACIAS,
  SURVEY_LABELS,
  SURVEY_STEP_IDS,
  SURVEY_STEPS,
  SURVEY_TOTAL,
  type SurveyAnswers,
} from "./survey";

/**
 * Lo que se prueba aquí son **las preguntas del diario**, no el recorrido:
 * cuál está contestada, por dónde se sigue y cómo se resume son del motor
 * común y se prueban en `core/encuesta/pasos.test.ts`. Duplicar allí y aquí
 * la misma prueba sólo consigue que un día discrepen.
 */

function respuestas(parcial: Partial<SurveyAnswers> = {}): SurveyAnswers {
  return { ...RESPUESTAS_VACIAS, ...parcial };
}

describe("las preguntas", () => {
  it("hay una por identificador y ninguna de más", () => {
    expect(SURVEY_STEPS.map((p) => p.id)).toEqual([...SURVEY_STEP_IDS]);
    expect(SURVEY_TOTAL).toBe(SURVEY_STEPS.length);
  });

  it("todas tienen una etiqueta corta para el resumen", () => {
    for (const paso of SURVEY_STEPS) expect(SURVEY_LABELS[paso.id]).toBeTruthy();
  });

  it("las escalas van del 1 al 5 con una etiqueta distinta cada una", () => {
    for (const paso of SURVEY_STEPS) {
      if (paso.tipo !== "escala") continue;
      expect(paso.opciones.map((o) => o.valor)).toEqual([1, 2, 3, 4, 5]);
      expect(new Set(paso.opciones.map((o) => o.etiqueta)).size).toBe(5);
    }
  });

  it("las dos escalas usan palabras distintas, que es el motivo de no compartir una lista", () => {
    const [plan, entrada] = SURVEY_STEPS.filter((p) => p.tipo === "escala");
    if (plan?.tipo !== "escala" || entrada?.tipo !== "escala") {
      throw new Error("deberían ser dos escalas");
    }
    expect(plan.opciones.map((o) => o.etiqueta)).not.toEqual(entrada.opciones.map((o) => o.etiqueta));
  });

  it("el setup va primero, porque es lo primero que pasó", () => {
    // Detrás de «¿cómo estabas?» obligaría a rebobinar hasta antes de entrar.
    expect(SURVEY_STEPS[0].id).toBe("setup");
  });

  it("cada nota de setup dice qué cuenta como esa nota", () => {
    const setup = SURVEY_STEPS.find((p) => p.id === "setup");
    if (setup?.tipo !== "chips") throw new Error("debería ser fichas");

    const opciones = opcionesDe(setup);
    expect(opciones.map((o) => o.valor)).toEqual([...SETUP_GRADES]);
    // Sin la explicación, «B» significa una cosa en marzo y otra en octubre, y
    // entonces contar cuánto rinde cada nota no dice nada.
    for (const opcion of opciones) expect(opcion.detalle).toBeTruthy();
    expect(setup.multiple).toBe(false);
  });

  it("los errores salen agrupados y con su definición, para que el mismo fallo reciba la misma etiqueta", () => {
    const errores = SURVEY_STEPS.find((p) => p.id === "errores");
    if (errores?.tipo !== "chips" || !errores.grupos) throw new Error("debería ser fichas agrupadas");

    const todas = errores.grupos.flatMap((g) => g.opciones);
    expect(todas.length).toBe(Object.keys(MISTAKE_META).length);
    for (const opcion of todas) expect(opcion.detalle).toBeTruthy();
  });
});

describe("la frontera entre el tipo cerrado y el diccionario del motor", () => {
  it("ida y vuelta no pierde nada", () => {
    const originales = respuestas({
      setup: "A+",
      plan: 4,
      entrada: 2,
      animo: ["Calma", "FOMO"],
      errores: ["LATE_ENTRY"],
      leccion: "esperar el cierre",
    });
    expect(deRespuestas(aRespuestas(originales))).toEqual(originales);
  });

  it("un código de error que ya no existe se descarta en vez de romper el guardado entero", () => {
    const vueltas = deRespuestas({ errores: ["LATE_ENTRY", "ERROR_QUE_YA_NO_EXISTE"] });
    expect(vueltas.errores).toEqual(["LATE_ENTRY"]);
  });

  it("un diccionario vacío da respuestas vacías y no un montón de undefined", () => {
    expect(deRespuestas({})).toEqual(RESPUESTAS_VACIAS);
  });
});

describe("cómo se comportan estas preguntas en el motor", () => {
  it("con las tres primeras contestadas, se sigue por la cuarta", () => {
    const parciales = aRespuestas(respuestas({ setup: "A", plan: 4, entrada: 2 }));
    expect(primeraSinContestar(SURVEY_STEPS, parciales)).toBe("animo");
  });

  it("una operación que ya tenía nota de setup no la vuelve a preguntar", () => {
    // La nota vive como etiqueta y se puede haber puesto desde la ficha o
    // haber llegado de Notion; volver a preguntarla sería pedir dos veces lo
    // mismo y arriesgarse a que la segunda respuesta borre la primera.
    expect(primeraSinContestar(SURVEY_STEPS, aRespuestas(respuestas({ setup: "B" })))).toBe("plan");
  });

  it("el resumen traduce la nota a su palabra y el error a su nombre", () => {
    const lineas = resumen(
      SURVEY_STEPS,
      aRespuestas(respuestas({ setup: "A+", plan: 4, errores: ["FOMO"] })),
      SURVEY_LABELS,
    );
    expect(lineas).toEqual([
      { etiqueta: "Setup", valor: "A+" },
      { etiqueta: "Plan", valor: "Casi todo" },
      { etiqueta: "Errores", valor: MISTAKE_META.FOMO.label },
    ]);
  });

  it("no enseña lo que no se contestó: saltar era una opción legítima", () => {
    expect(resumen(SURVEY_STEPS, aRespuestas(RESPUESTAS_VACIAS), SURVEY_LABELS)).toEqual([]);
  });
});
