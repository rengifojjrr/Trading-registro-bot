/**
 * Velas de mercado sin credenciales, para el simulador de bots.
 *
 * Existe aparte de `fetch-trade-candles.ts` por una razón concreta: aquélla
 * necesita las claves CDP y que el venue sea FCM, y devuelve `null` si falta
 * cualquiera de las dos cosas. Para el gráfico de una operación real eso está
 * bien -- si no hay conexión con Coinbase tampoco hay operación que pintar --,
 * pero el simulador opera con dinero ficticio y tiene que funcionar en un
 * despliegue que todavía no ha conectado ninguna cuenta. Si dependiera de las
 * claves, la primera pantalla que ve alguien que acaba de clonar el proyecto
 * estaría vacía.
 *
 * Usa la API pública de Coinbase Exchange, que no pide autenticación para datos
 * de mercado. Su formato es distinto del de Advanced Trade: devuelve tuplas en
 * vez de objetos y las ordena de más reciente a más antigua.
 */

import type { Vela } from "@/lib/charts/indicators";

const BASE = "https://api.exchange.coinbase.com";

/**
 * Las granularidades que sirve la API pública, en segundos.
 *
 * No están todas las de `CoinbaseCandleGranularity`: el endpoint público
 * rechaza 30 minutos, 2 horas y 4 horas. Por eso este tipo es más corto y no
 * reutiliza aquél -- prometer una granularidad que la fuente no da es un error
 * en tiempo de ejecución esperando a ocurrir.
 */
export type GranularidadPublica = "1m" | "5m" | "15m" | "1h" | "6h" | "1d";

export const SEGUNDOS_POR_GRANULARIDAD: Record<GranularidadPublica, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "6h": 21600,
  "1d": 86400,
};

export const ETIQUETA_GRANULARIDAD: Record<GranularidadPublica, string> = {
  "1m": "1 minuto",
  "5m": "5 minutos",
  "15m": "15 minutos",
  "1h": "1 hora",
  "6h": "6 horas",
  "1d": "1 día",
};

export function esGranularidadPublica(valor: string): valor is GranularidadPublica {
  return valor in SEGUNDOS_POR_GRANULARIDAD;
}

/** El máximo que devuelve el endpoint de una vez. Pedir más se ignora en silencio. */
const MAX_VELAS_POR_PETICION = 300;

/**
 * Las últimas `limite` velas cerradas de un producto.
 *
 * Devuelve un array VACÍO si algo falla, nunca lanza. El simulador corre desde
 * un cron cada cinco minutos y un fallo de red en un producto no puede tumbar
 * el ciclo de los demás bots.
 *
 * La última vela que devuelve Coinbase es la que está EN CURSO, y esa se
 * descarta aquí. Una señal leída sobre una vela a medio formar desaparece
 * cuando la vela se cierra distinta, y un simulador que las lea así se da a sí
 * mismo información que no tendría en vivo.
 */
export async function velasPublicas(
  productId: string,
  granularidad: GranularidadPublica,
  limite = 300,
  /**
   * Devolver también la vela que se está formando.
   *
   * Falso para el simulador, por lo dicho arriba. Verdadero sólo para PINTAR:
   * un gráfico diario que corta en la última vela cerrada parece congelado en
   * el día de ayer durante veinticuatro horas, y quien lo mira concluye que el
   * bot no funciona. Verla formarse es lo que hace cualquier gráfico de
   * mercado. Lo que no puede es entrar en una decisión, y por eso es un
   * parámetro y no el comportamiento por defecto.
   */
  incluirEnCurso = false,
): Promise<Vela[]> {
  const segundos = SEGUNDOS_POR_GRANULARIDAD[granularidad];
  const cuantas = Math.min(limite + 1, MAX_VELAS_POR_PETICION);

  // Se pide por ventana de tiempo y no por número de velas porque el endpoint
  // no acepta un parámetro de cantidad: acota con start/end o devuelve las 300
  // últimas. Pedir la ventana exacta evita depender de ese comportamiento.
  const fin = Math.floor(Date.now() / 1000);
  const inicio = fin - cuantas * segundos;

  const url =
    `${BASE}/products/${encodeURIComponent(productId)}/candles` +
    `?granularity=${segundos}&start=${inicio}&end=${fin}`;

  let crudo: unknown;
  try {
    const respuesta = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "trading-registro-bot" },
      // El simulador siempre quiere el dato de ahora; una respuesta cacheada
      // le haría evaluar dos veces la misma vela creyendo que es nueva.
      cache: "no-store",
    });
    if (!respuesta.ok) {
      console.error(`[velasPublicas] ${productId} ${granularidad}: HTTP ${respuesta.status}`);
      return [];
    }
    crudo = await respuesta.json();
  } catch (error) {
    console.error(`[velasPublicas] ${productId} ${granularidad}:`, error);
    return [];
  }

  if (!Array.isArray(crudo)) return [];

  const velas: Vela[] = [];
  for (const fila of crudo) {
    // Cada fila es [tiempo, mínimo, máximo, apertura, cierre, volumen]. Ese
    // orden no es el habitual -- el mínimo va antes que el máximo y la apertura
    // después de los dos -- así que conviene no leerlo de memoria.
    if (!Array.isArray(fila) || fila.length < 6) continue;
    const [t, low, high, open, close, volume] = fila as unknown[];
    if (
      typeof t !== "number" ||
      typeof low !== "number" ||
      typeof high !== "number" ||
      typeof open !== "number" ||
      typeof close !== "number"
    ) {
      continue;
    }
    velas.push({
      time: t * 1000,
      open,
      high,
      low,
      close,
      volume: typeof volume === "number" ? volume : 0,
    });
  }

  // Coinbase las manda de más reciente a más antigua y todo lo demás en este
  // repositorio (indicadores, motor de backtest) asume orden cronológico.
  velas.sort((a, b) => a.time - b.time);

  const ahora = Date.now();
  const utiles = incluirEnCurso ? velas : velas.filter((v) => v.time + segundos * 1000 <= ahora);

  return utiles.slice(-limite);
}

/** La hora de apertura de la última vela cerrada, para saber si ya se evaluó. */
export function horaUltimaVelaCerrada(velas: Vela[]): number | null {
  return velas.length > 0 ? velas[velas.length - 1].time : null;
}
