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

/**
 * Máximo o mínimo de una ventana móvil, con la ventana desplazada si hace
 * falta.
 *
 * Con una cola de candidatos y no recorriendo la ventana entera en cada vela:
 * un canal de 55 mirado a lo bruto son cincuenta y cinco comparaciones por
 * vela, y ese coste se paga entero en cada pasada de un barrido de
 * parámetros, no una vez.
 *
 * `desplazamiento` es cuántas velas antes de la actual **termina** la ventana.
 * Con cero entra la vela en curso; con uno se queda fuera.
 */
function extremoMovil(
  valores: number[],
  periodo: number,
  desplazamiento: number,
  mejorQue: (candidato: number, vigente: number) => boolean,
): Serie {
  if (periodo < 1 || desplazamiento < 0) return valores.map(() => null);

  const salida: Serie = new Array(valores.length).fill(null);
  // Los índices de los únicos valores que todavía pueden llegar a ser el
  // extremo: el primero lo es ahora y los de detrás lo serán cuando él salga
  // por la izquierda. Cualquier otro está tapado por uno posterior y mejor, y
  // como es posterior sobrevivirá más tiempo: nunca volverá a mandar.
  const candidatos: number[] = [];

  for (let i = 0; i < valores.length; i += 1) {
    const fin = i - desplazamiento;
    if (fin >= 0) {
      while (
        candidatos.length > 0 &&
        mejorQue(valores[fin], valores[candidatos[candidatos.length - 1]])
      ) {
        candidatos.pop();
      }
      candidatos.push(fin);
    }

    const inicio = fin - periodo + 1;
    while (candidatos.length > 0 && candidatos[0] < inicio) candidatos.shift();

    if (inicio >= 0 && candidatos.length > 0) salida[i] = valores[candidatos[0]];
  }

  return salida;
}

export function maximoMovil(valores: number[], periodo: number, desplazamiento = 0): Serie {
  return extremoMovil(valores, periodo, desplazamiento, (candidato, vigente) => candidato >= vigente);
}

export function minimoMovil(valores: number[], periodo: number, desplazamiento = 0): Serie {
  return extremoMovil(valores, periodo, desplazamiento, (candidato, vigente) => candidato <= vigente);
}

/**
 * Canal de Donchian: el máximo de los máximos de las últimas `periodo` velas,
 * **sin contar la que está en curso**.
 *
 * El desplazamiento de uno no es un detalle de implementación, es lo que hace
 * que el canal sirva de algo. Si la vela actual entrara en su propio canal, su
 * máximo sería a lo sumo el máximo del canal, y «el precio rompe por encima
 * del canal» no podría pasar jamás: la ruptura se estaría comparando consigo
 * misma. Es un fallo que no da error ni pinta raro -- el canal se ve
 * perfectamente normal -- y que en el backtest sólo se nota como «cero
 * operaciones», que es justo lo que uno achaca a la estrategia y no al canal.
 */
export function donchianAlto(velas: Vela[], periodo: number): Serie {
  return maximoMovil(
    velas.map((v) => v.high),
    periodo,
    1,
  );
}

export function donchianBajo(velas: Vela[], periodo: number): Serie {
  return minimoMovil(
    velas.map((v) => v.low),
    periodo,
    1,
  );
}

/**
 * SuperTrend: la banda de ATR del lado donde está la tendencia.
 *
 * Devuelve una sola serie -- la banda activa -- y no el lado además, porque
 * el lado se lee del dibujo: si la línea va por debajo del precio la
 * tendencia es alcista, y esa es exactamente la comparación que hace una
 * condición («cierre mayor que SUPERTREND»). Guardar el lado aparte sería un
 * segundo dato que puede contradecir al primero.
 *
 * Las bandas sólo se aprietan contra el precio mientras la tendencia aguanta,
 * nunca se aflojan: sin ese trinquete la línea se separaría en cada vela
 * ancha y el indicador dejaría de ser un stop que sube.
 *
 * Por defecto ATR 10 y factor 1,5, que es la configuración que quedó validada
 * en el estudio; los parámetros siguen abiertos para poder barrerlos, pero el
 * catálogo ofrece esa.
 */
