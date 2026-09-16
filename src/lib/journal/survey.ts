import type { Paso, Respuestas } from "@/core/encuesta/pasos";

import { MISTAKE_CODES, MISTAKE_META, type MistakeCode } from "./mistakes";
import { EMOTION_OPTIONS } from "./options";

/**
 * Las seis preguntas que se hacen al cerrar una operación.
 *
 * El recorrido -- cuál está contestada, por dónde se sigue, qué resumen se
 * enseña -- vive en `core/encuesta`, que es el mismo motor que usan el resto
 * de módulos. Aquí sólo están las preguntas del diario de trading.
 *
 * El diario completo existe desde la primera fase y casi nunca se rellenaba.
 * No porque falten ganas: es un formulario de dieciséis campos que aparece
 * cuando ya has cerrado y te vas, y ver dieciséis huecos vacíos a la vez es
 * justo lo que hace cerrarlo. Así que esto no añade datos nuevos --escribe en
 * las mismas columnas de siempre-- sino una forma de contestarlo que no
 * intimide.
 *
 * Qué se pregunta y qué no:
 *
 * - **Sólo lo que la aplicación no puede saber.** El precio, el tamaño, la
 *   duración y el resultado ya están calculados a partir de las ejecuciones
 *   reales. Preguntarlos sería pedir que escribas a mano, peor, algo que ya
 *   está bien.
 * - **Vocabularios cerrados** para el ánimo y los errores, que son los mismos
 *   de `options.ts` y `mistakes.ts`. Texto libre no se puede contar, y la
 *   pregunta que de verdad cambia cómo operas -- «¿qué error me cuesta más
 *   dinero?» -- sólo se responde contando.
 * - **Una sola pregunta abierta**, la última, porque es la que hace que el
 *   diario se pueda releer dentro de seis meses.
 *
 * Las etiquetas del 1 al 5 son distintas en cada pregunta a propósito: el
 * número que se guarda es el mismo, pero un 5 de «seguir el plan» y un 5 de
 * «calidad de la entrada» no significan lo mismo, y una escala genérica
 * («Muy bien») hace que cada uno acabe puntuando con su vara.
 */

export const SURVEY_STEP_IDS = ["setup", "plan", "entrada", "animo", "errores", "leccion"] as const;

export type SurveyStepId = (typeof SURVEY_STEP_IDS)[number];

const GRUPOS_DE_ERROR = ["ENTRADA", "GESTIÓN", "SALIDA", "DISCIPLINA"] as const;

/**
 * La pregunta que sólo existe cuando dejaste un plan escrito antes de entrar.
 *
 * Va la primera de todas, incluso antes del setup, porque de su respuesta
 * depende qué significan las demás: «¿seguiste tu plan?» es otra pregunta
 * cuando hay un plan escrito delante que cuando el plan es el que recuerdas
 * ahora. Y es la única que se puede contestar sin pensar, lo que la convierte
 * en una buena puerta de entrada.
 *
 * No se deduce del producto y la hora a propósito: puedes planear un largo y
 * acabar entrando corto, o entrar dos veces. Contestarlo tú es lo único que
 * hace que la cuenta de «cuántos planes cumplo» signifique algo.
 */
export const PASO_DEL_PLAN: Paso = {
  id: "plan_seguido",
  tipo: "chips",
  multiple: false,
  pregunta: "¿Es ésta la que planificaste?",
  ayuda: "El plan que dejaste escrito antes de entrar.",
  opciones: [
    { valor: "SI", etiqueta: "Sí, es ésta", detalle: "La abrí siguiendo ese plan" },
    { valor: "NO", etiqueta: "No, es otra", detalle: "El plan sigue esperando su momento" },
  ],
};

