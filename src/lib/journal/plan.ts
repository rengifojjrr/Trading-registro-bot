import type { Paso, Respuestas } from "@/core/encuesta/pasos";
import { formatNumber } from "@/lib/format";

import { EMOTION_OPTIONS } from "./options";

/**
 * Lo que pensabas **antes** de entrar.
 *
 * El diario entero se escribe después de cerrar, y eso deja fuera justo la
 * mitad que decide si operas bien: el plan. Preguntarlo al cerrar no sirve,
 * porque para entonces ya sabes cómo acabó y la memoria reescribe el plan para
 * que encaje con el resultado -- «yo tenía el stop ahí» es la frase más
 * sincera y menos fiable del trading. Un plan sólo significa algo si existe
 * antes de que haya resultado.
 *
 * De ahí la forma que tiene esto:
 *
 * - **Se abre a mano**, con un botón, y no sale solo. La encuesta del cierre
 *   aparece porque acabas de terminar algo y es el momento; ésta se contesta
 *   cuando estás mirando el gráfico decidiendo, y ese momento no lo sabe la
 *   aplicación.
 * - **Queda esperando.** Un plan no caduca al cerrar la ventana: sigue ahí
 *   hasta que lo ejecutes o lo descartes, porque entre planear y entrar pueden
 *   pasar horas.
 * - **Lo une una persona.** Que una operación sea la que planificaste no se
 *   puede deducir del producto y la hora: puedes planear un largo y entrar
 *   corto, o entrar dos veces. Lo contesta la encuesta del cierre.
 * - **Todo es saltable.** Un plan a medias --sólo la dirección y el stop-- es
 *   infinitamente mejor que ningún plan, y exigirlo entero es la forma segura
 *   de que no se rellene nunca.
 */

export const PLAN_STEP_IDS = [
  "direccion",
  "idea",
  "entrada",
  "stop",
  "objetivo",
  "riesgo",
  "animo",
  "foto",
] as const;

export type PlanStepId = (typeof PLAN_STEP_IDS)[number];

export const PLAN_STEPS: Paso[] = [
  {
    id: "direccion",
    tipo: "chips",
    multiple: false,
    // Primero porque es la decisión de la que cuelgan las demás: el stop de un
    // largo está debajo y el de un corto encima, y preguntarlos sin saber qué
    // buscas es preguntarlos a ciegas.
    pregunta: "¿Hacia dónde crees que va?",
    ayuda: "Escribirlo antes es lo que después permite saber si te saliste de tu propio plan.",
    opciones: [
      { valor: "LONG", etiqueta: "Largo", detalle: "Compras esperando que suba" },
      { valor: "SHORT", etiqueta: "Corto", detalle: "Vendes esperando que baje" },
    ],
  },
  {
    id: "idea",
    tipo: "texto",
    pregunta: "¿Qué has visto?",
    // El ejemplo hace más que la instrucción. «Sé concreto» no cambia lo que
    // se escribe; una frase concreta al lado sí.
    ayuda: "La razón, en una frase. «Viene de rechazar el máximo de ayer con volumen» se puede releer dentro de seis meses; «pinta bien» no.",
    marcador: "Por qué entras aquí y ahora…",
    maximo: 2000,
    lineas: 3,
  },
  {
    id: "entrada",
    tipo: "numero",
    pregunta: "¿Dónde piensas entrar?",
    ayuda: "El precio al que quieres que se abra, no el que hay ahora mismo.",
    prefijo: "$",
    marcador: "68450",
  },
  {
    id: "stop",
    tipo: "numero",
    // «Dónde te sales si te equivocas» y no «dónde pones el stop»: lo segundo
    // es un trámite y lo primero es la pregunta de verdad. El precio al que
    // admites que la idea era mala se decide antes de entrar o no se decide.
    pregunta: "¿Dónde te sales si te equivocas?",
    ayuda: "El precio que convierte esta idea en una idea mala. Decidirlo ahora es lo que impide moverlo luego.",
    prefijo: "$",
    marcador: "68100",
  },
  {
    id: "objetivo",
    tipo: "numero",
    pregunta: "¿Dónde cierras si sale bien?",
    ayuda: "Tener un sitio al que llegar es lo que evita cerrar por nervios en el primer susto.",
    prefijo: "$",
    marcador: "69200",
  },
  {
    id: "riesgo",
    tipo: "numero",
    pregunta: "¿Cuánto estás dispuesto a perder?",
    ayuda: "En dinero, si el stop salta. Es el número que decide el tamaño, no al revés.",
    prefijo: "$",
    marcador: "50",
  },
  {
    id: "animo",
    tipo: "chips",
    multiple: true,
    pregunta: "¿Cómo llegas?",
    // Antes y no después: el ánimo con el que se entra explica media operación,
    // y al cerrar ya está teñido por el resultado.
    ayuda: "Marca las que te suenen. Cómo llegas explica media operación, y al cerrar ya no te acuerdas.",
    opciones: EMOTION_OPTIONS,
    ninguno: "Tranquilo, sin más",
  },
  {
    id: "foto",
    tipo: "imagen",
    pregunta: "¿Una foto del gráfico?",
    ayuda: "Lo que estás viendo ahora mismo. Dentro de un mes es lo único que te devuelve a este momento.",
    pista: "El gráfico con tus líneas, tal y como lo ves",
  },
];

export const PLAN_TOTAL = PLAN_STEPS.length;