export function supertrend(velas: Vela[], periodo = 10, factor = 1.5): Serie {
  const salida: Serie = new Array(velas.length).fill(null);
  const rangoMedio = atr(velas, periodo);

  let superiorPrevia: number | null = null;
  let inferiorPrevia: number | null = null;
  let alcista = false;

  for (let i = 0; i < velas.length; i += 1) {
    const medida = rangoMedio[i];
    if (medida === null) continue;

    const medio = (velas[i].high + velas[i].low) / 2;
    let superior = medio + factor * medida;
    let inferior = medio - factor * medida;

    const cierreAnterior = i > 0 ? velas[i - 1].close : velas[i].close;

    if (superiorPrevia !== null && inferiorPrevia !== null) {
      // La banda de arriba sólo baja, salvo que el precio la haya roto y toque
      // empezar de cero; la de abajo, al revés.
      if (superior >= superiorPrevia && cierreAnterior <= superiorPrevia) superior = superiorPrevia;
      if (inferior <= inferiorPrevia && cierreAnterior >= inferiorPrevia) inferior = inferiorPrevia;

      alcista = alcista ? velas[i].close >= inferior : velas[i].close > superior;
    } else {
      // Primera vela con ATR: no hay banda anterior contra la que decidir el
      // lado. Se arranca en bajista y la primera vela que rompa por arriba lo
      // corrige -- da igual cuál se elija, pero elegir hace falta.
      alcista = false;
    }

    salida[i] = alcista ? inferior : superior;
    superiorPrevia = superior;
    inferiorPrevia = inferior;
  }

  return salida;
}

/**
 * Bandas de Bollinger: la media simple más y menos tantas desviaciones
 * típicas.
 *
 * La desviación se calcula con la resta a la media de cada valor, y no con la
 * fórmula rápida de «media de los cuadrados menos el cuadrado de la media»:
 * con precios de cinco cifras esa resta la hacen dos números casi iguales y se
 * pierden dígitos hasta llegar a raíces de números negativos. La ventana es de
 * veinte velas, así que la versión lenta tampoco es lenta.
 */
export function bollinger(
  valores: number[],
  periodo = 20,
  desviaciones = 2,
): { media: Serie; superior: Serie; inferior: Serie } {
  const media = sma(valores, periodo);
  const superior: Serie = new Array(valores.length).fill(null);
  const inferior: Serie = new Array(valores.length).fill(null);

  for (let i = 0; i < valores.length; i += 1) {
    const centro = media[i];
    if (centro === null) continue;

    let cuadrados = 0;
    for (let j = i - periodo + 1; j <= i; j += 1) {
      const distancia = valores[j] - centro;
      cuadrados += distancia * distancia;
    }
    const sigma = Math.sqrt(cuadrados / periodo);

    superior[i] = centro + desviaciones * sigma;
    inferior[i] = centro - desviaciones * sigma;
  }

  return { media, superior, inferior };
}

/**
 * MACD: la distancia entre dos medias exponenciales, y su propia media.
 *
 * La señal es una EMA **de la línea**, y la línea no empieza en la vela cero:
 * hasta que la EMA lenta arranca no hay diferencia que suavizar. Pasarle la
 * serie con los huecos delante los convertiría en ceros y la señal saldría
 * hundida durante las primeras decenas de velas, cruzando la línea donde no
 * cruza nada. Por eso se suaviza el tramo con datos y se vuelve a colocar
 * donde estaba.
 */
export function macd(
  valores: number[],
  rapida = 12,
  lenta = 26,
  periodoSenal = 9,
): { linea: Serie; senal: Serie } {
  const emaRapida = ema(valores, rapida);
  const emaLenta = ema(valores, lenta);

  const linea: Serie = valores.map((_, i) => {
    const corta = emaRapida[i];
    const larga = emaLenta[i];
    return corta === null || larga === null ? null : corta - larga;
  });

  const senal: Serie = new Array(valores.length).fill(null);
  const desde = linea.findIndex((v) => v !== null);
  if (desde >= 0) {
    // A partir de `desde` no queda ningún hueco -- las dos EMA ya arrancaron
    // y no vuelven a apagarse -- así que el tramo es de números.
    const tramo = linea.slice(desde) as number[];
    const suavizada = ema(tramo, periodoSenal);
    for (let i = 0; i < suavizada.length; i += 1) senal[desde + i] = suavizada[i];
  }

  return { linea, senal };
}

