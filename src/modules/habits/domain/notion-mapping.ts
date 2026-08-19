import { checkbox, dateStart, findProperty, type NotionProperties } from "@/lib/notion/properties";

/**
 * Traduce la base «📆Hábitos 2026», donde cada hábito es una columna.
 *
 * Ese es exactamente el problema que este módulo existe para arreglar. En
 * Notion, añadir un hábito significa añadir una columna, y el histórico nunca
 * la tiene: por eso el rollup mensual sigue calculando 📵 y 🔞, dos hábitos
 * que ya no están en la tabla de 2026. Aquí un hábito es una fila y una marca
 * es otra, así que se puede empezar, dejar y retomar sin perder nada.
 *
 * La traducción es un giro de la tabla: diez columnas de casilla por 595 días
 * se convierten en diez hábitos y una marca por cada casilla en verdadero.
 * Las casillas en falso no dejan fila -- en este módulo, la ausencia de marca
 * *es* el «no lo hice», y guardar los ceros multiplicaría por diez la tabla
 * para decir lo mismo.
 */

export interface NotionHabitColumn {
  /** El nombre exacto de la columna en Notion. */
  column: string;
  /** Cómo se llama el hábito aquí, ya separado de su emoji. */
  name: string;
  emoji: string | null;
}

/**
 * Las diez columnas de la tabla de 2026, en su orden.
 *
 * Se escriben a mano y no se deducen del esquema porque el emoji y el nombre
 * van pegados en el encabezado («💪🏽15-30 min») y separarlos a ciegas es
 * frágil: hay emojis con modificador de tono de piel, que son varios puntos de
 * código, y uno de ellos («🧘‍♂️») lleva un unificador dentro.
 */
export const HABIT_COLUMNS: NotionHabitColumn[] = [
  { column: "⏰ 7am", name: "7am", emoji: "⏰" },
  { column: "🛌🏽 11pm", name: "11pm", emoji: "🛌" },
  { column: "🦷 2 veces ", name: "2 veces", emoji: "🦷" },
  { column: "📚 10 pag", name: "10 pag", emoji: "📚" },
  { column: "💪🏽15-30 min", name: "15-30 min", emoji: "💪" },
  { column: "💧2ML", name: "2ML", emoji: "💧" },
  { column: "🖥To Do", name: "To Do", emoji: "🖥" },
  { column: "🧘‍♂️15 min", name: "15 min", emoji: "🧘" },
  { column: "🚿1-2", name: "1-2", emoji: "🚿" },
  { column: "Trabajar en las redes", name: "Trabajar en las redes", emoji: "📱" },
];

export interface NotionHabitMark {
  /** El nombre del hábito aquí, que el llamador resuelve a su identificador. */
  habit: string;
  date: string;
}

export interface HabitDayResult {
  date: string;
  marks: NotionHabitMark[];
}

/**
 * Una fila de la tabla -- un día -- convertida en sus marcas.
 *
 * Devuelve también los días sin ninguna casilla marcada, con la lista vacía,
 * porque no es lo mismo un día en el que no cumpliste nada que un día que no
 * llegaste a abrir: el primero cuenta en el porcentaje y el segundo no. Quien
 * llame decide qué hacer con esa diferencia.
 */
export function mapNotionHabitDay(page: {
  id: string;
  properties: NotionProperties;
}): HabitDayResult | null {
  const properties = page.properties ?? {};

  const date = dateStart(findProperty(properties, "Fecha"));
  if (!date) return null;

  const marks: NotionHabitMark[] = [];
  for (const habit of HABIT_COLUMNS) {
    if (checkbox(findProperty(properties, habit.column))) {
      marks.push({ habit: habit.name, date });
    }
  }

  return { date, marks };
}

/** Cuántas casillas marcadas hay por hábito, para el informe de la importación. */
export function countMarksByHabit(days: HabitDayResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const habit of HABIT_COLUMNS) counts[habit.name] = 0;
  for (const day of days) {
    for (const mark of day.marks) counts[mark.habit] = (counts[mark.habit] ?? 0) + 1;
  }
  return counts;
}
