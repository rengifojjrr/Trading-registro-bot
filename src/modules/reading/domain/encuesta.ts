import type { OpcionChip, Paso, PasoChips } from "@/core/encuesta/pasos";

import { BOOK_STATUS_LABELS, type BookStatus } from "./reading";

/**
 * Un rato de lectura, preguntado de una en una.
 *
 * El formulario anterior tenía seis campos a la vista y se rellenaba entero
 * las veces que uno tenía ganas. Leer veinte minutos antes de dormir y que
 * apuntarlo cueste más que el propio rato es exactamente la razón por la que
 * las sesiones dejaban de apuntarse a los tres días.
 *
 * El orden no es el del formulario viejo: primero el libro, los minutos y las
 * páginas. Son los tres que alimentan el análisis --el ritmo en páginas por
 * hora sale de los dos últimos--, así que quien abandone en la cuarta pregunta
 * deja guardado lo que de verdad se usa. La hora de empezar, que era el
 * segundo campo del formulario, se va al final: sirve para saber a qué hora
 * lees mejor y no la mira nadie más.
 *
 * Lo que **desaparece** es la regla de «al menos minutos o páginas». Existía
 * para que el botón de guardar no creara filas vacías, y aquí no hay botón de
 * guardar: la fila nace de la primera respuesta, así que sin respuestas no hay
 * fila. Y una sesión con el libro y una idea pero sin minutos ya no es basura
 * -- es justo lo que se relee dentro de un año.
 */

/** Lo que la encuesta necesita saber de un libro para poder ofrecerlo. */
export interface LibroElegible {
  id: string;
  title: string;
  author: string | null;
  icon: string | null;
  status: BookStatus;
}

/**
 * Las horas a las que se lee de verdad: el rato de después de comer y el de
 * antes de dormir. Igual que en sueño, tocar «22:00» es una acción y
 * escribirlo en el campo de hora de un móvil son cuatro.
 */
const ATAJOS_LECTURA = ["07:00", "08:00", "13:00", "16:00", "18:00", "21:00", "22:00", "23:00"];

/**
 * Los libros, agrupados por estado y empezando por los que estás leyendo.
 *
 * Con encabezados y no como una lista sola porque una biblioteca de treinta
 * libros pone los dos que estás leyendo ahora en medio de veintiocho que no,
 * y entonces la pregunta que debía ser un toque es una búsqueda.
 */
const ORDEN_DE_ESTADOS: BookStatus[] = ["LEYENDO", "POR_LEER", "TERMINADO", "ABANDONADO"];

function fichaDeLibro(libro: LibroElegible): OpcionChip {
  return {
    valor: libro.id,
    etiqueta: libro.icon ? `${libro.icon} ${libro.title}` : libro.title,
    // El autor distingue dos libros del mismo título, y en una lista de fichas
    // es la única forma de saber cuál es cuál sin abrirlos.
    detalle: libro.author ?? undefined,
  };
}

export function gruposDeLibros(libros: LibroElegible[]): { titulo: string; opciones: OpcionChip[] }[] {
  return ORDEN_DE_ESTADOS.map((estado) => ({
    titulo: BOOK_STATUS_LABELS[estado],
    opciones: libros.filter((l) => l.status === estado).map(fichaDeLibro),
  })).filter((grupo) => grupo.opciones.length > 0);
}

/** La pregunta del libro, o null si todavía no hay ninguno que ofrecer. */
function pasoDeLibro(libros: LibroElegible[]): PasoChips | null {
  const grupos = gruposDeLibros(libros);
  // Sin libros la pregunta sólo puede contestarse saltándola, y una encuesta
  // que empieza por una pregunta imposible es una encuesta que se cierra.
  if (grupos.length === 0) return null;

  return {
    id: "book_id",
    tipo: "chips",
    multiple: false,
    pregunta: "¿Qué estabas leyendo?",
    ayuda: "De los libros que tienes apuntados. Un rato suelto también cuenta como lectura.",
    grupos,
    ninguno: "Nada en concreto",
  };
}

/**
 * Lo que se pregunta de un rato de lectura, con los libros de quien contesta.
 *
 * `hoy` es el día del usuario en su zona horaria, y lo pone quien llama porque
 * es quien la conoce: leer a las once de la noche en Bogotá ya es mañana en
 * UTC, y un «Hoy» sacado del reloj del navegador archivaría el rato en el día
 * siguiente.
 */
export function pasosDeLectura(libros: LibroElegible[], hoy: string): Paso[] {
  const libro = pasoDeLibro(libros);

  return [
    ...(libro ? [libro] : []),
    {
      id: "minutes",
      tipo: "numero",
      pregunta: "¿Cuántos minutos?",
      ayuda: "A ojo basta. Lo que cuenta es el orden de magnitud, no el cronómetro.",
      marcador: "30",
      decimales: 0,
    },
    {
      id: "pages",
      tipo: "numero",
      pregunta: "¿Cuántas páginas?",
      ayuda: "Con los minutos sale tu ritmo, que es lo único que el análisis no puede inventarse.",
      marcador: "24",
      decimales: 0,
    },
    {
      id: "score",
      tipo: "escala",
      pregunta: "¿Qué tal el rato?",
      ayuda: "De 0 a 10, con la primera impresión. Pensarla mucho no la hace más exacta.",
      opciones: Array.from({ length: 11 }, (_, i) => ({ valor: i, etiqueta: String(i) })),
    },
    {
      id: "summary",
      tipo: "texto",
      pregunta: "¿Qué te llevas?",
      ayuda: "Una idea, una frase, algo que discutirías. Esto es lo que se relee dentro de un año.",
      marcador: "Que la atención es un músculo y no una virtud…",
      lineas: 5,
      maximo: 8000,
    },
    {
      id: "started_at",
      tipo: "hora",
      pregunta: "¿A qué hora empezaste?",
      ayuda: "Sólo si te interesa saber a qué hora del día lees mejor.",
      atajos: ATAJOS_LECTURA,
    },
    {
      id: "session_date",
      tipo: "fecha",
      pregunta: "¿Qué día fue?",
      ayuda: "Viene puesto hoy. Cámbialo si estás apuntando el rato de anoche.",
      hoy,
      atajos: [
        { etiqueta: "Hoy", dias: 0 },
        { etiqueta: "Ayer", dias: 1 },
        { etiqueta: "Anteayer", dias: 2 },
      ],
    },
  ];
}

/** Cómo se llama cada respuesta en el resumen del final, en una palabra. */
export const ETIQUETAS_LECTURA: Record<string, string> = {
  book_id: "Libro",
  minutes: "Minutos",
  pages: "Páginas",
  score: "Puntaje",
  summary: "Me llevo",
  started_at: "Empecé",
  session_date: "Día",
};