/**
 * IBS: dónde cerró la vela dentro de su propio rango, de 0 a 1.
 *
 * Cero es cerrar en el mínimo y uno en el máximo. No mira el pasado: es una
 * lectura de la vela sola, y por eso no tiene periodo ni arranque.
 *
 * Una vela sin rango -- máximo igual que mínimo -- no da un IBS de 0,5 sino
 * ninguno: la pregunta «en qué parte del rango cerró» no tiene respuesta
 * cuando no hay rango, y contestar el punto medio metería medias verdades en
 * una condición de reversión.
 */
export function ibs(velas: Vela[]): Serie {
  return velas.map((v) => {
    const rango = v.high - v.low;
    return rango > 0 ? (v.close - v.low) / rango : null;
  });
}

/**
 * El rango de la vela **anterior**, en precio.
 *
 * Para las rupturas de volatilidad, que se miden desde la apertura de hoy
 * contra lo que se movió ayer. El de la vela en curso no vale: mientras la
 * vela está viva su rango todavía está creciendo, y una ruptura medida contra
 * un número que crece con ella salta o no salta según en qué momento se mire.
 */
export function rangoPrevio(velas: Vela[]): Serie {
  return velas.map((_, i) => (i === 0 ? null : velas[i - 1].high - velas[i - 1].low));
}

// ------------------------------------------------------------- el catálogo

