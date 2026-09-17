import type { Paso } from "@/core/encuesta/pasos";

import { MEAL_TYPE_LABELS, MEAL_TYPES } from "./meals";

/**
 * Una comida, preguntada de una en una.
 *
 * Eran seis campos a la vista y un botón de guardar al final. Menos que el
 * diario de una operación, pero la comida se apunta tres veces al día: lo que
 * en trading cuesta una vez por operación, aquí cuesta veintiuna por semana.
 *
 * Dos cosas que este módulo no comparte con los demás, y que mandan sobre el
 * orden:
 *
 * - **Es un planificador**, no sólo un diario. Se escribe el martes que viene,
 *   así que los atajos del día van también hacia delante.
 * - **El nombre es obligatorio en la base**, y no por capricho: una comida sin
 *   nombre no se puede enseñar en la rejilla de la semana ni en la lista. Así
 *   que es la primera pregunta de verdad y es la que crea la fila. El tipo va
 *   antes pero viene contestado -- de la rejilla o de almuerzo por defecto --,
 *   así que la encuesta abre en «¿qué se come?».
 *
 * Los ingredientes siguen siendo un bloque de texto de una línea por cosa, y
 * no una pregunta por ingrediente: escribir tres campos por cada uno es
 * tedioso y acaba en que no se apuntan. Lo que hace esa pregunta valiosa --que
 * de ahí sale la lista de la compra-- se dice en la ayuda, que es donde alguien
 * la va a leer.
 */

/** Los tres huecos del día, como fichas. */
const FICHAS_DE_TIPO = MEAL_TYPES.map((t) => ({ valor: t, etiqueta: MEAL_TYPE_LABELS[t] }));

/**
 * Los días que se escriben de verdad.
 *
 * En los dos sentidos: hacia atrás porque la cena se apunta al día siguiente,
 * y hacia delante porque esto es un planificador. En orden de calendario y no
 * de cercanía, que es como se lee una fila de días.
 */
const ATAJOS_DE_DIA = [
  { etiqueta: "Ayer", dias: 1 },
  { etiqueta: "Hoy", dias: 0 },
  { etiqueta: "Mañana", dias: -1 },
  { etiqueta: "Pasado", dias: -2 },
];

/**
 * Lo que se pregunta de una comida.
 *
 * `hoy` es el día del usuario en su zona horaria, y lo pone quien llama porque
 * es quien la conoce: cenar a las once en Bogotá ya es mañana en UTC.
 */
export function pasosDeComida(hoy: string): Paso[] {
  return [
    {
      id: "meal_type",
      tipo: "chips",
      multiple: false,
      pregunta: "¿Qué comida es?",
      ayuda: "Viene puesto el hueco desde el que hayas entrado.",
      opciones: FICHAS_DE_TIPO,
    },
    {
      id: "name",
      tipo: "linea",
      pregunta: "¿Qué se come?",
      ayuda: "Como lo dirías en voz alta: «lentejas», «arroz con pollo». Es lo que sale en la semana.",
      marcador: "Lentejas",
      maximo: 200,
    },
    {
      id: "ingredients",
      tipo: "texto",
      pregunta: "¿Con qué?",
      ayuda: "Uno por línea, sueltos: «200 g tomate», «2 huevos», «sal». De aquí sale la lista de la compra.",
      marcador: "200 g tomate\n2 huevos\nsal",
      lineas: 5,
      maximo: 8000,
    },
    {
      id: "cook",
      tipo: "linea",
      pregunta: "¿Quién cocinó?",
      ayuda: "Sólo si no fue quien cocina siempre.",
      marcador: "Yo",
      maximo: 120,
    },
    {
      id: "notes",
      tipo: "linea",
      pregunta: "¿Algo que recordar?",
      ayuda: "Que salió salado, que gustó mucho, que la próxima vez con menos aceite.",
      marcador: "Lo que quieras recordar",
      maximo: 4000,
    },
    {
      id: "meal_date",
      tipo: "fecha",
      pregunta: "¿Para qué día?",
      ayuda: "Viene puesto el día del hueco. Hacia delante es planificar; hacia atrás, apuntar lo de ayer.",
      hoy,
      atajos: ATAJOS_DE_DIA,
    },
  ];
}

/** Cómo se llama cada respuesta en el resumen del final, en una palabra. */
export const ETIQUETAS_COMIDA: Record<string, string> = {
  meal_type: "Comida",
  name: "Qué",
  ingredients: "Con qué",
  cook: "Cocinó",
  notes: "Notas",
  meal_date: "Día",
};

/**
 * Lo mínimo para que una comida pueda existir.
 *
 * El nombre y el tipo son `not null` en la base, así que hasta que haya nombre
 * no hay fila que crear. No es una pega técnica: una comida sin nombre no se
 * puede enseñar en la rejilla de la semana, que es para lo que existe el
 * módulo.
 */
export function puedeNacer(respuestas: { name?: unknown }): boolean {
  return typeof respuestas.name === "string" && respuestas.name.trim() !== "";
}
