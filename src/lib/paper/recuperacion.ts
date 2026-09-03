import type { Vela } from "@/lib/charts/indicators";

/**
 * Cuántas velas atrasadas se recuperan como mucho en un ciclo.
 *
 * Sesenta es una hora de un bot de un minuto, o dos meses de uno diario. Más
 * de eso ya no es «se me pasaron unas velas», es un bot que estuvo parado
 * mucho tiempo, y recorrer trescientas velas fingiendo que operó durante un
 * apagón inventa un histórico que no ocurrió. Las que quedan fuera del tope
 * se dan por perdidas y la curva sigue desde las últimas sesenta.
 */
export const VELAS_DE_RECUPERACION = 60;

/**
 * Los índices, en orden, de las velas cerradas que aún no se han evaluado.
 *
 * Existe porque el ciclo corre cada cinco minutos y no cada vela. Evaluar
 * sólo la última vela cerrada -- lo que hacía antes -- deja a un bot de un
 * minuto viendo una vela de cada cinco, y a uno de cinco minutos perdiendo
 * las de en medio cuando el reloj se retrasa. Se pierden señales, y peor: un
 * stop que saltó dentro de una vela que nadie miró se comprueba tres velas
 * tarde, contra un precio que ya no es el suyo.
 *
 * `ultimaEvaluada` es la hora de apertura de la última vela con punto en la
 * curva, en segundos. Con `null` -- un bot que nunca se evaluó -- se devuelve
 * sólo la última vela: la primera vez no hay nada que recuperar, y recorrer
 * el histórico entero sería inventarle operaciones anteriores a su
 * encendido.
 *
 * Las velas se asumen ordenadas de más antigua a más reciente, que es como
 * las deja `normalizarVelas`.
 */
export function velasPendientes(
  velas: Vela[],
  ultimaEvaluada: number | null,
  maximo = VELAS_DE_RECUPERACION,
): number[] {
  if (velas.length === 0) return [];
  if (ultimaEvaluada === null) return [velas.length - 1];

  const pendientes: number[] = [];
  for (let i = 0; i < velas.length; i++) {
    if (velas[i].time > ultimaEvaluada) pendientes.push(i);
  }
  // Las más recientes, si hay más de las que se recuperan.
  return pendientes.length > maximo ? pendientes.slice(pendientes.length - maximo) : pendientes;
}

/** La hora de apertura, en segundos, de la última vela cerrada de ese tamaño. */
export function ultimaVelaCerrada(ahoraMs: number, segundosPorVela: number): number {
  const ahora = Math.floor(ahoraMs / 1000);
  return Math.floor(ahora / segundosPorVela) * segundosPorVela - segundosPorVela;
}
