import type { SeriesMarker, SeriesMarkerBar, Time, UTCTimestamp } from "lightweight-charts";

/**
 * De las operaciones de un bot de papel a lo que el gráfico sabe pintar:
 * flechas de entrada y salida, y líneas de nivel para la posición abierta.
 *
 * Es un módulo puro -- sin React, sin DOM, y de la librería de gráficos sólo
 * los tipos -- por dos razones. La primera es que así se prueba: qué flecha
 * lleva cada lado y en qué vela cae es justo lo que se equivoca en silencio
 * (un corto con las flechas de un largo «se ve bien» hasta que uno se fija en
 * que compra arriba y vende abajo), y un componente que crea un canvas no se
 * puede probar sin un navegador. La segunda es que el componente del gráfico
 * se queda sólo con lo suyo: crear el gráfico, pintar lo que le den y limpiar.
 *
 * Las horas llegan como ISO porque así las devuelven las filas de Supabase, y
 * los precios como texto o número porque los `numeric` de Postgres llegan
 * como texto. Aquí se convierte todo una vez y el gráfico no vuelve a pensar
 * en ello.
 */

export interface OperacionMarcable {
  side: "LARGO" | "CORTO";
  horaEntrada: string;
  precioEntrada: string | number;
  horaSalida: string | null;
  precioSalida: string | number | null;
  /**
   * Se acepta para que una fila de `paper_trades` se pueda pasar tal cual,
   * pero no se pinta. Cada flecha con su motivo escrito encima es legible con
   * tres operaciones y una pared de texto que tapa las velas con cien; el
   * detalle de cada una está en la tabla que va debajo del gráfico.
   */
  motivoSalida?: string | null;
}

export interface PosicionMarcable {
  side: "LARGO" | "CORTO";
  horaEntrada: string;
  precioEntrada: string | number;
  stop: string | number | null;
  objetivo: string | number | null;
}

export interface ColoresDeMarcador {
  entrada: string;
  salida: string;
}

export interface LineaDeNivel {
  precio: number;
  titulo: string;
  tipo: "ENTRADA" | "STOP" | "OBJETIVO";
}

// ------------------------------------------------------- filas de Supabase

/** Una fila tal como la devuelven las consultas: el lado es texto suelto. */
interface ConLadoEnTexto {
  side: string;
}

export function esLado(valor: string): valor is "LARGO" | "CORTO" {
  return valor === "LARGO" || valor === "CORTO";
}

/**
 * De filas de `paper_trades` a operaciones marcables.
 *
 * Las filas traen el lado como `string` porque la columna no tiene enum, y el
 * gráfico no puede decidir la flecha con un texto cualquiera. Una fila con
 * otro valor se descarta en vez de pintarse como largo: colapsar lo
 * desconocido a un lado sin avisar es justo el error que ya cometió el motor
 * de backtest con BOTH, y una flecha mal orientada es peor que ninguna.
 */
export function operacionesMarcables(
  filas: (Omit<OperacionMarcable, "side"> & ConLadoEnTexto)[],
): OperacionMarcable[] {
  const resultado: OperacionMarcable[] = [];
  for (const fila of filas) {
    if (!esLado(fila.side)) continue;
    resultado.push({
      side: fila.side,
      horaEntrada: fila.horaEntrada,
      precioEntrada: fila.precioEntrada,
      horaSalida: fila.horaSalida,
      precioSalida: fila.precioSalida,
      motivoSalida: fila.motivoSalida ?? null,
    });
  }
  return resultado;
}

/** De una fila de `paper_positions` a posición marcable; `null` si no hay o el lado no se entiende. */
export function posicionMarcable(
  fila: (Omit<PosicionMarcable, "side"> & ConLadoEnTexto) | null,
): PosicionMarcable | null {
  if (!fila || !esLado(fila.side)) return null;
  return {
    side: fila.side,
    horaEntrada: fila.horaEntrada,
    precioEntrada: fila.precioEntrada,
    stop: fila.stop,
    objetivo: fila.objetivo,
  };
}

// ------------------------------------------------------------------ tiempo

/**
 * La hora de apertura de la vela del gráfico en la que cae un instante.
 *
 * La librería sólo sabe colocar un marcador sobre una vela que existe: un
 * tiempo que no coincide con la apertura de ninguna lo ignora o lo pinta entre
 * dos. Así que una operación abierta a las 14:37 en un gráfico de quince
 * minutos se marca en la vela de las 14:30, que es la que estaba en pantalla.
 *
 * Para las filas que escribe el simulador esto no cambia nada -- guarda como
 * hora de entrada la apertura de la vela que dio la señal --, pero el gráfico
 * puede estar en otra temporalidad que la del bot, y una fila anotada a mano
 * o con la hora del cron acabaría entre dos velas.
 *
 * Devuelve `null` con una fecha que no se entiende: un marcador con tiempo
 * `NaN` hace que la librería tire el gráfico entero, y perder una flecha es
 * mejor que perderlas todas.
 */
