import type { OpcionChip, Paso } from "@/core/encuesta/pasos";

import { CATEGORIES, PRIORITIES, PRIORITY_LABELS, STATUS_LABELS, STATUSES } from "./tasks";

/**
 * Una tarea, preguntada de una en una.
 *
 * Aquí la encuesta no sirve para lo mismo que en los demás módulos, y conviene
 * decirlo antes de que alguien la «arregle»:
 *
 * Una noche o un rato de lectura se escriben **una vez**, del tirado, justo
 * después de que pasen. Una tarea se apunta en un segundo --«llamar al
 * fontanero»-- y luego se toca muchas veces a lo largo de días. Son dos usos
 * distintos y piden dos cosas distintas:
 *
 * - **Apuntarla sigue siendo un campo y un botón** (`ui/new-task.tsx`). Es lo
 *   más rápido que puede ser y convertirlo en encuesta lo haría más lento.
 *   El formulario largo de este módulo es el de la ficha, no el de apuntar.
 * - **Rellenarla es lo que sí es lineal**: la capturaste con prisa y luego te
 *   sientas a decidir de qué proyecto es, para cuándo y qué hay que hacer
 *   exactamente. Diez campos a la vista para eso es justo el muro que nadie
 *   rellena, y de una en una se contesta.
 * - **Corregir un campo suelto** --moverla al viernes-- no puede costar
 *   recorrer nueve preguntas. Por eso la ficha abre en el resumen cuando ya
 *   está todo contestado, y cada línea salta a su pregunta.
 *
 * El orden es el de una tarea que se está decidiendo: primero lo que la sitúa
 * --estado, prioridad, proyecto--, luego cuándo, y al final lo que hay que
 * escribir. Quien abandone a la mitad deja decidido lo que hace que la tarea
 * aparezca en el sitio correcto de la lista, que es para lo que sirve la lista.
 */

/** Lo que la encuesta necesita saber de un proyecto para poder ofrecerlo. */
export interface ProyectoElegible {
  id: string;
  name: string;
  icon: string | null;
}

const FICHAS_DE_ESTADO: OpcionChip[] = STATUSES.map((s) => ({
  valor: s,
  etiqueta: STATUS_LABELS[s],
}));

const FICHAS_DE_PRIORIDAD: OpcionChip[] = PRIORITIES.map((p) => ({
  valor: p,
  etiqueta: PRIORITY_LABELS[p],
}));

/**
 * Los días a los que se manda una tarea.
 *
 * Todos hacia delante --en negativo-- salvo hoy: una tarea se aplaza, no se
 * retrasa hacia el pasado. «La semana que viene» es el aplazamiento de verdad,
 * el que se usa cuando algo lleva tres días mirándote desde la lista.
 */
const ATAJOS_DE_PLAZO = [
  { etiqueta: "Hoy", dias: 0 },
  { etiqueta: "Mañana", dias: -1 },
  { etiqueta: "Pasado", dias: -2 },
  { etiqueta: "En una semana", dias: -7 },
];

/** Las horas a las que se pone una tarea, para no teclear cuatro dígitos. */
const ATAJOS_DE_HORA = ["09:00", "10:00", "12:00", "15:00", "17:00", "19:00"];

/**
 * Lo que se pregunta de una tarea, con los proyectos de quien contesta.
 *
 * `hoy` es el día del usuario en su zona horaria, y lo pone quien llama porque
 * es quien la conoce: `urgencyOf` compara cadenas ISO por este mismo motivo.
 */
export function pasosDeTarea(proyectos: ProyectoElegible[], hoy: string): Paso[] {
  const fichasDeProyecto: OpcionChip[] = proyectos.map((p) => ({
    valor: p.id,
    etiqueta: p.icon ? `${p.icon} ${p.name}` : p.name,
  }));

  return [
    {
      id: "title",
      tipo: "linea",
      pregunta: "¿Qué hay que hacer?",
      ayuda: "Como se lo dirías a alguien. Es lo que verás en la lista dentro de dos semanas.",
      marcador: "Llamar al fontanero",
      maximo: 300,
    },
    {
      id: "status",
      tipo: "chips",
      multiple: false,
      pregunta: "¿Cómo va?",
      opciones: FICHAS_DE_ESTADO,
    },
    {
      id: "priority",
      tipo: "chips",
      multiple: false,
      pregunta: "¿Cuánto corre?",
      ayuda: "Con la fecha, es lo que decide en qué orden sale en la lista.",
      opciones: FICHAS_DE_PRIORIDAD,
    },
    // Sin proyectos la pregunta sólo podría contestarse saltándola.
    ...(fichasDeProyecto.length > 0
      ? [
          {
            id: "project_id",
            tipo: "chips" as const,
            multiple: false,
            pregunta: "¿De qué proyecto es?",
            opciones: fichasDeProyecto,
            ninguno: "Sin proyecto",
          },
        ]
      : []),
    {
      id: "due_date",
      tipo: "fecha",
      pregunta: "¿Para cuándo?",
      ayuda: "Sin fecha no es urgente nunca, que a veces es exactamente lo que quieres decir.",
      hoy,
      atajos: ATAJOS_DE_PLAZO,
    },
    {
      id: "due_time",
      tipo: "hora",
      pregunta: "¿A qué hora?",
      ayuda: "Sólo si la tiene. La mayoría de las tareas no la tienen.",
      atajos: ATAJOS_DE_HORA,
    },
    {
      id: "due_end",
      tipo: "fecha",
      pregunta: "¿Hasta cuándo?",
      ayuda: "Sólo si dura más de un día. Si no, salta ésta.",
      hoy,
      atajos: ATAJOS_DE_PLAZO,
    },
    {
      id: "categories",
      tipo: "chips",
      multiple: true,
      pregunta: "¿De qué va?",
      ayuda: "Puedes elegir varias. Es lo que deja ver cuánto se te va en cada cosa.",
      opciones: CATEGORIES,
      ninguno: "De nada en concreto",
    },
    {
      id: "notes",
      tipo: "linea",
      pregunta: "¿Alguna nota?",
      ayuda: "Una línea: un teléfono, una dirección, el nombre de quien te lo pidió.",
      marcador: "Lo que quieras tener a mano",
      maximo: 4000,
    },
    {
      id: "description",
      tipo: "texto",
      pregunta: "¿Qué hay que hacer exactamente?",
      ayuda: "Con detalle, para el día que la abras y no te acuerdes de nada. Es el cuerpo de la ficha.",
      marcador: "Los pasos, los enlaces, lo que haga falta…",
      lineas: 6,
      maximo: 20000,
    },
  ];
}

/** Cómo se llama cada respuesta en el resumen, en una palabra. */
export const ETIQUETAS_TAREA: Record<string, string> = {
  title: "Qué",
  status: "Estado",
  priority: "Prioridad",
  project_id: "Proyecto",
  due_date: "Para",
  due_time: "Hora",
  due_end: "Hasta",
  categories: "De qué va",
  notes: "Nota",
  description: "Detalle",
};
