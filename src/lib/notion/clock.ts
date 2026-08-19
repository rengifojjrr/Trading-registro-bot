/**
 * Las horas del reloj, tal como están escritas en Notion.
 *
 * En las bases del usuario la hora de acostarse y la de levantarse son listas
 * de opciones escritas a mano a lo largo de meses, así que conviven catorce
 * formas de decir lo mismo: «2am», «2:40 am», «12:30 am», «10:30am», «12 pm»,
 * «1:am» (con los dos puntos y sin minutos) y «7:30» (sin am ni pm).
 *
 * Eso no es un descuido que haya que corregir en Notion: es lo que hay, y una
 * importación que sólo entienda el formato bonito perdería la mitad de las
 * noches. Se interpreta aquí, una vez, con tests para cada forma real.
 */

export interface Clock {
  hour: number;
  minute: number;
}

const PATTERN = /^(\d{1,2})\s*(?::\s*(\d{1,2})?)?\s*(am|pm|a\.?m\.?|p\.?m\.?)?$/i;

/**
 * Interpreta una etiqueta de hora.
 *
 * Sin am ni pm, las horas de 1 a 11 se leen como de la mañana y las 12 como
 * del mediodía. Es la lectura correcta para la columna en que aparece el caso
 * -- la hora de levantarse -- donde «7:30» sólo puede ser por la mañana y
 * «12:30», mediodía. Devuelve null antes que adivinar cualquier otra cosa.
 */
export function parseClockLabel(label: string | null): Clock | null {
  if (!label) return null;

  const match = label.trim().toLowerCase().replace(/\./g, "").match(PATTERN);
  if (!match) return null;

  const rawHour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.replace(/[^ap]/g, "") ?? null;

  if (rawHour < 1 || rawHour > 24 || minute > 59) return null;

  // Sin meridiem: 12 es mediodía, el resto es de mañana.
  if (meridiem === null) {
    if (rawHour > 12) return { hour: rawHour % 24, minute };
    return { hour: rawHour === 12 ? 12 : rawHour, minute };
  }

  if (rawHour > 12) return null;

  // 12am son las cero y 12pm las doce; el resto suma doce por la tarde.
  const hour = rawHour === 12 ? (meridiem === "a" ? 0 : 12) : rawHour + (meridiem === "p" ? 12 : 0);
  return { hour, minute };
}

/** «HH:MM», lo que espera un <input type="time"> y el resolutor de sueño. */
export function formatClock(clock: Clock | null): string | null {
  if (!clock) return null;
  return `${String(clock.hour).padStart(2, "0")}:${String(clock.minute).padStart(2, "0")}`;
}
