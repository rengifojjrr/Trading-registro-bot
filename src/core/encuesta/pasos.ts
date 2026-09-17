/**
 * Una encuesta por etapas, descrita como datos.
 *
 * Nació en el diario de trading: las preguntas de una en una, respuestas que
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

import { formatNumber } from "@/lib/format";

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

/**
 * Una ficha con su valor y, si hace falta, qué significa.
 *
 * El detalle no es decoración: en una lista donde las opciones son «A+, A, B,
 * C» o un código de error, la etiqueta sola no dice qué cuenta como cada
 * cosa, y sin eso cada uno puntúa con su vara y las cuentas de dentro de seis
 * meses no significan nada.
 */
export interface OpcionChip {
  valor: string;
  etiqueta: string;
  detalle?: string;
}

export interface PasoChips extends PasoBase {
  tipo: "chips";
  /** Varias a la vez, o una sola que se puede desmarcar. */
  multiple: boolean;
  /** Una cadena suelta cuando el valor y la etiqueta son lo mismo. */
  opciones?: readonly (string | OpcionChip)[];
  /** Con encabezados, cuando la lista es larga y tiene familias naturales. */
  grupos?: { titulo: string; opciones: readonly OpcionChip[] }[];
}

/** Las fichas de un paso, siempre en la forma larga. */
export function opcionesDe(paso: PasoChips): OpcionChip[] {
  if (paso.grupos) return paso.grupos.flatMap((g) => [...g.opciones]);
  return (paso.opciones ?? []).map((o) => (typeof o === "string" ? { valor: o, etiqueta: o } : o));
}

export interface PasoHora extends PasoBase {
  tipo: "hora";
  /** Las horas de verdad, para no teclear cuatro dígitos en un móvil a las siete. */
  atajos: readonly string[];
}

/**
 * Un día.
 *
 * Los atajos son relativos --«Hoy», «Ayer»-- y no fechas literales porque la
 * lista de pasos se escribe una vez y se usa todos los días. El día de
 * referencia lo pone quien llama, que es quien sabe en qué zona horaria vive
 * el usuario: a las 21:00 en Bogotá ya es mañana en UTC, y un «Hoy» sacado del
 * reloj del navegador archivaría la comida en el día equivocado.
 */
export interface PasoFecha extends PasoBase {
  tipo: "fecha";
  /** El día de referencia (`AAAA-MM-DD`) desde el que cuentan los atajos. */
  hoy: string;
  /**
   * Botones relativos: cuántos días hacia atrás, y cómo se llaman.
   *
   * Hacia atrás porque casi todo en Vida se apunta después de que pase. En
   * negativo van hacia delante, que es lo que necesita comidas: eso es un
   * planificador, y planificar es escribir el martes que viene.
   */
  atajos?: readonly { etiqueta: string; dias: number }[];
}

/**
 * El día que cae `dias` antes de `hoy`, en aritmética de calendario.
 *
 * En UTC a propósito, y no con la zona del usuario: los dos extremos son
 * fechas sin hora, así que restar días es contar casillas de un calendario y
 * no restar 86.400 segundos -- que es lo que se equivoca la noche en que
 * cambia la hora.
 */
export function diaMenos(hoy: string, dias: number): string {
  const [anio, mes, dia] = hoy.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia - dias)).toISOString().slice(0, 10);
}

/** «Ayer» cuando el día es uno de los atajos; la fecha tal cual si no. */
export function etiquetaDeFecha(paso: PasoFecha, valor: string): string {
  return (paso.atajos ?? []).find((a) => diaMenos(paso.hoy, a.dias) === valor)?.etiqueta ?? valor;
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

/**
 * Un número suelto: un precio, un peso, cuánto estás dispuesto a perder.
 *
 * Distinto de una escala, que es elegir entre opciones contadas. Aquí el valor
 * lo escribes tú y puede ser cualquiera, así que hace falta teclado -- pero un
 * teclado **numérico**, que en un móvil es la diferencia entre teclear 68.450
 * de una vez y buscar los dígitos entre las letras.
 */
export interface PasoNumero extends PasoBase {
  tipo: "numero";
  marcador?: string;
  /** Lo que va delante, dentro del recuadro: «$». */
  prefijo?: string;
  /** Cuántos decimales admite. Un precio no es un número de contratos. */
  decimales?: number;
}

/**
 * Una foto.
 *
 * El valor que se guarda no es la imagen sino dónde quedó -- la ruta en el
 * almacén --, porque una imagen en el diccionario de respuestas viajaría
 * entera en cada tecla que se pulse en cualquier otra pregunta. Subirla es
 * cosa de quien llama (`onSubirImagen`): el motor no sabe de red.
 */
export interface PasoImagen extends PasoBase {
  tipo: "imagen";
  /** Qué se espera ver. «El gráfico con tus líneas», no «adjunta un archivo». */
  pista?: string;
}

export type Paso =
  | PasoEscala
  | PasoChips
  | PasoHora
  | PasoFecha
  | PasoTexto
  | PasoLinea
  | PasoNumero
  | PasoImagen;

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
  if (paso.tipo === "escala" || paso.tipo === "numero") return null;
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

  if (paso.tipo === "chips") {
    const todas = opcionesDe(paso);
    const marcadas = Array.isArray(valor) ? valor.map(String) : [String(valor)];
    return marcadas.map((v) => todas.find((o) => o.valor === v)?.etiqueta ?? v).join(", ");
  }

  if (paso.tipo === "numero" && typeof valor === "number") {
    // Con separador de miles: 68,450 se lee de un vistazo y 68450 hay que
    // contarlo. Es la misma razón por la que el eje del gráfico los lleva --
    // y por eso va por `formatNumber`, que es de donde salen los del gráfico.
    // Escrito a mano aquí, los separaba al revés que el gráfico: una encuesta
    // que pregunta por un precio y luego lo enseña de otra forma que la
    // pantalla de al lado.
    return `${paso.prefijo ?? ""}${formatNumber(valor, paso.decimales ?? 2)}`;
  }

  // «Ayer» y no «2026-09-16»: el resumen se lee de un vistazo, y la fecha en
  // crudo obliga a calcular qué día era ése.
  if (paso.tipo === "fecha" && typeof valor === "string") return etiquetaDeFecha(paso, valor);

  // Una imagen en el resumen se enseña, no se describe: lo que hay guardado es
  // una ruta, y «planes/3f2a…png» no le dice nada a nadie.
  if (paso.tipo === "imagen") return "Una foto";

  if (Array.isArray(valor)) return valor.join(", ");

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
