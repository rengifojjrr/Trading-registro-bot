/**
 * Horas del reloj como número decimal.
 *
 * Vive en el núcleo y no en sueño porque el problema no es del sueño: es de
 * cualquier gráfica cuyo eje sean horas del día. Una serie de horas
 * cronometradas -- a qué hora te acuestas, a qué hora publicas, a qué hora
 * entras al mercado -- necesita ser un número para dibujarse y una hora para
 * leerse, y esa ida y vuelta es esto.
 */

/**
 * Estira la madrugada por encima de las 24.
 *
 * Sin esto, acostarse a las 23:30 una noche y a las 00:30 la siguiente dibuja
 * una caída de veintitrés horas: el eje salta de 23 a 0 y la línea se
 * desploma justo cuando el cambio real fue de una hora. Contando la madrugada
 * como 24, 25, 26 la línea sube un poco, que es lo que de verdad pasó.
 *
 * `cutoffHour` marca a partir de qué hora se considera «el día anterior
 * continúa». Para acostarse son las 12:00, porque nadie se acuesta a mediodía.
 */
export function stretchPastMidnight(hours: number, cutoffHour = 12): number {
  return hours < cutoffHour ? hours + 24 : hours;
}

/** Convierte 25,5 en «01:30». Acepta las horas estiradas y las normales. */
export function formatClockHours(value: number): string {
  const normalised = ((value % 24) + 24) % 24;
  const hour = Math.floor(normalised);
  const minute = Math.round((normalised - hour) * 60);
  // Redondear 23,999 da 24:00; se corrige en lugar de mostrarlo.
  if (minute === 60) return `${String((hour + 1) % 24).padStart(2, "0")}:00`;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