export const SURVEY_STEPS: Paso[] = [
  {
    id: "setup",
    tipo: "chips",
    multiple: false,
    // Primero y no al final porque es lo primero que pasó: la entrada se
    // decide mirando el setup, y preguntarlo después de «¿cómo estabas?»
    // obliga a rebobinar.
    pregunta: "¿Qué tal era el setup?",
    ayuda: "La calidad de lo que viste antes de entrar, no la de la entrada ni la del resultado.",
    opciones: [
      { valor: "A+", etiqueta: "A+", detalle: "De manual: todo lo que pides, alineado" },
      { valor: "A", etiqueta: "A", detalle: "Bueno, con algún pero" },
      { valor: "B", etiqueta: "B", detalle: "Aceptable, algo forzado" },
      { valor: "C", etiqueta: "C", detalle: "Flojo: no era de los que busco" },
    ],
    ninguno: "No lo tengo claro",
  },
  {
    id: "plan",
    tipo: "escala",
    pregunta: "¿Seguiste tu plan?",
    // Separarlo del resultado es la mitad del valor de todo esto: una decisión
    // buena puede perder dinero y una mala puede ganarlo, y confundirlas es la
    // forma más rápida de aprender exactamente lo contrario de lo que pasó.
    ayuda: "Da igual cómo acabó. Se puede seguir el plan y perder dinero.",
    opciones: [
      { valor: 1, etiqueta: "Nada", detalle: "Improvisé de principio a fin" },
      { valor: 2, etiqueta: "Poco", detalle: "Me salté cosas importantes" },
      { valor: 3, etiqueta: "A medias", detalle: "Algo seguí, algo no" },
      { valor: 4, etiqueta: "Casi todo", detalle: "Un desvío pequeño" },
      { valor: 5, etiqueta: "Entero", detalle: "Hice exactamente lo planeado" },
    ],
  },
  {
    id: "entrada",
    tipo: "escala",
    pregunta: "¿Qué tal estuvo la entrada?",
    ayuda: "El momento y el precio a los que entraste, no lo que vino después.",
    opciones: [
      { valor: 1, etiqueta: "Mala", detalle: "No debí entrar ahí" },
      { valor: 2, etiqueta: "Floja", detalle: "Llegué tarde o pronto" },
      { valor: 3, etiqueta: "Correcta", detalle: "Ni bien ni mal" },
      { valor: 4, etiqueta: "Buena", detalle: "Cerca de donde quería" },
      { valor: 5, etiqueta: "Redonda", detalle: "Justo donde la esperaba" },
    ],
  },
  {
    id: "animo",
    tipo: "chips",
    multiple: true,
    pregunta: "¿Cómo estabas mientras tanto?",
    ayuda: "Marca las que te suenen. Puedes elegir varias.",
    opciones: EMOTION_OPTIONS,
    ninguno: "Ni fu ni fa",
  },
  {
    id: "errores",
    tipo: "chips",
    multiple: true,
    pregunta: "¿Se coló algún error?",
    ayuda: "De la lista de siempre, para que luego se puedan contar.",
    grupos: GRUPOS_DE_ERROR.map((grupo) => ({
      titulo: grupo,
      opciones: MISTAKE_CODES.filter((code) => MISTAKE_META[code].group === grupo).map((code) => ({
        valor: code,
        etiqueta: MISTAKE_META[code].label,
        // La definición a mano, para que el mismo fallo reciba la misma
        // etiqueta el mes que viene y las cuentas signifiquen algo.
        detalle: MISTAKE_META[code].description,
      })),
    })),
    ninguno: "Ninguno, limpia",
  },
  {
    id: "leccion",
    tipo: "texto",
    pregunta: "¿Qué te llevas de ésta?",
    // El ejemplo hace más que la instrucción: «sé concreto» no cambia lo que
    // se escribe y una frase concreta al lado sí.
    ayuda: "Una frase basta. Dentro de seis meses «me salió bien» no se puede releer; «entré porque venía de rechazar el máximo de ayer» sí.",
    marcador: "Lo que no quiero olvidar de esta operación…",
    maximo: 2000,
  },
];

export const SURVEY_TOTAL = SURVEY_STEPS.length;

/**
 * Las preguntas de esta operación concreta.
 *
 * Son las de siempre, y una más delante cuando había un plan esperando. Se
 * construye por operación y no es una constante porque la lista **depende de
 * lo que pasó**: enseñar «¿es ésta la que planificaste?» sin ningún plan
 * escrito sería preguntar por algo que no existe.
 */