/** Cómo se llama cada respuesta en el resumen, en una o dos palabras. */
export const PLAN_LABELS: Record<string, string> = {
  direccion: "Dirección",
  idea: "La idea",
  entrada: "Entrada",
  stop: "Stop",
  objetivo: "Objetivo",
  riesgo: "Riesgo",
  animo: "Ánimo",
  foto: "Foto",
};

export interface PlanAnswers {
  direccion: "LONG" | "SHORT" | "";
  idea: string;
  entrada: number | null;
  stop: number | null;
  objetivo: number | null;
  riesgo: number | null;
  animo: string[];
  /** La ruta en el almacén, no la imagen. */
  foto: string;
}

export const PLAN_VACIO: PlanAnswers = {
  direccion: "",
  idea: "",
  entrada: null,
  stop: null,
  objetivo: null,
  riesgo: null,
  animo: [],
  foto: "",
};

/** Un plan guardado, con lo que haga falta para enseñarlo. */
export interface TradePlan {
  id: string;
  createdAt: string;
  answers: PlanAnswers;
  /** Con qué enseñar la foto. Se firma al leerla, porque el bucket es privado. */
  fotoUrl: string | null;
}

export function aRespuestas(answers: PlanAnswers): Respuestas {
  return {
    direccion: answers.direccion,
    idea: answers.idea,
    entrada: answers.entrada,
    stop: answers.stop,
    objetivo: answers.objetivo,
    riesgo: answers.riesgo,
    animo: answers.animo,
    foto: answers.foto,
  };
}

export function deRespuestas(respuestas: Respuestas): PlanAnswers {
  const texto = (v: unknown): string => (typeof v === "string" ? v : "");
  const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const direccion = texto(respuestas.direccion);
  return {
    direccion: direccion === "LONG" || direccion === "SHORT" ? direccion : "",
    idea: texto(respuestas.idea),
    entrada: numero(respuestas.entrada),
    stop: numero(respuestas.stop),
    objetivo: numero(respuestas.objetivo),
    riesgo: numero(respuestas.riesgo),
    animo: Array.isArray(respuestas.animo) ? respuestas.animo.map(String) : [],
    foto: texto(respuestas.foto),
  };
}

/**
 * Cuánto ganas por cada euro que arriesgas, según tu propio plan.
 *
 * Se calcula y se enseña **mientras planificas**, no al revisar: ahí es cuando
 * sirve de algo. Un 0,4 a 1 en la pantalla, antes de entrar, es la única forma
 * de que alguien se replantee el objetivo; contárselo al cerrar es contarle
 * por qué perdió dinero cuando ya lo ha perdido.
 *
 * Null cuando faltan precios o cuando el stop está del lado que no toca -- un
 * stop por encima de la entrada en un largo no es un ratio malo, es un error
 * de tecleo, y devolver un número lo escondería.
 */
export function ratioDelPlan(answers: PlanAnswers): number | null {
  const { direccion, entrada, stop, objetivo } = answers;
  if (!direccion || entrada === null || stop === null || objetivo === null) return null;

  const riesgo = direccion === "LONG" ? entrada - stop : stop - entrada;
  const premio = direccion === "LONG" ? objetivo - entrada : entrada - objetivo;
  if (riesgo <= 0 || premio <= 0) return null;

  return premio / riesgo;
}

/** Si el stop o el objetivo están del lado que no corresponde a la dirección. */
export function nivelesAlReves(answers: PlanAnswers): boolean {
  const { direccion, entrada, stop, objetivo } = answers;
  if (!direccion || entrada === null) return false;

  if (stop !== null) {
    const mal = direccion === "LONG" ? stop >= entrada : stop <= entrada;
    if (mal) return true;
  }
  if (objetivo !== null) {
    const mal = direccion === "LONG" ? objetivo <= entrada : objetivo >= entrada;
    if (mal) return true;
  }
  return false;
}

/** Si el plan tiene algo dentro. Uno en blanco no merece quedarse esperando. */
export function planVacio(answers: PlanAnswers): boolean {
  return (
    answers.direccion === "" &&
    answers.idea.trim() === "" &&
    answers.entrada === null &&
    answers.stop === null &&
    answers.objetivo === null &&
    answers.riesgo === null &&
    answers.animo.length === 0 &&
    answers.foto === ""
  );
}

/**
 * El plan en una línea, para la pregunta del cierre.
 *
 * Al preguntar «¿es ésta la que planificaste?» hay que enseñar el plan, o la
 * pregunta es un test de memoria. Corto a propósito: la dirección, los tres
 * precios y nada más -- lo demás está a un clic y aquí sólo estorbaría.
 */
export function resumenCorto(answers: PlanAnswers): string {
  const partes: string[] = [];
  if (answers.direccion) partes.push(answers.direccion === "LONG" ? "Largo" : "Corto");

  // Por `formatNumber`: estos tres precios se enseñan en la misma pantalla que
  // el P&L y el precio de entrada reales, que salen de `formatMoney`. Escrito
  // aquí a mano separaba los miles al revés que ellos.
  const precio = (n: number) => formatNumber(n);
  if (answers.entrada !== null) partes.push(`entrada ${precio(answers.entrada)}`);
  if (answers.stop !== null) partes.push(`stop ${precio(answers.stop)}`);
  if (answers.objetivo !== null) partes.push(`objetivo ${precio(answers.objetivo)}`);

  return partes.join(" · ");
}
