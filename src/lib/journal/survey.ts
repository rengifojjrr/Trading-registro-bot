import { EMOTION_OPTIONS } from "./options";
import { MISTAKE_META, type MistakeCode } from "./mistakes";

/**
 * Las cinco preguntas que se hacen al cerrar una operación, de una en una.
 *
 * El diario completo existe desde el principio y casi nunca se rellenaba. No
 * porque falten ganas: es un formulario de dieciséis campos que aparece
 * cuando ya has cerrado y te vas, y ver dieciséis huecos vacíos a la vez es
 * justo lo que hace cerrarlo. Así que esto no añade datos nuevos --escribe en
 * las mismas columnas de siempre-- sino una forma de contestarlo que no
 * intimide: una pregunta en pantalla, respuestas que se eligen tocando, y
 * salir cuando quieras sin perder lo ya contestado.
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
 *
 * Puro: sin red y sin base de datos, para poder probar el recorrido entero.
 */

export const SURVEY_STEP_IDS = ["plan", "entrada", "animo", "errores", "leccion"] as const;

export type SurveyStepId = (typeof SURVEY_STEP_IDS)[number];

export const SURVEY_TOTAL = SURVEY_STEP_IDS.length;

export interface EscalaOpcion {
  valor: number;
  etiqueta: string;
  /** Qué cuenta como esta nota, para que el 4 de hoy sea el 4 del mes que viene. */
  detalle: string;
}

interface PasoBase {
  id: SurveyStepId;
  pregunta: string;
  ayuda: string;
}

export interface PasoEscala extends PasoBase {
  tipo: "escala";
  opciones: EscalaOpcion[];
}

export interface PasoChips extends PasoBase {
  tipo: "chips";
  fuente: "emociones" | "errores";
  /** Qué dice el botón de «no hubo ninguno», que no es lo mismo que no contestar. */
  ninguno: string;
}

export interface PasoTexto extends PasoBase {
  tipo: "texto";
  marcador: string;
  maximo: number;
}

export type SurveyStep = PasoEscala | PasoChips | PasoTexto;

export const SURVEY_STEPS: SurveyStep[] = [
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
    fuente: "emociones",
    pregunta: "¿Cómo estabas mientras tanto?",
    ayuda: "Marca las que te suenen. Puedes elegir varias.",
    ninguno: "Ni fu ni fa",
  },
  {
    id: "errores",
    tipo: "chips",
    fuente: "errores",
    pregunta: "¿Se coló algún error?",
    ayuda: "De la lista de siempre, para que luego se puedan contar.",
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

export interface SurveyAnswers {
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
}

export const RESPUESTAS_VACIAS: SurveyAnswers = {
  plan: null,
  entrada: null,
  animo: [],
  errores: [],
  leccion: "",
};

export function stepById(id: SurveyStepId): SurveyStep {
  const paso = SURVEY_STEPS.find((s) => s.id === id);
  // No puede pasar: los identificadores salen del propio array. Lanzar es
  // preferible a devolver un paso cualquiera, que pintaría la pregunta
  // equivocada y guardaría la respuesta en la columna equivocada.
  if (!paso) throw new Error(`Paso desconocido: ${id}`);
  return paso;
}

export function isAnswered(id: SurveyStepId, answers: SurveyAnswers): boolean {
  switch (id) {
    case "plan":
      return answers.plan !== null;
    case "entrada":
      return answers.entrada !== null;
    case "animo":
      return answers.animo.length > 0;
    case "errores":
      return answers.errores.length > 0;
    case "leccion":
      return answers.leccion.trim() !== "";
  }
}

export function answeredCount(answers: SurveyAnswers): number {
  return SURVEY_STEP_IDS.filter((id) => isAnswered(id, answers)).length;
}

/**
 * Por dónde se empieza.
 *
 * Si ya había algo escrito -- la ficha completa se puede rellenar a mano, y la
 * encuesta se puede dejar a medias -- se abre en la primera pregunta sin
 * contestar en vez de volver a preguntar lo que ya está. Devuelve la primera
 * cuando está todo contestado: reabrirla entonces es para cambiar algo.
 */
export function firstUnanswered(answers: SurveyAnswers): SurveyStepId {
  return SURVEY_STEP_IDS.find((id) => !isAnswered(id, answers)) ?? SURVEY_STEP_IDS[0];
}

export function stepIndex(id: SurveyStepId): number {
  return SURVEY_STEP_IDS.indexOf(id);
}

/** El siguiente, o null si era el último. */
export function nextStep(id: SurveyStepId): SurveyStepId | null {
  return SURVEY_STEP_IDS[stepIndex(id) + 1] ?? null;
}

/** El anterior, o null si era el primero. */
export function previousStep(id: SurveyStepId): SurveyStepId | null {
  const i = stepIndex(id);
  return i > 0 ? SURVEY_STEP_IDS[i - 1] : null;
}

/** La etiqueta de una nota, para poder enseñar el resumen sin repetir las listas. */
export function escalaEtiqueta(id: "plan" | "entrada", valor: number | null): string | null {
  if (valor === null) return null;
  const paso = stepById(id);
  if (paso.tipo !== "escala") return null;
  return paso.opciones.find((o) => o.valor === valor)?.etiqueta ?? null;
}

/**
 * Lo contestado, en frases, para la pantalla final.
 *
 * Enseñarlo al acabar no es decoración: es lo que convierte cinco toques en
 * algo que se ha dicho, y la última oportunidad de corregir un 2 que quería
 * ser un 4. Las preguntas sin contestar no salen -- una lista con tres huecos
 * se lee como una tarea a medio hacer, y saltar era una opción legítima.
 */
export function surveySummary(answers: SurveyAnswers): { etiqueta: string; valor: string }[] {
  const lineas: { etiqueta: string; valor: string }[] = [];

  const plan = escalaEtiqueta("plan", answers.plan);
  if (plan) lineas.push({ etiqueta: "Plan", valor: plan });

  const entrada = escalaEtiqueta("entrada", answers.entrada);
  if (entrada) lineas.push({ etiqueta: "Entrada", valor: entrada });

  if (answers.animo.length > 0) lineas.push({ etiqueta: "Ánimo", valor: answers.animo.join(", ") });
  if (answers.errores.length > 0) {
    // Por su nombre y no «2 errores»: es la última oportunidad de ver que se
    // marcó «salida tardía» queriendo marcar «salida prematura», y una cuenta
    // no deja verlo.
    lineas.push({
      etiqueta: "Errores",
      valor: answers.errores.map((code) => MISTAKE_META[code].label).join(", "),
    });
  }
  if (answers.leccion.trim() !== "") lineas.push({ etiqueta: "Te llevas", valor: answers.leccion.trim() });

  return lineas;
}

/** Las emociones de la lista cerrada, para que la encuesta no tenga su propia copia. */
export const SURVEY_EMOTIONS: readonly string[] = EMOTION_OPTIONS;
