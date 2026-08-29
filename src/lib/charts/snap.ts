/**
 * El imán: pegar un clic al precio de la vela que tiene debajo.
 *
 * Sin esto, una línea de soporte trazada «sobre el mínimo» queda tres píxeles
 * por debajo del mínimo real, y al volver semanas después no coincide con
 * nada -- la línea dice una cosa y la vela otra. Con el imán, un soporte
 * trazado sobre un mínimo está *en* el mínimo, que es lo que se quiso decir.
 *
 * Se pega a los cuatro precios que existen de verdad en una vela -- apertura,
 * máximo, mínimo y cierre -- y no a una rejilla de precios redondos: lo que se
 * marca en un gráfico son niveles que el precio tocó, no números bonitos.
 *
 * Puro: no sabe de canvas ni de píxeles.
 */

export interface SnapCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SnapPoint {
  time: number;
  price: number;
}

/**
 * El punto pegado a la vela más cercana en el tiempo, y dentro de ella al
 * precio más cercano de los cuatro.
 *
 * Si no hay velas se devuelve el punto tal cual: el imán es una ayuda, no un
 * requisito, y un gráfico todavía sin datos tiene que dejar dibujar igual.
 */
export function snapToCandle(point: SnapPoint, candles: SnapCandle[]): SnapPoint {
  const vela = velaMasCercana(point.time, candles);
  if (!vela) return point;

  let mejorPrecio = vela.open;
  let mejorDistancia = Math.abs(point.price - vela.open);
  for (const candidato of [vela.high, vela.low, vela.close]) {
    const distancia = Math.abs(point.price - candidato);
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia;
      mejorPrecio = candidato;
    }
  }

  return { time: vela.time, price: mejorPrecio };
}

/**
 * La vela cuyo momento está más cerca del clic.
 *
 * Búsqueda binaria porque la lista viene ordenada y puede tener cientos de
 * velas, y esto corre en cada clic mientras se dibuja.
 */
function velaMasCercana(time: number, candles: SnapCandle[]): SnapCandle | null {
  if (candles.length === 0) return null;

  let bajo = 0;
  let alto = candles.length - 1;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1;
    if (candles[medio].time < time) bajo = medio + 1;
    else alto = medio;
  }

  // `bajo` es la primera vela que no es anterior al clic; la de antes puede
  // estar más cerca, así que se comparan las dos.
  const derecha = candles[bajo];
  const izquierda = candles[Math.max(0, bajo - 1)];
  return Math.abs(derecha.time - time) < Math.abs(izquierda.time - time) ? derecha : izquierda;
}
