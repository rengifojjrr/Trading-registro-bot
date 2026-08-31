/**
 * Dónde cae el cero dentro de una curva, en tanto por uno desde arriba.
 *
 * Es lo que permite pintar de verde lo que está por encima de cero y de rojo
 * lo que está por debajo, en la **misma** línea. Antes el color salía del valor
 * final: una curva que pasó tres meses en positivo y acabó en negativo se
 * pintaba roja entera, y el tramo bueno --que es justo lo que hay que mirar
 * para saber qué se hizo bien-- se leía como parte de la caída.
 *
 * El degradado de un SVG se reparte sobre la caja del propio trazo, no sobre
 * los ejes, así que el corte se calcula con el máximo y el mínimo **de los
 * datos** y no con el dominio del eje -- que Recharts redondea hacia fuera para
 * que las marcas queden en números limpios. Usar el dominio dejaría el corte
 * unos píxeles por encima o por debajo del cero de verdad, y en una curva que
 * roza el cero eso se ve.
 *
 * Puro.
 */
export function zeroOffset(values: number[]): number {
  if (values.length === 0) return 1;

  const max = Math.max(...values);
  const min = Math.min(...values);

  // Nunca estuvo en positivo: todo rojo. El cero queda en el borde de arriba.
  if (max <= 0) return 0;
  // Nunca estuvo en negativo: todo verde.
  if (min >= 0) return 1;

  return max / (max - min);
}