export function alinearAVela(iso: string, segundosPorVela: number): UTCTimestamp | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const segundos = Math.floor(ms / 1000);
  // Con una vela de tamaño cero o negativo no hay a qué alinear: se deja el
  // segundo exacto en vez de dividir por cero.
  const tamano = segundosPorVela > 0 ? segundosPorVela : 1;
  return (Math.floor(segundos / tamano) * tamano) as UTCTimestamp;
}

// ---------------------------------------------------------------- flechas

type Flecha = Pick<SeriesMarkerBar<Time>, "position" | "shape">;

/**
 * Qué flecha y a qué lado de la vela.
 *
 * Se razona por lo que se hace con el dinero y no por «entrada» o «salida»:
 * una compra es una flecha hacia arriba bajo la vela, una venta es una flecha
 * hacia abajo sobre ella. Un largo se abre comprando y se cierra vendiendo; un
 * corto es el espejo exacto. Escrito así el corto no puede quedarse con las
 * flechas del largo, que es el error que tuvo el gráfico de operaciones antes
 * de arreglarse.
 */
function flecha(side: "LARGO" | "CORTO", momento: "ENTRADA" | "SALIDA"): Flecha {
  const esCompra = (side === "LARGO") === (momento === "ENTRADA");
  return esCompra
    ? { position: "belowBar", shape: "arrowUp" }
    : { position: "aboveBar", shape: "arrowDown" };
}

/**
 * Los marcadores de todas las operaciones cerradas y de la posición abierta.
 *
 * Ordenados por tiempo ascendente porque la librería lo exige, con un orden
 * estable para que la entrada quede antes que la salida cuando las dos caen en
 * la misma vela. Si dos marcadores coinciden en vela y lado se dejan los dos:
 * la librería los apila, y dos flechas apiladas cuentan que ahí pasaron dos
 * cosas -- un cierre y una reentrada en la misma vela, por ejemplo.
 *
 * La posición abierta sólo lleva su flecha de entrada. Su salida todavía no
 * existe, y sus niveles van como líneas, no como flechas: ver `lineasDe`.
 */
export function marcadoresDe(
  operaciones: OperacionMarcable[],
  posicion: PosicionMarcable | null,
  colores: ColoresDeMarcador,
  segundosPorVela: number,
): SeriesMarker<Time>[] {
  const marcadores: SeriesMarker<Time>[] = [];

  for (const operacion of operaciones) {
    const entrada = alinearAVela(operacion.horaEntrada, segundosPorVela);
    if (entrada !== null) {
      marcadores.push({ time: entrada, ...flecha(operacion.side, "ENTRADA"), color: colores.entrada });
    }
    if (operacion.horaSalida !== null) {
      const salida = alinearAVela(operacion.horaSalida, segundosPorVela);
      if (salida !== null) {
        marcadores.push({ time: salida, ...flecha(operacion.side, "SALIDA"), color: colores.salida });
      }
    }
  }

  if (posicion) {
    const entrada = alinearAVela(posicion.horaEntrada, segundosPorVela);
    if (entrada !== null) {
      marcadores.push({ time: entrada, ...flecha(posicion.side, "ENTRADA"), color: colores.entrada });
    }
  }

  marcadores.sort((a, b) => (a.time as number) - (b.time as number));
  return marcadores;
}

// ----------------------------------------------------------------- líneas

/** Un `numeric` de Postgres, o un número, a número; `null` si no hay o no vale. */
function aNumero(valor: string | number | null): number | null {
  if (valor === null) return null;
  if (typeof valor === "string" && valor.trim() === "") return null;
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * Las líneas de nivel de la posición abierta: entrada, stop y objetivo.
 *
 * Sólo de la abierta. Las cerradas ya tienen sus dos flechas y con cien
 * operaciones trescientas líneas horizontales taparían el precio; lo que
 * importa de una posición viva es a cuánto entró y dónde la cerrará el
 * simulador, y eso sólo se lee bien como línea que cruza todo el ancho.
 *
 * Un nivel que no exista (una estrategia sin stop, sin objetivo) no produce
 * línea en vez de producir una en cero.
 */
export function lineasDe(posicion: PosicionMarcable | null): LineaDeNivel[] {
  if (!posicion) return [];

  const lineas: LineaDeNivel[] = [];

  const entrada = aNumero(posicion.precioEntrada);
  if (entrada !== null) lineas.push({ precio: entrada, titulo: "Entrada", tipo: "ENTRADA" });

  const stop = aNumero(posicion.stop);
  if (stop !== null) lineas.push({ precio: stop, titulo: "Stop", tipo: "STOP" });

  const objetivo = aNumero(posicion.objetivo);
  if (objetivo !== null) lineas.push({ precio: objetivo, titulo: "Objetivo", tipo: "OBJETIVO" });

  return lineas;
}
