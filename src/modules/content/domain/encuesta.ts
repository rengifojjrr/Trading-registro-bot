import type { OpcionChip, Paso } from "@/core/encuesta/pasos";

import {
  CHANNELS,
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  EDIT_STYLES,
  EDIT_TIME_OPTIONS,
  PLATFORMS,
  RECORD_TIME_OPTIONS,
  STATUS_LABELS,
  type ContentStatus,
} from "./content";

/**
 * Una pieza de contenido, preguntada de una en una.
 *
 * El formulario más largo de la aplicación: veinte campos, que es lo que hace
 * falta para describir un vídeo de verdad. Ya estaba partido en tramos
 * plegados por el mismo motivo por el que ahora es una encuesta -- «la mayoría
 * de las veces se viene sólo a apuntar una idea, y para eso el título basta».
 *
 * Contenido se usa como tareas y no como sueño: la idea se apunta en un
 * segundo y la pieza se toca durante semanas, mientras baja por los diez
 * estados. Así que, igual que en tareas:
 *
 * - **Apuntar la idea es un campo y un botón** (`ui/new-piece.tsx`), con la
 *   barra de plantillas al lado. Lo que se apunta seguido suele ser del mismo
 *   tipo, y eso es lo que resuelve una plantilla.
 * - **Rellenarla es lo lineal**, y de una en una se contesta.
 * - **Corregir un campo suelto** --pegar el enlace del montaje, marcarla
 *   editada-- se hace desde la ficha, tocando esa línea.
 *
 * El orden sigue al trabajo: qué es y dónde va, luego lo que cuesta
 * producirla, luego dónde acabó, y el guion al final. El guion es lo más
 * valioso del módulo y por eso va el último: es lo que se viene a escribir con
 * tiempo, y la ficha lo deja a un toque.
 */

/**
 * Los diez estados, agrupados por el tramo del proceso en que estás.
 *
 * Diez fichas seguidas son una lista que hay que leer entera; en tres bloques
 * se encuentra de un vistazo, porque lo que uno sabe es «va por edición», no
 * el nombre exacto del estado. Cada estado nombra un cuello de botella
 * concreto, y esa es la decisión más importante del módulo.
 */
const GRUPOS_DE_ESTADO: { titulo: string; opciones: readonly OpcionChip[] }[] = [
  {
    titulo: "Antes de grabar",
    opciones: ficha(["IDEA", "FALTA_GUION", "FALTA_GRABAR"]),
  },
  {
    titulo: "En edición",
    opciones: ficha(["FALTA_EDITAR", "EDITANDO", "EDITADO_FALTA_LINK"]),
  },
  {
    titulo: "Antes de publicar",
    opciones: ficha(["EN_DRIVE", "FALTA_MINIATURA", "LISTO_PARA_PUBLICAR"]),
  },
  { titulo: "Fuera", opciones: ficha(["PUBLICADO"]) },
];

function ficha(estados: ContentStatus[]): OpcionChip[] {
  return estados.map((e) => ({ valor: e, etiqueta: STATUS_LABELS[e] }));
}

/**
 * Lo que puede estar hecho de una pieza, en una sola pregunta.
 *
 * Eran tres casillas --guion, editado, miniatura A/B-- y aquí son tres fichas
 * de la misma: «¿qué ya está hecho?» se contesta de una pasada, y tres
 * preguntas de sí o no seguidas son tres oportunidades de abandonar.
 */
export const HITOS = [
  { valor: "has_script", etiqueta: "Guion" },
  { valor: "is_edited", etiqueta: "Editado" },
  { valor: "has_thumbnail_ab", etiqueta: "Miniatura A/B" },
] as const;

export type Hito = (typeof HITOS)[number]["valor"];

/** Las fechas a las que se manda una pieza: siempre hacia delante. */
const ATAJOS_DE_PLAN = [
  { etiqueta: "Hoy", dias: 0 },
  { etiqueta: "Mañana", dias: -1 },
  { etiqueta: "En una semana", dias: -7 },
  { etiqueta: "En un mes", dias: -30 },
];

/**
 * Lo que se pregunta de una pieza.
 *
 * `hoy` es el día del usuario en su zona horaria, y lo pone quien llama.
 */
