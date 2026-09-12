import { describe, expect, it } from "vitest";

import { MISTAKE_META } from "./mistakes";
import {
  answeredCount,
  escalaEtiqueta,
  firstUnanswered,
  isAnswered,
  nextStep,
  previousStep,
  RESPUESTAS_VACIAS,
  stepById,
  SURVEY_STEP_IDS,
  SURVEY_STEPS,
  SURVEY_TOTAL,
  surveySummary,
  type SurveyAnswers,
} from "./survey";

function respuestas(parcial: Partial<SurveyAnswers> = {}): SurveyAnswers {
  return { ...RESPUESTAS_VACIAS, ...parcial };
}

describe("las preguntas", () => {
  it("hay una por identificador y ninguna de más", () => {
    expect(SURVEY_STEPS.map((p) => p.id)).toEqual([...SURVEY_STEP_IDS]);
    expect(SURVEY_TOTAL).toBe(SURVEY_STEPS.length);
  });

  it("las escalas van del 1 al 5 con una etiqueta distinta cada una", () => {
    for (const paso of SURVEY_STEPS) {
      if (paso.tipo !== "escala") continue;
      expect(paso.opciones.map((o) => o.valor)).toEqual([1, 2, 3, 4, 5]);
      const etiquetas = new Set(paso.opciones.map((o) => o.etiqueta));
      expect(etiquetas.size).toBe(5);
    }
  });

  it("las dos escalas usan palabras distintas, que es el motivo de no compartir una lista", () => {
    const plan = stepById("plan");
    const entrada = stepById("entrada");
    if (plan.tipo !== "escala" || entrada.tipo !== "escala") throw new Error("deberían ser escalas");
    expect(plan.opciones.map((o) => o.etiqueta)).not.toEqual(entrada.opciones.map((o) => o.etiqueta));
  });
});

describe("qué cuenta como contestada", () => {
  it("una nota puesta cuenta y un cero de nota no existe", () => {
    expect(isAnswered("plan", respuestas({ plan: 1 }))).toBe(true);
    expect(isAnswered("plan", respuestas())).toBe(false);
  });

  it("una lista vacía no es una respuesta", () => {
    expect(isAnswered("animo", respuestas({ animo: [] }))).toBe(false);
    expect(isAnswered("animo", respuestas({ animo: ["Calma"] }))).toBe(true);
    expect(isAnswered("errores", respuestas({ errores: ["FOMO"] }))).toBe(true);
  });

  it("una lección de espacios no es una lección", () => {
    expect(isAnswered("leccion", respuestas({ leccion: "   " }))).toBe(false);
    expect(isAnswered("leccion", respuestas({ leccion: "no perseguir la vela" }))).toBe(true);
  });

  it("cuenta las contestadas", () => {
    expect(answeredCount(respuestas())).toBe(0);
    expect(answeredCount(respuestas({ plan: 4, entrada: 2, leccion: "algo" }))).toBe(3);
  });
});

describe("por dónde se empieza", () => {
  it("por la primera cuando no hay nada", () => {
    expect(firstUnanswered(respuestas())).toBe("plan");
  });

  it("por la primera sin contestar, para no repetir lo ya escrito a mano", () => {
    expect(firstUnanswered(respuestas({ plan: 3 }))).toBe("entrada");
    expect(firstUnanswered(respuestas({ plan: 3, entrada: 5, animo: ["Miedo"] }))).toBe("errores");
  });

  it("se salta los huecos: si contestaste la última y nada más, empieza por la primera", () => {
    expect(firstUnanswered(respuestas({ leccion: "algo" }))).toBe("plan");
  });

  it("vuelve a la primera cuando está todo contestado, que es reabrirla para cambiar algo", () => {
    const todas = respuestas({
      plan: 5,
      entrada: 5,
      animo: ["Calma"],
      errores: ["FOMO"],
      leccion: "ok",
    });
    expect(firstUnanswered(todas)).toBe("plan");
  });
});

describe("moverse entre preguntas", () => {
  it("la última no tiene siguiente y la primera no tiene anterior", () => {
    expect(nextStep("leccion")).toBeNull();
    expect(previousStep("plan")).toBeNull();
  });

  it("ida y vuelta dan el mismo sitio", () => {
    for (const id of SURVEY_STEP_IDS) {
      const siguiente = nextStep(id);
      if (siguiente) expect(previousStep(siguiente)).toBe(id);
    }
  });

  it("stepById lanza con un identificador que no existe, en vez de pintar otra pregunta", () => {
    // @ts-expect-error -- probar justo el caso que el tipo impide
    expect(() => stepById("inventado")).toThrow();
  });
});

describe("el resumen del final", () => {
  it("no enseña lo que no se contestó: saltar era una opción legítima", () => {
    expect(surveySummary(respuestas())).toEqual([]);
    expect(surveySummary(respuestas({ plan: 4 }))).toEqual([{ etiqueta: "Plan", valor: "Casi todo" }]);
  });

  it("traduce la nota a su palabra, que es lo que significa", () => {
    expect(escalaEtiqueta("plan", 5)).toBe("Entero");
    expect(escalaEtiqueta("entrada", 1)).toBe("Mala");
    expect(escalaEtiqueta("plan", null)).toBeNull();
  });

  it("recorta los espacios de la lección", () => {
    const lineas = surveySummary(respuestas({ leccion: "  esperar el cierre  " }));
    expect(lineas).toEqual([{ etiqueta: "Te llevas", valor: "esperar el cierre" }]);
  });

  it("los errores salen por su nombre, no como una cuenta: es la última ocasión de ver un mal clic", () => {
    const lineas = surveySummary(respuestas({ errores: ["FOMO", "LATE_ENTRY"] }));
    expect(lineas).toEqual([
      { etiqueta: "Errores", valor: `${MISTAKE_META.FOMO.label}, ${MISTAKE_META.LATE_ENTRY.label}` },
    ]);
  });
});
