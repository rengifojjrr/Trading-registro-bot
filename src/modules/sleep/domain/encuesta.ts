import type { Paso } from "@/core/encuesta/pasos";

import { BEFORE_BED, MOOD_ON_WAKING, WOKE_HOW } from "./sleep";

/**
 * Una noche, preguntada de una en una.
 *
 * El formulario anterior tenía once campos a la vista repartidos en dos
 * bloques, y se rellenaba entero las noches que uno tenía ganas: es decir,
 * casi ninguna. La pantalla en la que hay que apuntar algo a las siete de la
 * mañana no puede pedir once cosas a la vez.
 *
 * Siguen siendo **dos** encuestas y no una, porque una noche no se apunta de
 * una sentada: la de arriba se contesta antes de acostarse y la de abajo al
 * levantarse, con horas de sueño de por medio. Cada una escribe sólo sus
 * columnas, así que contestar la de la mañana no puede borrar lo de la noche.
 *
 * El orden de la mañana no es el del formulario viejo: primero la hora y el
 * puntaje. Son los dos que alimentan el análisis, así que si alguien abandona
 * en la tercera pregunta lo que queda guardado es lo que de verdad sirve.
 */

/** Las horas a las que uno se acuesta y se levanta de verdad, para no teclear. */
const ATAJOS_ACOSTARSE = ["21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "01:00", "02:00"];
const ATAJOS_LEVANTARSE = ["05:00", "05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "09:00"];

/** Las opciones de «Cuanto tiempo Dormí?», tal cual están en tu Notion. */
export const AUTOINFORME = [
  "4 horas",
  "5 horas",
  "6 horas",
  "7 horas",
  "8 horas",
  "9 horas",
  "10 horas",
  "Más de 10",
] as const;

export const PASOS_ANTES: Paso[] = [
  {
    id: "bedtime",
    tipo: "hora",
    pregunta: "¿A qué hora te acuestas?",
    ayuda: "Con ésta y la de mañana sale la duración, incluso cruzando la medianoche.",
    atajos: ATAJOS_ACOSTARSE,
  },
  {
    id: "before_bed",
    tipo: "chips",
    multiple: true,
    pregunta: "¿Qué hiciste antes de dormir?",
    ayuda: "Lo que se repita en las noches malas es lo que esta pregunta sirve para encontrar.",
    opciones: BEFORE_BED,
    ninguno: "Nada en especial",
  },
  {
    id: "place",
    tipo: "linea",
    pregunta: "¿Dónde duermes hoy?",
    ayuda: "Sólo si no es lo de siempre. Dormir fuera de casa explica más noches raras de las que parece.",
    marcador: "Mi cama",
    maximo: 120,
  },
];

export const PASOS_DESPERTAR: Paso[] = [
  {
    id: "wake_time",
    tipo: "hora",
    pregunta: "¿A qué hora te levantaste?",
    atajos: ATAJOS_LEVANTARSE,
  },
  {
    id: "score",
    tipo: "escala",
    pregunta: "¿Qué tal la noche?",
    ayuda: "De 0 a 10, con la primera impresión. Pensarla mucho no la hace más exacta.",
    opciones: Array.from({ length: 11 }, (_, i) => ({ valor: i, etiqueta: String(i) })),
  },
  {
    id: "woke_how",
    tipo: "chips",
    multiple: true,
    pregunta: "¿Cómo despertaste?",
    opciones: WOKE_HOW,
    ninguno: "Sin más",
  },
  {
    id: "mood_on_waking",
    tipo: "chips",
    multiple: true,
    pregunta: "¿Con qué ánimo te levantaste?",
    ayuda: "Puedes elegir varios. Estar cansado y agradecido a la vez es lo normal.",
    opciones: MOOD_ON_WAKING,
    ninguno: "Ni fu ni fa",
  },
  {
    id: "self_reported",
    tipo: "chips",
    multiple: false,
    // No es la resta de las dos horas y por eso vale: la diferencia entre lo
    // que crees que dormiste y lo que dice el reloj es un dato por sí misma.
    pregunta: "¿Cuánto crees que dormiste?",
    ayuda: "A ojo, sin mirar el reloj. Lo interesante es en qué te equivocas.",
    opciones: AUTOINFORME,
  },
  {
    id: "dream",
    tipo: "texto",
    pregunta: "¿Qué soñaste?",
    ayuda: "Lo que recuerdes, aunque sean fragmentos sueltos. Esto es lo que se relee meses después.",
    marcador: "Iba en un tren que no paraba en ninguna estación…",
    lineas: 5,
    maximo: 8000,
  },
  {
    id: "notes",
    tipo: "linea",
    pregunta: "¿Algo más de esta noche?",
    ayuda: "Ruido, calor, una discusión, un café a las seis de la tarde.",
    marcador: "Lo que quieras recordar",
    maximo: 4000,
  },
];

/** Cómo se llama cada respuesta en el resumen del final, en una palabra. */
export const ETIQUETAS_SUENO: Record<string, string> = {
  bedtime: "Me acosté",
  before_bed: "Antes",
  place: "Dónde",
  wake_time: "Me levanté",
  score: "Puntaje",
  woke_how: "Desperté",
  mood_on_waking: "Ánimo",
  self_reported: "Creo que dormí",
  dream: "Soñé",
  notes: "Notas",
};