export function pasosDePieza(hoy: string): Paso[] {
  return [
    {
      id: "title",
      tipo: "linea",
      pregunta: "¿Sobre qué va?",
      ayuda: "El título de trabajo. No tiene que ser el definitivo.",
      marcador: "Cómo leer un gráfico de velas",
      maximo: 200,
    },
    {
      id: "status",
      tipo: "chips",
      multiple: false,
      pregunta: "¿Por dónde va?",
      ayuda: "Cada estado nombra lo que falta, que es lo que hay que saber para desatascarla.",
      grupos: GRUPOS_DE_ESTADO,
    },
    {
      id: "content_type",
      tipo: "chips",
      multiple: false,
      pregunta: "¿Vídeo o foto?",
      opciones: CONTENT_TYPES.map((t) => ({ valor: t, etiqueta: CONTENT_TYPE_LABELS[t] })),
    },
    {
      id: "channels",
      tipo: "chips",
      multiple: true,
      pregunta: "¿De qué canal es?",
      ayuda: "Puedes elegir varios: lo mismo sale en dos canales más veces de las que parece.",
      opciones: CHANNELS,
      ninguno: "De ninguno todavía",
    },
    {
      id: "platforms",
      tipo: "chips",
      multiple: true,
      pregunta: "¿Dónde se publica?",
      opciones: PLATFORMS,
      ninguno: "Sin decidir",
    },
    {
      id: "planned_date",
      tipo: "fecha",
      pregunta: "¿Para cuándo?",
      ayuda: "Sin fecha no sale en el calendario, que a veces es justo lo que quieres.",
      hoy,
      atajos: ATAJOS_DE_PLAN,
    },
    {
      id: "summary",
      tipo: "texto",
      pregunta: "¿De qué va?",
      ayuda: "En una línea, para reconocerla en la lista dentro de dos meses.",
      marcador: "Las tres velas que aparecen en todo suelo…",
      lineas: 3,
      maximo: 2000,
    },
    {
      id: "hitos",
      tipo: "chips",
      multiple: true,
      pregunta: "¿Qué ya está hecho?",
      ayuda: "Lo que no marques cuenta como pendiente.",
      opciones: HITOS,
      ninguno: "Nada todavía",
    },
    {
      id: "record_difficulties",
      tipo: "chips",
      multiple: true,
      pregunta: "¿Cuánto cuesta grabarla?",
      ayuda: "Puedes marcar varias: una pieza puede ser fácil de hablar y difícil de montar.",
      opciones: DIFFICULTIES.map((d) => ({ valor: d, etiqueta: DIFFICULTY_LABELS[d] })),
      ninguno: "Sin calcular",
    },
    {
      id: "record_time",
      tipo: "chips",
      multiple: false,
      pregunta: "¿Cuánto se tardó en grabar?",
      // Son estimaciones del punto medio de un rango, no un cronómetro. Se
      // dice aquí porque una media sobre estimaciones sigue sirviendo para
      // comparar formatos, pero conviene que se sepa lo que es.
      ayuda: "A ojo. Sirve para comparar un formato con otro, no para facturar.",
      opciones: RECORD_TIME_OPTIONS.map((o) => ({ valor: o.label, etiqueta: o.label })),
    },
    {
      id: "edit_time",
      tipo: "chips",
      multiple: false,
      pregunta: "¿Y en editarla?",
      ayuda: "Si dejaste de contar, hay una opción para eso -- y es un dato por sí misma.",
      opciones: EDIT_TIME_OPTIONS.map((o) => ({ valor: o.label, etiqueta: o.label })),
    },
    {
      id: "edit_styles",
      tipo: "chips",
      multiple: true,
      pregunta: "¿Qué tipo de edición pide?",
      opciones: EDIT_STYLES,
      ninguno: "Sin decidir",
    },
    {
      id: "edit_notes",
      tipo: "texto",
      pregunta: "¿Algo que sepa quien edita?",
      ayuda: "Lo que no se ve en el material: qué cortar, qué dejar, dónde va el gancho.",
      marcador: "Cortar los primeros 40 segundos…",
      lineas: 4,
      maximo: 4000,
    },
    {
      id: "video_url",
      tipo: "linea",
      pregunta: "¿Dónde está el material grabado?",
      ayuda: "Un enlace completo, con https. Un enlace es para pulsarlo.",
      marcador: "https://…",
      maximo: 500,
    },
    {
      id: "final_url",
      tipo: "linea",
      pregunta: "¿Y el montaje final?",
      marcador: "https://…",
      maximo: 500,
    },
    {
      id: "url",
      tipo: "linea",
      pregunta: "¿Dónde quedó publicada?",
      ayuda: "El enlace de verdad, el que se manda a alguien.",
      marcador: "https://…",
      maximo: 500,
    },
    {
      id: "notes",
      tipo: "texto",
      pregunta: "¿Alguna nota más?",
      marcador: "Lo que quieras recordar de esta pieza",
      lineas: 3,
      maximo: 4000,
    },
    {
      id: "body",
      tipo: "texto",
      pregunta: "El guion",
      ayuda: "El gancho, el texto y las etiquetas. Es el trabajo de verdad, y va al final para que tenga sitio.",
      marcador: "**HOOK:**\n\n**SCRIPT/NOTES:**\n\n**TAGS:**",
      lineas: 14,
      maximo: 20000,
    },
  ];
}

/** Cómo se llama cada respuesta en la ficha, en una palabra. */
export const ETIQUETAS_PIEZA: Record<string, string> = {
  title: "Título",
  status: "Estado",
  content_type: "Tipo",
  channels: "Canal",
  platforms: "Plataforma",
  planned_date: "Prevista",
  summary: "De qué va",
  hitos: "Ya está",
  record_difficulties: "Dificultad",
  record_time: "Grabar",
  edit_time: "Editar",
  edit_styles: "Edición",
  edit_notes: "Para edición",
  video_url: "Material",
  final_url: "Montaje",
  url: "Publicada",
  notes: "Notas",
  body: "Guion",
};

/** Los hitos marcados de una pieza, como los espera la encuesta. */
export function hitosDe(pieza: {
  has_script: boolean;
  is_edited: boolean;
  has_thumbnail_ab: boolean;
}): Hito[] {
  return HITOS.filter((h) => pieza[h.valor]).map((h) => h.valor);
}