export function pasosDeLaEncuesta(hayPlan: boolean): Paso[] {
  return hayPlan ? [PASO_DEL_PLAN, ...SURVEY_STEPS] : SURVEY_STEPS;
}

/** Cómo se llama cada respuesta en el resumen del final, en una palabra. */
export const SURVEY_LABELS: Record<string, string> = {
  plan_seguido: "Planificada",
  setup: "Setup",
  plan: "Plan",
  entrada: "Entrada",
  animo: "Ánimo",
  errores: "Errores",
  leccion: "Te llevas",
};

export interface SurveyAnswers {
  /**
   * Si esta operación es la que planificaste: «SI», «NO» o sin contestar.
   *
   * Sólo se pregunta cuando había un plan esperando, y es lo que lo une a la
   * operación. Es texto y no un booleano porque el motor trabaja con el mismo
   * diccionario para todas las preguntas, y «sin contestar» tiene que poder
   * distinguirse de «no».
   */
  plan_seguido: string;
  /** La nota del setup. No es columna del diario sino etiqueta («Setup: A+»). */
  setup: string;
  plan: number | null;
  entrada: number | null;
  animo: string[];
  errores: MistakeCode[];
  leccion: string;
}

/**
 * La operación por la que se pregunta, con lo que ya estuviera contestado.
 *
 * Vive en el módulo puro y no junto a la consulta que la lee para que el
 * componente de la encuesta -- que es de cliente -- pueda nombrarla sin
 * importar nada del servidor.
 */
export interface SurveyTrade {
  id: string;
  productId: string;
  direction: "LONG" | "SHORT";
  closedAt: string;
  netPnl: string | null;
  answers: SurveyAnswers;
  /**
   * El plan que estaba esperando cuando se cerró, si lo había.
   *
   * Sólo el identificador y una línea de resumen: la encuesta lo enseña para
   * que la pregunta no sea un test de memoria, y no necesita nada más.
   */
  plan: { id: string; resumen: string } | null;
}

export const RESPUESTAS_VACIAS: SurveyAnswers = {
  plan_seguido: "",
  setup: "",
  plan: null,
  entrada: null,
  animo: [],
  errores: [],
  leccion: "",
};

/**
 * Las dos caras de lo mismo.
 *
 * El motor trabaja con un diccionario porque no puede saber qué campos tiene
 * una operación; el resto del módulo -- la consulta que las lee, la acción que
 * las guarda -- trabaja con un tipo cerrado porque sí puede, y perder eso
 * convertiría cada error de nombre en un fallo que sólo se ve en producción.
 * Estas dos funciones son la frontera entre las dos cosas.
 */
export function aRespuestas(answers: SurveyAnswers): Respuestas {
  return {
    plan_seguido: answers.plan_seguido,
    setup: answers.setup,
    plan: answers.plan,
    entrada: answers.entrada,
    animo: answers.animo,
    errores: answers.errores,
    leccion: answers.leccion,
  };
}

export function deRespuestas(respuestas: Respuestas): SurveyAnswers {
  const lista = (valor: unknown): string[] => (Array.isArray(valor) ? valor.map(String) : []);
  const nota = (valor: unknown): number | null => (typeof valor === "number" ? valor : null);

  const planSeguido = typeof respuestas.plan_seguido === "string" ? respuestas.plan_seguido : "";

  return {
    plan_seguido: planSeguido === "SI" || planSeguido === "NO" ? planSeguido : "",
    setup: typeof respuestas.setup === "string" ? respuestas.setup : "",
    plan: nota(respuestas.plan),
    entrada: nota(respuestas.entrada),
    animo: lista(respuestas.animo),
    // Un código que ya no exista en la lista se descarta en vez de guardarse:
    // la restricción de la tabla lo rechazaría y se perdería la respuesta
    // entera, no sólo ese error.
    errores: lista(respuestas.errores).filter((c): c is MistakeCode =>
      (MISTAKE_CODES as readonly string[]).includes(c),
    ),
    leccion: typeof respuestas.leccion === "string" ? respuestas.leccion : "",
  };
}
