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

  const velas = velasDeCoinbase(crudo);

  const ahora = Date.now();
  const utiles = incluirEnCurso ? velas : velas.filter((v) => v.time + segundos * 1000 <= ahora);

  return utiles.slice(-limite);
}

/**
 * Lo que manda Coinbase, convertido en velas y en orden cronológico.
 *
 * Suelto porque lo usan las dos formas de pedir --la última tanda y el
 * histórico paginado-- y porque el orden de los campos de cada fila es lo
 * bastante raro como para no querer escribirlo dos veces.
 */
function velasDeCoinbase(crudo: unknown): Vela[] {
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
  return velas.sort((a, b) => a.time - b.time);
}

/** La hora de apertura de la última vela cerrada, para saber si ya se evaluó. */
export function horaUltimaVelaCerrada(velas: Vela[]): number | null {
  return velas.length > 0 ? velas[velas.length - 1].time : null;
}

/**
 * Cuántas páginas de trescientas velas se piden como mucho.
 *
 * Coinbase devuelve trescientas por petición, así que un histórico largo son
 * varias llamadas encadenadas. El tope existe porque esto lo dispara una
 * persona desde una pantalla y espera: doce páginas son unos tres segundos y
 * tres mil seiscientas velas, que para una estrategia diaria son diez años y
 * para una de cinco minutos doce días. Más allá, lo que falta no es histórico
 * sino paciencia.
 */
const MAX_PAGINAS = 12;

/** Lo que se espera entre páginas, para no chocar con el límite de la API pública. */
const PAUSA_ENTRE_PAGINAS_MS = 120;

/**
 * Un histórico largo, encadenando peticiones hacia atrás.
 *
 * `velasPublicas` trae lo último y con eso le basta al ciclo del simulador,
 * que sólo mira las velas nuevas. Medir una estrategia es otra cosa: con
 * trescientas velas de cinco minutos se mide un día, y un día no dice nada de
 * una estrategia. Así que aquí se pagina.
 *
 * Devuelve lo que haya podido traer, aunque sea menos de lo pedido. Un
 * histórico corto es una medición con menos velas --y la pantalla dice cuántas
 * fueron--, mientras que fallar entero deja la estrategia sin medir por un
 * corte de red. Igual que `velasPublicas`, no lanza nunca.
 */
export async function velasHistoricas(
  productId: string,
  granularidad: GranularidadPublica,
  objetivo: number,
): Promise<Vela[]> {
  const segundos = SEGUNDOS_POR_GRANULARIDAD[granularidad];
  const porPagina = MAX_VELAS_POR_PETICION;

  const paginas = Math.min(MAX_PAGINAS, Math.ceil(objetivo / porPagina));
  const porHora = new Map<number, Vela>();

  let fin = Math.floor(Date.now() / 1000);

  for (let pagina = 0; pagina < paginas; pagina += 1) {
    const inicio = fin - porPagina * segundos;
    const lote = await unaPagina(productId, segundos, inicio, fin);

    // Una página vacía significa que se acabó el histórico del producto. Seguir
    // pidiendo hacia atrás sólo gasta llamadas para recibir más vacíos.
    if (lote.length === 0) break;

    for (const vela of lote) porHora.set(vela.time, vela);

    // Desde la más antigua de esta página, no desde `inicio`: si la fuente
    // devolvió menos de lo pedido --un fin de semana, un hueco-- restar la
    // ventana entera se saltaría velas que sí existen.
    const masAntigua = Math.min(...lote.map((v) => v.time / 1000));
    fin = masAntigua - segundos;

    if (pagina < paginas - 1) await esperar(PAUSA_ENTRE_PAGINAS_MS);
  }

  const ahora = Date.now();
  return [...porHora.values()]
    .filter((v) => v.time + segundos * 1000 <= ahora)
    .sort((a, b) => a.time - b.time)
    .slice(-objetivo);
}

function esperar(ms: number): Promise<void> {
  return new Promise((listo) => setTimeout(listo, ms));
}

/** Una ventana suelta, ya normalizada. Devuelve vacío si falla, como el resto. */
async function unaPagina(
  productId: string,
  segundos: number,
  inicio: number,
  fin: number,
): Promise<Vela[]> {
  const url =
    `${BASE}/products/${encodeURIComponent(productId)}/candles` +
    `?granularity=${segundos}&start=${inicio}&end=${fin}`;

  try {
    const respuesta = await fetch(url, { headers: { accept: "application/json" } });
    if (!respuesta.ok) return [];
    return velasDeCoinbase(await respuesta.json());
  } catch {
    return [];
  }
}
