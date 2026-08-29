/**
 * Los indicadores, calculados de las velas que ya hay.
 *
 * Ninguno pide nada a Coinbase: todos salen de la misma serie de velas que el
 * gráfico ya tiene cargada. Eso importa más de lo que parece -- un indicador
 * que necesita otra llamada es uno que a veces no está, y un gráfico donde la
 * media a veces no aparece es peor que uno sin medias.
 *
 * Funciones puras sobre listas de números, separadas del lienzo igual que la
 * geometría: es donde puede estar el error -- un RSI que no arranca donde
 * debe, un ATR que usa el rango de la vela en vez del rango verdadero -- y esa
 * parte se prueba sin navegador.
 *
 * Todas devuelven una lista de la misma longitud que la entrada, con `null` en
 * las posiciones donde el indicador todavía no tiene datos suficientes. Es
 * deliberado: recortar la lista obligaría a quien pinta a llevar la cuenta del
 * desfase, y ese desfase mal llevado es exactamente cómo una media acaba
 * dibujada dos velas corrida.
 */

export interface Vela {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Serie = (number | null)[];

/**
 * Media móvil simple.
 *
 * Con suma corrediza y no recalculando la ventana entera en cada punto: sobre
 * trescientas velas da igual, pero el mismo código corre sobre el histórico
 * completo en el backtest.
 */
export function sma(valores: number[], periodo: number): Serie {
  if (periodo < 1) return valores.map(() => null);

  const salida: Serie = new Array(valores.length).fill(null);
  let suma = 0;

  for (let i = 0; i < valores.length; i += 1) {
    suma += valores[i];
    if (i >= periodo) suma -= valores[i - periodo];
    if (i >= periodo - 1) salida[i] = suma / periodo;
  }

  return salida;
}

/**
 * Media móvil exponencial.
 *
 * Arranca con la simple del primer periodo en vez de con el primer valor
 * suelto: empezando por un solo precio, las primeras decenas de velas salen
 * arrastradas hacia él y la media dibuja una curva que no existe.
 */
export function ema(valores: number[], periodo: number): Serie {
  if (periodo < 1) return valores.map(() => null);

  const salida: Serie = new Array(valores.length).fill(null);
  if (valores.length < periodo) return salida;

  const k = 2 / (periodo + 1);
  let previa = valores.slice(0, periodo).reduce((s, v) => s + v, 0) / periodo;
  salida[periodo - 1] = previa;

  for (let i = periodo; i < valores.length; i += 1) {
    previa = valores[i] * k + previa * (1 - k);
    salida[i] = previa;
  }

  return salida;
}

/**
 * VWAP: precio medio ponderado por volumen, acumulado desde el principio de
 * la sesión.
 *
 * Se reinicia cada día, que es lo que lo hace útil en intradía: un VWAP
 * acumulado desde hace tres meses no es un nivel, es una constante. El corte
 * se hace por día natural en la zona que se le pase, porque «la sesión» de un
 * futuro de Bitcoin no tiene campana.
 */
export function vwap(velas: Vela[], sessionOf: (time: number) => string): Serie {
  const salida: Serie = new Array(velas.length).fill(null);
  let sesion: string | null = null;
  let acumuladoPV = 0;
  let acumuladoV = 0;

  for (let i = 0; i < velas.length; i += 1) {
    const v = velas[i];
    const actual = sessionOf(v.time);
    if (actual !== sesion) {
      sesion = actual;
      acumuladoPV = 0;
      acumuladoV = 0;
    }

    // El típico: (máximo + mínimo + cierre) / 3, no el cierre suelto.
    const tipico = (v.high + v.low + v.close) / 3;
    acumuladoPV += tipico * v.volume;
    acumuladoV += v.volume;

    // Sin volumen no hay precio ponderado por volumen. Devolver el típico
    // sería inventar un nivel donde no se negoció nada.
    salida[i] = acumuladoV > 0 ? acumuladoPV / acumuladoV : null;
  }

  return salida;
}

/**
 * RSI de Wilder.
 *
 * Con el suavizado de Wilder, no con medias simples: son dos indicadores
 * distintos que se llaman igual, y el que dibuja todo el mundo -- y contra el
 * que compararías este -- es el de Wilder.
 */
export function rsi(valores: number[], periodo = 14): Serie {
  const salida: Serie = new Array(valores.length).fill(null);
  if (valores.length <= periodo) return salida;

  let subidas = 0;
  let bajadas = 0;
  for (let i = 1; i <= periodo; i += 1) {
    const cambio = valores[i] - valores[i - 1];
    if (cambio >= 0) subidas += cambio;
    else bajadas -= cambio;
  }
  let mediaSubidas = subidas / periodo;
  let mediaBajadas = bajadas / periodo;
  salida[periodo] = valorRsi(mediaSubidas, mediaBajadas);

  for (let i = periodo + 1; i < valores.length; i += 1) {
    const cambio = valores[i] - valores[i - 1];
    const subida = cambio > 0 ? cambio : 0;
    const bajada = cambio < 0 ? -cambio : 0;
    mediaSubidas = (mediaSubidas * (periodo - 1) + subida) / periodo;
    mediaBajadas = (mediaBajadas * (periodo - 1) + bajada) / periodo;
    salida[i] = valorRsi(mediaSubidas, mediaBajadas);
  }

  return salida;
}

function valorRsi(mediaSubidas: number, mediaBajadas: number): number {
  // Sin bajadas el RSI es 100 por definición, y dividir daría infinito.
  if (mediaBajadas === 0) return mediaSubidas === 0 ? 50 : 100;
  const rs = mediaSubidas / mediaBajadas;
  return 100 - 100 / (1 + rs);
}

/**
 * ATR: rango verdadero medio, con el suavizado de Wilder.
 *
 * El rango *verdadero* es el mayor de tres: el rango de la vela, y las dos
 * distancias del cierre anterior a sus extremos. Usar sólo máximo menos mínimo
 * ignora los huecos, que es justo cuando el ATR importa.
 */
export function atr(velas: Vela[], periodo = 14): Serie {
  const salida: Serie = new Array(velas.length).fill(null);
  if (velas.length <= periodo) return salida;

  const rangos: number[] = [0];
  for (let i = 1; i < velas.length; i += 1) {
    rangos.push(rangoVerdadero(velas[i], velas[i - 1].close));
  }

  let media = rangos.slice(1, periodo + 1).reduce((s, v) => s + v, 0) / periodo;
  salida[periodo] = media;

  for (let i = periodo + 1; i < velas.length; i += 1) {
    media = (media * (periodo - 1) + rangos[i]) / periodo;
    salida[i] = media;
  }

  return salida;
}

export function rangoVerdadero(vela: Vela, cierreAnterior: number): number {
  return Math.max(
    vela.high - vela.low,
    Math.abs(vela.high - cierreAnterior),
    Math.abs(vela.low - cierreAnterior),
  );
}

// ------------------------------------------------------------- el catálogo

export type IndicatorId =
  | "EMA9"
  | "EMA21"
  | "EMA50"
  | "SMA200"
  | "VWAP"
  | "RSI14"
  | "ATR14";

/** Dónde va pintado: sobre las velas o en su propio panel de abajo. */
export type IndicatorPane = "PRECIO" | "PANEL";

export interface IndicatorMeta {
  id: IndicatorId;
  label: string;
  hint: string;
  pane: IndicatorPane;
  /** El token de color del tema, para que sigan la paleta. */
  colorToken: string;
}

/**
 * Los siete que se miran de verdad al revisar una operación.
 *
 * Deliberadamente corta. Una lista de cuarenta indicadores es una lista que no
 * se lee: los que faltan se añaden el día que hagan falta, y hasta entonces
 * cada uno que sobra es ruido en un desplegable.
 */
export const INDICATORS: IndicatorMeta[] = [
  {
    id: "EMA9",
    label: "EMA 9",
    hint: "La rápida. Sigue el precio de cerca.",
    pane: "PRECIO",
    colorToken: "--primary",
  },
  {
    id: "EMA21",
    label: "EMA 21",
    hint: "La de referencia en intradía.",
    pane: "PRECIO",
    colorToken: "--warning",
  },
  {
    id: "EMA50",
    label: "EMA 50",
    hint: "La tendencia de fondo del día.",
    pane: "PRECIO",
    colorToken: "--mod-content",
  },
  {
    id: "SMA200",
    label: "SMA 200",
    hint: "La de siempre: por encima o por debajo cambia el sesgo.",
    pane: "PRECIO",
    colorToken: "--muted-foreground",
  },
  {
    id: "VWAP",
    label: "VWAP",
    hint: "Precio medio ponderado por volumen, desde que empieza el día.",
    pane: "PRECIO",
    colorToken: "--mod-tasks",
  },
  {
    id: "RSI14",
    label: "RSI 14",
    hint: "Fuerza relativa. Encima de 70 o debajo de 30 llama la atención.",
    pane: "PANEL",
    colorToken: "--primary",
  },
  {
    id: "ATR14",
    label: "ATR 14",
    hint: "Cuánto se mueve de media. Sirve para poner el stop.",
    pane: "PANEL",
    colorToken: "--warning",
  },
];

export const INDICATOR_BY_ID: Record<IndicatorId, IndicatorMeta> = Object.fromEntries(
  INDICATORS.map((i) => [i.id, i]),
) as Record<IndicatorId, IndicatorMeta>;

export function isIndicatorId(value: string): value is IndicatorId {
  return INDICATORS.some((i) => i.id === value);
}

/**
 * La serie de un indicador sobre unas velas.
 *
 * Un solo sitio que sepa qué cálculo corresponde a cada identificador: sin
 * esto, el gráfico y el backtest tendrían cada uno su `switch`, y el día que
 * uno cambie el otro se queda calculando lo de antes.
 */
export function computeIndicator(
  id: IndicatorId,
  velas: Vela[],
  sessionOf: (time: number) => string,
): Serie {
  const cierres = velas.map((v) => v.close);

  switch (id) {
    case "EMA9":
      return ema(cierres, 9);
    case "EMA21":
      return ema(cierres, 21);
    case "EMA50":
      return ema(cierres, 50);
    case "SMA200":
      return sma(cierres, 200);
    case "VWAP":
      return vwap(velas, sessionOf);
    case "RSI14":
      return rsi(cierres, 14);
    case "ATR14":
      return atr(velas, 14);
  }
}