export type IndicatorId =
  | "EMA9"
  | "EMA21"
  | "EMA50"
  | "EMA55"
  | "SMA50"
  | "SMA200"
  | "VWAP"
  | "RSI14"
  | "RSI2"
  | "ATR14"
  | "DONCHIAN_ALTO_20"
  | "DONCHIAN_BAJO_10"
  | "DONCHIAN_ALTO_55"
  | "DONCHIAN_BAJO_20"
  | "SUPERTREND"
  | "BB_SUPERIOR"
  | "BB_INFERIOR"
  | "ALTO_7"
  | "BAJO_7"
  | "MACD"
  | "MACD_SENAL"
  | "IBS"
  | "RANGO_PREVIO";

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
 * Los que se miran al revisar una operación, y los que hacen falta para
 * escribir las estrategias que se van a probar.
 *
 * La lista nació con siete y con la norma de que los que faltaran se añadirían
 * el día que hicieran falta. Ese día llegó al llevar al backtest las
 * estrategias validadas: un canal de Donchian no es un capricho de la lista,
 * es que sin él las Tortugas no se pueden ni escribir, y una estrategia que no
 * se puede escribir no se puede desmentir. Los añadidos son exactamente esos y
 * ninguno más -- ninguno está aquí «por completar el catálogo».
 *
 * El orden es el de leerlos, no el de calcularlos: medias, luego canales y
 * bandas, luego lo que va en el panel de abajo.
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
    id: "EMA55",
    label: "EMA 55",
    hint: "Con la EMA 21 marca el régimen: por encima se compra, por debajo no.",
    pane: "PRECIO",
    colorToken: "--mod-sleep",
  },
  {
    id: "SMA50",
    label: "SMA 50",
    hint: "La media del medio plazo. Cruzando la 200 es el Golden Cross.",
    pane: "PRECIO",
    colorToken: "--mod-habits",
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
    id: "DONCHIAN_ALTO_20",
    label: "Donchian alto 20",
    hint: "Máximo de las 20 velas anteriores. La entrada del Sistema 1 de las Tortugas.",
    pane: "PRECIO",
    colorToken: "--positive",
  },
  {
    id: "DONCHIAN_BAJO_10",
    label: "Donchian bajo 10",
    hint: "Mínimo de las 10 anteriores. La salida del Sistema 1.",
    pane: "PRECIO",
    colorToken: "--negative",
  },
  {
    id: "DONCHIAN_ALTO_55",
    label: "Donchian alto 55",
    hint: "Máximo de las 55 anteriores. La entrada del Sistema 2, más lenta.",
    pane: "PRECIO",
    colorToken: "--mod-trading",
  },
  {
    id: "DONCHIAN_BAJO_20",
    label: "Donchian bajo 20",
    hint: "Mínimo de las 20 anteriores. La salida del Sistema 2.",
    pane: "PRECIO",
    colorToken: "--mod-meals",
  },
  {
    id: "SUPERTREND",
    label: "SuperTrend 10 · 1,5",
    hint: "Va por debajo del precio en tendencia alcista y por encima en bajista.",
    pane: "PRECIO",
    colorToken: "--mod-reading",
  },
  {
    id: "BB_SUPERIOR",
    label: "Bollinger superior",
    hint: "Media de 20 más dos desviaciones.",
    pane: "PRECIO",
    colorToken: "--mod-content",
  },
  {
    id: "BB_INFERIOR",
    label: "Bollinger inferior",
    hint: "Media de 20 menos dos desviaciones.",
    pane: "PRECIO",
    colorToken: "--mod-content",
  },
  {
    id: "ALTO_7",
    label: "Máximo 7",
    hint: "El máximo de las últimas 7 velas, ésta incluida. Para el Double Seven.",
    pane: "PRECIO",
    colorToken: "--muted-foreground",
  },
  {
    id: "BAJO_7",
    label: "Mínimo 7",
    hint: "El mínimo de las últimas 7 velas, ésta incluida.",
    pane: "PRECIO",
    colorToken: "--muted-foreground",
  },
  {
    id: "RSI14",
    label: "RSI 14",
    hint: "Fuerza relativa. Encima de 70 o debajo de 30 llama la atención.",
    pane: "PANEL",
    colorToken: "--primary",
  },
  {
    id: "RSI2",
    label: "RSI 2",
    hint: "El de Connors. Tan corto que casi siempre está en un extremo: se usa con 10 y 90.",
    pane: "PANEL",
    colorToken: "--mod-tasks",
  },
  {
    id: "ATR14",
    label: "ATR 14",
    hint: "Cuánto se mueve de media. Sirve para poner el stop.",
    pane: "PANEL",
    colorToken: "--warning",
  },
  {
    id: "MACD",
    label: "MACD 12/26",
    hint: "Distancia entre las dos exponenciales. Cruzar el cero es cambiar de sesgo.",
    pane: "PANEL",
    colorToken: "--mod-trading",
  },
  {
    id: "MACD_SENAL",
    label: "MACD señal 9",
    hint: "La media del MACD. El cruce de los dos es la orden.",
    pane: "PANEL",
    colorToken: "--warning",
  },
  {
    id: "IBS",
    label: "IBS",
    hint: "Dónde cerró dentro de su rango: 0 en el mínimo, 1 en el máximo.",
    pane: "PANEL",
    colorToken: "--mod-content",
  },
  {
    id: "RANGO_PREVIO",
    label: "Rango previo",
    hint: "Lo que se movió la vela anterior. La referencia de las rupturas de volatilidad.",
    pane: "PANEL",
    colorToken: "--mod-reading",
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
    case "EMA55":
      return ema(cierres, 55);
    case "SMA50":
      return sma(cierres, 50);
    case "SMA200":
      return sma(cierres, 200);
    case "VWAP":
      return vwap(velas, sessionOf);
    case "RSI14":
      return rsi(cierres, 14);
    case "RSI2":
      return rsi(cierres, 2);
    case "ATR14":
      return atr(velas, 14);
    case "DONCHIAN_ALTO_20":
      return donchianAlto(velas, 20);
    case "DONCHIAN_BAJO_10":
      return donchianBajo(velas, 10);
    case "DONCHIAN_ALTO_55":
      return donchianAlto(velas, 55);
    case "DONCHIAN_BAJO_20":
      return donchianBajo(velas, 20);
    case "SUPERTREND":
      return supertrend(velas, 10, 1.5);
    case "BB_SUPERIOR":
      return bollinger(cierres, 20, 2).superior;
    case "BB_INFERIOR":
      return bollinger(cierres, 20, 2).inferior;
    // El máximo y el mínimo de siete **incluyendo la vela actual**, al revés
    // que el Donchian: aquí la comparación es «el cierre de hoy es el más bajo
    // de los últimos siete», que sólo tiene sentido si hoy entra en la cuenta.
    case "ALTO_7":
      return maximoMovil(
        velas.map((v) => v.high),
        7,
      );
    case "BAJO_7":
      return minimoMovil(
        velas.map((v) => v.low),
        7,
      );
    // Las dos líneas del MACD salen del mismo cálculo, así que pedirlas por
    // separado lo hace dos veces. Se deja así a propósito: la alternativa es
    // una caché aquí dentro, y una caché en la única función que todo el mundo
    // llama es de las cosas que luego devuelven la serie de otras velas.
    case "MACD":
      return macd(cierres).linea;
    case "MACD_SENAL":
      return macd(cierres).senal;
    case "IBS":
      return ibs(velas);
    case "RANGO_PREVIO":
      return rangoPrevio(velas);
  }
}
