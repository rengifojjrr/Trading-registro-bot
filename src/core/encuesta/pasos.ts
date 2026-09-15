/**
 * Una encuesta por etapas, descrita como datos.
 *
 * Nació en el diario de trading: cinco preguntas de una en una, respuestas que
 * se eligen tocando, y salir cuando quieras sin perder lo contestado. Funcionó
 * por un motivo que no tiene nada que ver con el trading -- un formulario de
 * dieciséis campos vacíos se cierra y una pregunta sola se contesta -- así que
 * el resto de módulos pedían lo mismo: dormir, leer, comer y las tareas tienen
 * todos su formulario largo que nadie rellena entero.
 *
 * Lo que vive aquí es el recorrido, sin pantalla y sin red: qué preguntas hay,
 * cuál está contestada, por dónde se sigue y qué resumen se enseña al acabar.
 * Cada módulo aporta sus preguntas y qué hacer con cada respuesta.
 *
 * Las respuestas son un diccionario y no un tipo por módulo a propósito: el
 * motor no puede saber qué campos tiene una noche de sueño ni una operación, y
 * fingir que sí lo sabe obligaría a tocarlo cada vez que un módulo añade una
 * pregunta.
 */

export type Respuesta = string | string[] | number | null;

export type Respuestas = Record<string, Respuesta>;

interface PasoBase {
  /** La clave de la respuesta en el diccionario. */
  id: string;
  pregunta: string;
  /** Una línea debajo: para qué sirve, o qué cuenta como buena respuesta. */
  ayuda?: string;
  /**
   * Qué dice el botón de «no hubo nada», cuando decirlo es una respuesta.
   *
   * No es lo mismo que saltar. Sin este botón, «no sentí nada raro» y «no me
   * apetece contestar» se escriben igual y luego no se distinguen.
   */
  ninguno?: string;
}

export interface PasoEscala extends PasoBase {
  tipo: "escala";
  opciones: { valor: number; etiqueta: string; detalle?: string }[];
}

export interface PasoChips extends PasoBase {
  tipo: "chips";
  /** Varias a la vez, o una sola que se puede desmarcar. */
  multiple: boolean;
  opciones?: readonly string[];
  /** Con encabezados, cuando la lista es larga y tiene familias naturales. */
  grupos?: { titulo: string; opciones: readonly { valor: string; etiqueta: string; detalle?: string }[] }[];
}

export interface PasoHora extends PasoBase {
  tipo: "hora";
  /** Las horas de verdad, para no teclear cuatro dígitos en un móvil a las siete. */
  atajos: readonly string[];
}

export interface PasoTexto extends PasoBase {
  tipo: "texto";
  marcador?: string;
  maximo?: number;
  /** Alto del recuadro. Una frase y un sueño entero no piden lo mismo. */
  lineas?: number;
}

export interface PasoLinea extends PasoBase {
  tipo: "linea";
  marcador?: string;
  maximo?: number;
}

export type Paso = PasoEscala | PasoChips | PasoHora | PasoTexto | PasoLinea;

export function pasoPorId(pasos: Paso[], id: string): Paso {
  const paso = pasos.find((p) => p.id === id);
  // No puede pasar: los identificadores salen de la propia lista. Lanzar es
  // preferible a devolver otro paso, que pintaría la pregunta equivocada y
  // guardaría la respuesta en el sitio equivocado.
  if (!paso) throw new Error(`Paso desconocido: ${id}`);
  return paso;
}

/**
 * Si esta pregunta tiene respuesta.
 *
 * Una lista vacía y una cadena de espacios no lo son. Un **cero sí**: en una
 * escala de 0 a 10, cero es una respuesta y de las más informativas.
 */
export function estaContestado(paso: Paso, respuestas: Respuestas): boolean {
  const valor = respuestas[paso.id];
  if (valor === null || valor === undefined) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === "number") return Number.isFinite(valor);
  return valor.trim() !== "";
}

export function contestadas(pasos: Paso[], respuestas: Respuestas): number {
  return pasos.filter((p) => estaContestado(p, respuestas)).length;
}

/**
 * Por dónde se empieza.
 *
 * Por la primera sin contestar, para no volver a preguntar lo que ya está:
 * una noche se rellena a trozos y un diario se puede haber escrito a mano.
 * Devuelve la primera cuando está todo contestado -- reabrirla entonces es
 * para cambiar algo, y lo primero que se mira es el principio.
 */
export function primeraSinContestar(pasos: Paso[], respuestas: Respuestas): string {
  return (pasos.find((p) => !estaContestado(p, respuestas)) ?? pasos[0]).id;
}

export function indiceDe(pasos: Paso[], id: string): number {
  return pasos.findIndex((p) => p.id === id);
}

/** El siguiente, o null si era el último. */
export function siguientePaso(pasos: Paso[], id: string): string | null {
  return pasos[indiceDe(pasos, id) + 1]?.id ?? null;
}

/** El anterior, o null si era el primero. */
export function pasoAnterior(pasos: Paso[], id: string): string | null {
  const i = indiceDe(pasos, id);
  return i > 0 ? pasos[i - 1].id : null;
}

/** La respuesta vacía que corresponde a cada tipo de pregunta. */
export function respuestaVacia(paso: Paso): Respuesta {
  if (paso.tipo === "chips" && paso.multiple) return [];
  if (paso.tipo === "escala") return null;
  return "";
}

/** Todas las preguntas sin contestar, para arrancar de cero. */
export function respuestasVacias(pasos: Paso[]): Respuestas {
  return Object.fromEntries(pasos.map((p) => [p.id, respuestaVacia(p)]));
}

/** Cómo se lee una respuesta cuando hay que enseñarla en una línea. */
export function textoDeRespuesta(paso: Paso, respuestas: Respuestas): string | null {
  if (!estaContestado(paso, respuestas)) return null;
  const valor = respuestas[paso.id];

  if (paso.tipo === "escala" && typeof valor === "number") {
    // La palabra y no el número: «Casi todo» significa algo y «4» no.
    return paso.opciones.find((o) => o.valor === valor)?.etiqueta ?? String(valor);
  }

  if (Array.isArray(valor)) {
    if (paso.tipo === "chips" && paso.grupos) {
      const todas = paso.grupos.flatMap((g) => g.opciones);
      return valor.map((v) => todas.find((o) => o.valor === v)?.etiqueta ?? v).join(", ");
    }
    return valor.join(", ");
  }

  return String(valor).trim();
}

export interface LineaResumen {
  etiqueta: string;
  valor: string;
}

/**
 * Lo contestado, en frases, para la pantalla final.
 *
 * Enseñarlo al acabar no es decoración: convierte cinco toques en algo que se
 * ha dicho, y es la última oportunidad de ver que el 2 que pusiste querías que
 * fuera un 4. Las preguntas sin contestar no salen -- una lista con tres
 * huecos se lee como una tarea a medio hacer, y saltar era una opción
 * legítima.
 *
 * La etiqueta es corta y no la pregunta entera: «¿Cómo estabas mientras
 * tanto?» encima de «Ansiedad» ocupa tres líneas para decir una.
 */
export function resumen(
  pasos: Paso[],
  respuestas: Respuestas,
  etiquetas: Record<string, string>,
): LineaResumen[] {
  const lineas: LineaResumen[] = [];
  for (const paso of pasos) {
    const texto = textoDeRespuesta(paso, respuestas);
    if (texto === null || texto === "") continue;
    lineas.push({ etiqueta: etiquetas[paso.id] ?? paso.pregunta, valor: texto });
  }
  return lineas;
}
