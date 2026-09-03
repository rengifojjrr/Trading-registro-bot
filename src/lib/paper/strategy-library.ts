import type { Condition, Operand, Strategy } from "@/lib/backtest/types";
import { CANDIDATOS, DESCARTADOS, VENTANA_RECIENTE } from "@/lib/bots/backtests-2026";
import type { BotBlock, BotStyle } from "@/lib/bots/types";
import type { IndicatorId } from "@/lib/charts/indicators";

/**
 * La biblioteca: estrategias listas para que un bot de papel las opere.
 *
 * Es un catálogo de datos y no un módulo con una función por estrategia
 * porque cada una tiene que poder guardarse en `bots`, enseñarse en una ficha
 * y correrse con el mismo `runBacktest` que se usa para medir. Una estrategia
 * que fuera código no se guarda, no se enseña y no se compara con las demás.
 *
 * Tres reglas que gobiernan todo lo que hay aquí:
 *
 *   1. **`medido` es null salvo que exista la medición.** Un número de
 *      rentabilidad inventado en una ficha que el usuario va a enseñar es una
 *      mentira, y una que nadie va a poder detectar. Las que sí están medidas
 *      no traen sus cifras copiadas a mano sino leídas de `backtests-2026.ts`:
 *      un decimal mal tecleado aquí sería exactamente la misma mentira, sólo
 *      que accidental.
 *
 *   2. **Lo que el motor no sabe expresar se dice, no se disimula.** Varias de
 *      estas reglas son aproximaciones de la estrategia original -- el motor
 *      compara indicadores y precios de la misma vela, y con eso no se
 *      describe un stop trailing, una vela envolvente ni un rango anclado a la
 *      apertura de la sesión. Cada aproximación lo dice en su `descripcion`.
 *      Una ficha que promete el patrón del vídeo y ejecuta otra cosa es peor
 *      que no tener la estrategia.
 *
 *   3. **`direction` nunca es BOTH.** El motor colapsa BOTH a LONG (ver
 *      `runBacktest`), así que una estrategia declarada BOTH operaría sólo
 *      largos sin avisar. Aquí cada una dice el lado que de verdad opera.
 *
 * El `size` es 1 en todas. El tamaño de la posición no es una propiedad de la
 * estrategia sino del capital que se le asigna a la cuenta de papel, y
 * decidirlo aquí sería decidirlo dos veces.
 *
 * Puro: sólo datos y funciones sobre ellos. Sin red, sin base de datos.
 */

// ------------------------------------------------------- atajos de escritura

/**
 * Escribir dieciocho estrategias con los objetos anidados en crudo hace un
 * fichero que nadie relee, y confundir `field: "HIGH"` con `"LOW"` en la
 * decimotercera condición no lo ve ningún revisor. Con estos atajos cada
 * condición cabe en una línea y se lee como la frase que es.
 */
const CIERRE: Operand = { kind: "PRECIO", field: "CLOSE" };
const MAXIMO: Operand = { kind: "PRECIO", field: "HIGH" };
const MINIMO: Operand = { kind: "PRECIO", field: "LOW" };

function ind(indicator: IndicatorId): Operand {
  return { kind: "INDICADOR", indicator };
}

function num(value: number): Operand {
  return { kind: "NUMERO", value };
}

function cuando(left: Operand, comparator: Condition["comparator"], right: Operand): Condition {
  return { left, comparator, right };
}

// --------------------------------------------------------------- el catálogo

export interface EstrategiaDeLaBiblioteca {
  slug: string;
  nombre: string;
  familia: "HFT" | "SCALPING" | "INTRADIA" | "SWING" | "POSICION";
  estilo: BotStyle;
  bloque: BotBlock;
  mercado: string;
  temporalidad: string;
  /** Una frase: por qué el mercado le paga. */
  hipotesis: string;
  /** Explicación larga para la ficha: qué hace, cuándo entra, cuándo sale. */
  descripcion: string;
  /** De dónde sale: autor, libro, estudio, o "medida en este proyecto". */
  procedencia: string;
  /** Si la hemos medido, sus cifras reales. Si no, null: no te inventes números. */
  medido: { pnlPct: number; ddPct: number; trades: number; profitFactor: number; ventana: string } | null;
  reglas: Strategy;
}

/**
 * Las cifras de un candidato del estudio, leídas de su fuente.
 *
 * Devuelve null en silencio si el slug no está: una ficha sin cifras es
 * correcta, y una ficha con las cifras de otra estrategia no lo es. Reventar
 * al cargar el módulo tampoco sirve de nada, porque el que se rompería sería
 * el arranque de la aplicación y no el número.
 */
function medidoDelCandidato(slug: string): EstrategiaDeLaBiblioteca["medido"] {
  const candidato = CANDIDATOS.find((c) => c.slug === slug);
  if (!candidato || candidato.reciente.profitFactor === null) return null;

  return {
    pnlPct: candidato.reciente.pnlPct,
    ddPct: candidato.reciente.maxDrawdownPct,
    trades: candidato.reciente.trades,
    profitFactor: candidato.reciente.profitFactor,
    ventana:
      `${VENTANA_RECIENTE.desde} → ${VENTANA_RECIENTE.hasta} (${VENTANA_RECIENTE.meses} meses) ` +
      `en ${candidato.market} ${candidato.timeframe}, comisión 0,20% por lado, contado y sin apalancamiento`,
  };
}

/**
 * Lo mismo para las del cementerio, que también son mediciones reales.
 *
 * Están aquí a propósito. Una biblioteca que sólo enseña lo que funcionó le
 * hace creer al que la lee que casi todo funciona, y el estudio de agosto dice
 * lo contrario: de doce estrategias medidas, siete perdieron dinero. Sus
 * cifras son las del **histórico completo**, que es como las guarda
 * `backtests-2026.ts`; la ventana de cada una lo explica.
 */
function medidoDelDescartado(slug: string, ventana: string): EstrategiaDeLaBiblioteca["medido"] {
  const descartado = DESCARTADOS.find((d) => d.slug === slug);
  const cifras = descartado?.btc;
  if (!cifras || cifras.profitFactor === null) return null;

  return {
    pnlPct: cifras.pnlPct,
    ddPct: cifras.maxDrawdownPct,
    trades: cifras.trades,
    profitFactor: cifras.profitFactor,
    ventana,
  };
}

export const BIBLIOTECA: EstrategiaDeLaBiblioteca[] = [
  // ------------------------------------------------ HFT y scalping (1m y 5m)

  {
    slug: "barrido-liquidez-envolvente",
    nombre: "Barrido de liquidez + envolvente",
    familia: "SCALPING",
    estilo: "SCALPING",
    // El bloque no es el que le tocaría por estilo (SCALPING → CÓNCAVO). La
    // idea de fondo es de order flow -- alguien barre los stops que hay debajo
    // de un mínimo para llenarse en contra -- y aquí está aproximada con
    // precio. No es reversión a la media ni seguimiento: descorrelaciona, que
    // es lo que define al bloque híbrido.
    bloque: "HIBRIDO",
    mercado: "BTC-USD",
    temporalidad: "5m",
    hipotesis:
      "Cuando el precio perfora un mínimo con la mecha y cierra otra vez dentro del rango, el que empujó no tenía fuerza para sostenerlo: se llevó los stops y se dio la vuelta.",
    descripcion:
      "Entra en largo cuando la vela hace un mínimo por debajo del mínimo de las 10 velas anteriores pero cierra por encima de él, y además cierra en la parte alta de su propio rango (IBS > 0,70). Eso es un barrido -- un sweep -- y es lo contrario de una ruptura -- un run --, donde el cuerpo cierra al otro lado y el movimiento tiene continuación. Sale con stop de 1 ATR y objetivo de 1 ATR (1:1), o a las 12 velas. " +
      "LO QUE ESTAS REGLAS NO DICEN, y hay que saberlo antes de encenderla: (1) la vela envolvente de confirmación NO se puede expresar, porque el motor compara valores de la misma vela y una envolvente es una comparación entre el cuerpo de ésta y el de la anterior; aquí el «rechazo» lo aproxima el IBS de la propia vela del barrido. (2) El stop del patrón va justo al otro lado de la mecha del barrido, y el motor sólo sabe poner stops en múltiplos del ATR desde la entrada. (3) El patrón habla de barrer un máximo o un mínimo RELEVANTE -- el de la sesión, un swing evidente --, y el mínimo móvil de 10 velas salta también en niveles que no le importan a nadie. (4) Aquí barrido y confirmación son la misma vela; en el patrón son dos, y se entra después de la segunda. " +
      "AVISO SOBRE LAS CIFRAS: en el estudio que hicimos de este patrón acertó el 48,97% de las veces, no el 70% que afirma el vídeo del que sale, y a 1:1 un 48,97% pierde dinero incluso con coste cero. Está en la biblioteca para verla operar en papel, no porque tenga ventaja demostrada.",
    procedencia:
      "Vídeo de YouTube que pasó el usuario (barrido de liquidez + vela envolvente). El patrón se midió aparte en este proyecto: 48,97% de aciertos.",
    medido: null,
    reglas: {
      name: "Barrido de liquidez + envolvente",
      direction: "LONG",
      entry: [
        cuando(MINIMO, "MENOR", ind("DONCHIAN_BAJO_10")),
        cuando(CIERRE, "MAYOR", ind("DONCHIAN_BAJO_10")),
        cuando(ind("IBS"), "MAYOR", num(0.7)),
      ],
      exit: { stopAtr: 1, targetAtr: 1, maxBars: 12, conditions: [] },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "vuelta-a-la-vwap",
    nombre: "Vuelta a la VWAP",
    familia: "HFT",
    estilo: "REVERSION",
    bloque: "CONCAVO",
    mercado: "BTC-USD",
    temporalidad: "1m",
    hipotesis:
      "La VWAP es el precio medio al que se ha negociado el día, y el que tiene que ejecutar tamaño la usa de referencia: un precio muy alejado por debajo atrae órdenes de compra.",
    descripcion:
      "Entra en largo cuando el cierre está a la vez por debajo de la banda inferior de Bollinger (20, 2) y por debajo de la VWAP del día. Sale cuando el precio cruza la VWAP hacia arriba, con stop de 1,5 ATR y un tope de 60 velas para no arrastrar una posición que ya no va a volver. La VWAP se reinicia cada día natural, que es lo que la hace un nivel y no una constante. " +
      "Es una estrategia de coste: en un minuto el recorrido esperado es pequeño y la comisión no, así que su resultado depende más de la tarifa que de la señal.",
    procedencia:
      "Clásica de mesa intradía, sin autor identificable. Sin medir en este proyecto.",
    medido: null,
    reglas: {
      name: "Vuelta a la VWAP",
      direction: "LONG",
      entry: [cuando(CIERRE, "MENOR", ind("BB_INFERIOR")), cuando(CIERRE, "MENOR", ind("VWAP"))],
      exit: {
        stopAtr: 1.5,
        targetAtr: null,
        maxBars: 60,
        conditions: [cuando(CIERRE, "CRUZA_ARRIBA", ind("VWAP"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "cruce-ema-9-21",
    nombre: "Cruce de EMA 9/21",
    familia: "SCALPING",
    estilo: "MOMENTUM",
    bloque: "CONVEXO",
    mercado: "ETH-USD",
    temporalidad: "5m",
    hipotesis:
      "Cuando la media de 9 cruza por encima de la de 21 dentro de una tendencia ya establecida, el tramo que empieza suele durar más de lo que cuesta el stop.",
    descripcion:
      "Entra en largo en el cruce de la EMA 9 por encima de la EMA 21, pero sólo si el cierre está por encima de la EMA 50: sin ese filtro la estrategia compra todos los rebotes de un mercado que baja, que es donde el cruce de medias rápido pierde su dinero. Sale con stop de 1,5 ATR, objetivo de 2 ATR, tope de 24 velas o cruce contrario, lo que llegue antes. " +
      "El cruce se comprueba con el comparador de cruce y no con «está por encima»: «está por encima» es verdad durante decenas de velas seguidas y haría entrar en todas.",
    procedencia:
      "El cruce de medias rápidas más repetido en scalping; sin autor. Sin medir en este proyecto.",
    medido: null,
    reglas: {
      name: "Cruce de EMA 9/21",
      direction: "LONG",
      entry: [
        cuando(ind("EMA9"), "CRUZA_ARRIBA", ind("EMA21")),
        cuando(CIERRE, "MAYOR", ind("EMA50")),
      ],
      exit: {
        stopAtr: 1.5,
        targetAtr: 2,
        maxBars: 24,
        conditions: [cuando(ind("EMA9"), "CRUZA_ABAJO", ind("EMA21"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "expansion-de-rango",
    nombre: "Expansión de rango",
    familia: "HFT",
    estilo: "RUPTURA",
    bloque: "CONVEXO",
    mercado: "BTC-USD",
    temporalidad: "5m",
    hipotesis:
      "Una vela mucho más ancha de lo normal es alguien con prisa, y la prisa rara vez se acaba en una sola vela.",
    descripcion:
      "Pide tres cosas a la vez: que el rango de la vela anterior sea mayor que el ATR de 14 (la volatilidad acaba de expandirse), que el máximo supere el máximo de las 20 velas anteriores (la expansión va hacia arriba) y que el cierre esté por encima de la VWAP del día (no es un rebote dentro de un día bajista). Sale con stop de 1 ATR y objetivo de 2, o a las 24 velas. " +
      "El rango se mide sobre la vela ANTERIOR y no sobre la actual: mientras una vela está viva su rango sigue creciendo, y una ruptura medida contra un número que crece con ella salta o no según el momento en que se mire.",
    procedencia:
      "Familia de la ruptura de volatilidad de Larry Williams. La versión sin filtros se midió en este proyecto en diario y murió por coste: 2.979 operaciones con factor de ganancia 0,964. Ésta añade filtros y NO está medida.",
    medido: null,
    reglas: {
      name: "Expansión de rango",
      direction: "LONG",
      entry: [
        cuando(ind("RANGO_PREVIO"), "MAYOR", ind("ATR14")),
        cuando(MAXIMO, "MAYOR", ind("DONCHIAN_ALTO_20")),
        cuando(CIERRE, "MAYOR", ind("VWAP")),
      ],
      exit: { stopAtr: 1, targetAtr: 2, maxBars: 24, conditions: [] },
      size: 1,
      hours: [],
    },
  },

  // ------------------------------------------------- Intradía (15m y 1 hora)

  {
    slug: "ruptura-rango-apertura",
    nombre: "Ruptura del rango de apertura",
    familia: "INTRADIA",
    estilo: "RUPTURA",
    bloque: "CONVEXO",
    mercado: "BTC-USD",
    temporalidad: "15m",
    hipotesis:
      "Bitcoin cotiza las 24 horas, pero el dinero que mueve el precio no: cuando abre Nueva York entra volumen de golpe y el rango de las horas previas se rompe hacia un lado.",
    descripcion:
      "Sólo opera entre las 13 y las 15 UTC, que es la franja en la que abre el mercado estadounidense. Entra en largo si el máximo supera el máximo de las 20 velas anteriores (cinco horas en 15 minutos) y el cierre está por encima de la VWAP. Sale con stop de 1,5 ATR, objetivo de 2 ATR, 24 velas de tope o pérdida de la VWAP. " +
      "LIMITACIÓN: el rango de apertura de verdad se ancla a la primera media hora de la sesión, y el catálogo sólo tiene ventanas móviles. Aquí «el rango» son las cinco horas anteriores a la vela en curso, que en la franja elegida se parece bastante pero no es lo mismo. El horario se filtra en UTC, así que en horario de verano estadounidense la franja va media hora corrida respecto de la apertura real.",
    procedencia:
      "Ruptura del rango de apertura, de las mesas de futuros de Chicago; la popularizó Toby Crabel en «Day Trading with Short Term Price Patterns and Opening Range Breakout» (1990). Sin medir en este proyecto.",
    medido: null,
    reglas: {
      name: "Ruptura del rango de apertura",
      direction: "LONG",
      entry: [
        cuando(MAXIMO, "MAYOR", ind("DONCHIAN_ALTO_20")),
        cuando(CIERRE, "MAYOR", ind("VWAP")),
      ],
      exit: {
        stopAtr: 1.5,
        targetAtr: 2,
        maxBars: 24,
        conditions: [cuando(CIERRE, "CRUZA_ABAJO", ind("VWAP"))],
      },
      size: 1,
      hours: [13, 14, 15],
    },
  },

  {
    slug: "ibs-con-filtro",
    nombre: "IBS con filtro de tendencia",
    familia: "INTRADIA",
    estilo: "REVERSION",
    bloque: "CONCAVO",
    mercado: "BTC-USD",
    temporalidad: "15m",
    hipotesis:
      "Una vela que cierra pegada a su mínimo dentro de una tendencia alcista es un vendedor que se quedó sin contrapartida, no un cambio de dirección.",
    descripcion:
      "Entra en largo cuando el IBS cierra por debajo de 0,10 -- el cierre está en el 10% más bajo del rango de la vela -- y el mínimo de las 7 últimas velas sigue por encima de la SMA 200, que es una forma exigente de decir «llevamos toda la semana en tendencia alcista». Sale cuando el IBS supera 0,80 (la vela cierra arriba del todo), con stop de 2 ATR y 8 velas de tope. " +
      "AVISO: la versión SIN filtro de tendencia se midió en este proyecto sobre BTC diario y fue un desastre -- −99,92% con factor de ganancia 0,436 en 1.209 operaciones --, y por eso está en el cementerio. Lo que se añade aquí es exactamente lo que le faltaba, pero eso es una hipótesis, no un resultado: esta versión NO está medida.",
    procedencia:
      "Internal Bar Strength, popularizada por la literatura cuantitativa de blog. La variante sin filtro se midió en este proyecto y se descartó.",
    medido: null,
    reglas: {
      name: "IBS con filtro de tendencia",
      direction: "LONG",
      entry: [
        cuando(ind("IBS"), "MENOR", num(0.1)),
        cuando(ind("BAJO_7"), "MAYOR", ind("SMA200")),
      ],
      exit: {
        stopAtr: 2,
        targetAtr: null,
        maxBars: 8,
        conditions: [cuando(ind("IBS"), "MAYOR", num(0.8))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "macd-en-tendencia",
    nombre: "MACD en tendencia",
    familia: "INTRADIA",
    estilo: "MOMENTUM",
    bloque: "CONVEXO",
    mercado: "ETH-USD",
    temporalidad: "1h",
    hipotesis:
      "El cruce del MACD sobre su señal marca el momento en que la aceleración cambia de signo, y en un mercado que ya sube ese cambio suele adelantarse al tramo.",
    descripcion:
      "Entra en largo cuando la línea del MACD (12/26/9) cruza por encima de su señal estando el cierre por encima de la EMA 50. Sale en el cruce contrario, con stop de 2 ATR y un tope de 72 velas -- tres días -- para que una posición no se quede colgada esperando un cruce que no llega. " +
      "El filtro de la EMA 50 no es decorativo: el MACD cruza igual de bien en una caída, y sin filtro la mitad de las señales son rebotes dentro de un tramo bajista.",
    procedencia:
      "MACD de Gerald Appel, años setenta. Sin medir en este proyecto.",
    medido: null,
    reglas: {
      name: "MACD en tendencia",
      direction: "LONG",
      entry: [
        cuando(ind("MACD"), "CRUZA_ARRIBA", ind("MACD_SENAL")),
        cuando(CIERRE, "MAYOR", ind("EMA50")),
      ],
      exit: {
        stopAtr: 2,
        targetAtr: null,
        maxBars: 72,
        conditions: [cuando(ind("MACD"), "CRUZA_ABAJO", ind("MACD_SENAL"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "bollinger-con-filtro",
    nombre: "Bollinger con filtro de tendencia",
    familia: "INTRADIA",
    estilo: "REVERSION",
    bloque: "CONCAVO",
    mercado: "BTC-USD",
    temporalidad: "1h",
    hipotesis:
      "Un cierre fuera de la banda inferior es una desviación de dos sigmas, y dentro de una tendencia alcista las desviaciones de dos sigmas se cierran más veces de las que siguen.",
    descripcion:
      "Entra en largo cuando el cierre queda por debajo de la banda inferior de Bollinger (20, 2) estando por encima de la SMA 200. Sale cuando el precio cruza la EMA 21 hacia arriba, con stop de 2 ATR y 48 velas de tope. " +
      "AVISO IMPORTANTE: la misma estrategia SIN el filtro de la SMA 200 se midió en este proyecto sobre BTC diario y fue el control negativo del estudio -- −100,00% con factor de ganancia 0,318 --, porque comprar debilidad sin filtro en un activo que cae el 80% es ruina matemática. El filtro es justo lo que la separa de aquello, pero esta versión no está medida.",
    procedencia:
      "John Bollinger, «Bollinger on Bollinger Bands» (2001). La versión sin filtro se midió en este proyecto como control negativo y se descartó.",
    medido: null,
    reglas: {
      name: "Bollinger con filtro de tendencia",
      direction: "LONG",
      entry: [cuando(CIERRE, "MENOR", ind("BB_INFERIOR")), cuando(CIERRE, "MAYOR", ind("SMA200"))],
      exit: {
        stopAtr: 2,
        targetAtr: null,
        maxBars: 48,
        conditions: [cuando(CIERRE, "CRUZA_ARRIBA", ind("EMA21"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "rebote-a-la-ema21-corto",
    nombre: "Rebote a la EMA 21 en tendencia bajista",
    familia: "INTRADIA",
    estilo: "TENDENCIA",
    // Híbrida a propósito: entra CONTRA el movimiento inmediato (el rebote) y
    // A FAVOR del de fondo. No cobra como una tendencial -- no espera el tramo
    // entero -- ni como una cóncava -- no apuesta a que el precio vuelva a la
    // media --, y esa mezcla es lo que la descorrelaciona de las dos.
    bloque: "HIBRIDO",
    mercado: "BTC-USD",
    temporalidad: "1h",
    hipotesis:
      "En una tendencia bajista clara, el rebote hasta la media de 21 es donde vuelve a aparecer la oferta que la provocó.",
    descripcion:
      "La única estrategia corta de la biblioteca. Pide que el máximo de las últimas 7 velas siga por debajo de la SMA 200 -- ni en el mejor momento de la semana se ha acercado a ella --, que la EMA 21 esté por debajo de la EMA 55, y que la vela toque la EMA 21 por arriba pero cierre por debajo: el rebote llegó y no aguantó. Sale con stop de 1,5 ATR, objetivo de 3 ATR y 48 velas de tope. " +
      "Va corta de verdad: el motor colapsa la dirección BOTH a largo, así que una estrategia que quiera vender tiene que declararse SHORT.",
    procedencia:
      "Retroceso a la media dentro de la tendencia: técnica de manual, sin autor concreto. Sin medir en este proyecto.",
    medido: null,
    reglas: {
      name: "Rebote a la EMA 21 en tendencia bajista",
      direction: "SHORT",
      entry: [
        cuando(ind("ALTO_7"), "MENOR", ind("SMA200")),
        cuando(ind("EMA21"), "MENOR", ind("EMA55")),
        cuando(MAXIMO, "MAYOR", ind("EMA21")),
        cuando(CIERRE, "MENOR", ind("EMA21")),
      ],
      exit: { stopAtr: 1.5, targetAtr: 3, maxBars: 48, conditions: [] },
      size: 1,
      hours: [],
    },
  },

  // ------------------------------------------------------------ Swing (1 día)

  {
    slug: "tortugas-s2-eth",
    nombre: "Tortugas S2 — ETH diario",
    familia: "SWING",
    estilo: "RUPTURA",
    bloque: "CONVEXO",
    mercado: "ETH-USD",
    temporalidad: "1d",
    hipotesis:
      "Las rupturas de máximos de 55 días capturan las tendencias largas de ETH, que son pocas y muy grandes; el 46% de aciertos basta porque las ganadoras son mucho mayores que las perdedoras.",
    descripcion:
      "La mejor del estudio de agosto de 2026. Compra cuando el máximo del día supera el máximo de los 55 días anteriores y no sale hasta que el mínimo perfora el mínimo de los 20 días anteriores. No lleva stop de ATR ni objetivo: el canal contrario ES el stop, y ponerle además un objetivo la mataría, porque toda su ventaja está en las tres o cuatro operaciones al año que corren durante meses. " +
      "El canal excluye la vela en curso. Si no lo hiciera, el máximo del día se estaría comparando consigo mismo y la ruptura no podría ocurrir nunca. " +
      "NOTA: el sistema original de las Tortugas lleva además un stop de 2N y una regla de piramidado; ninguno de los dos consta en la medición ni el motor sabe piramidar (mantiene una posición por vez).",
    procedencia:
      "Sistema de las Tortugas de Richard Dennis y William Eckhardt (1983), reglas publicadas por Curtis Faith. Medida en este proyecto.",
    medido: medidoDelCandidato("tortugas-s2-eth"),
    reglas: {
      name: "Tortugas S2 — ETH diario",
      direction: "LONG",
      entry: [cuando(MAXIMO, "MAYOR", ind("DONCHIAN_ALTO_55"))],
      exit: {
        stopAtr: null,
        targetAtr: null,
        maxBars: null,
        conditions: [cuando(MINIMO, "MENOR", ind("DONCHIAN_BAJO_20"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "tortugas-s1-btc",
    nombre: "Tortugas S1 — BTC diario",
    familia: "SWING",
    estilo: "RUPTURA",
    bloque: "CONVEXO",
    mercado: "BTC-USD",
    temporalidad: "1d",
    hipotesis:
      "La ruptura del máximo de 20 días con salida en el mínimo de 10 captura los tramos tendenciales de BTC; el filtro de última ruptura evita repetir la señal que acaba de fallar.",
    descripcion:
      "La versión rápida de las Tortugas: entra al superar el máximo de los 20 días anteriores y sale al perder el mínimo de los 10 anteriores. Más señales que la S2 y cada una con menos recorrido esperado, lo que se nota en su factor de ganancia. " +
      "LO QUE FALTA: el sistema original se salta la señal si la ruptura anterior fue ganadora, y ese filtro NO se puede expresar con este motor, que evalúa cada vela sin memoria de lo que pasó con la operación anterior. Ésta entra en todas las rupturas. La hipótesis de arriba menciona ese filtro porque es la del estudio; las reglas de aquí no lo tienen.",
    procedencia:
      "Sistema de las Tortugas de Richard Dennis y William Eckhardt (1983), reglas publicadas por Curtis Faith. Medida en este proyecto.",
    medido: medidoDelCandidato("tortugas-s1-btc"),
    reglas: {
      name: "Tortugas S1 — BTC diario",
      direction: "LONG",
      entry: [cuando(MAXIMO, "MAYOR", ind("DONCHIAN_ALTO_20"))],
      exit: {
        stopAtr: null,
        targetAtr: null,
        maxBars: null,
        conditions: [cuando(MINIMO, "MENOR", ind("DONCHIAN_BAJO_10"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "tortugas-s2-btc",
    nombre: "Tortugas S2 — BTC diario",
    familia: "SWING",
    estilo: "RUPTURA",
    bloque: "CONVEXO",
    mercado: "BTC-USD",
    temporalidad: "1d",
    hipotesis:
      "La versión lenta de las Tortugas sobre BTC: menos señales, cada una con más recorrido esperado.",
    descripcion:
      "Las mismas reglas que la S2 de ETH aplicadas a BTC: entra por encima del máximo de 55 días, sale por debajo del mínimo de 20. Está en la biblioteca por lo que enseña más que por lo que promete: su factor de ganancia era 2,786 antes de agosto de 2022 y 1,111 después. Es el caso de decaimiento de ventaja más claro del estudio -- la misma regla que en ETH todavía aguanta, en BTC casi se ha agotado --, y verla operar en papel al lado de su gemela de ETH es la mejor manera de entender qué significa que una ventaja se agote.",
    procedencia:
      "Sistema de las Tortugas de Richard Dennis y William Eckhardt (1983), reglas publicadas por Curtis Faith. Medida en este proyecto.",
    medido: medidoDelCandidato("tortugas-s2-btc"),
    reglas: {
      name: "Tortugas S2 — BTC diario",
      direction: "LONG",
      entry: [cuando(MAXIMO, "MAYOR", ind("DONCHIAN_ALTO_55"))],
      exit: {
        stopAtr: null,
        targetAtr: null,
        maxBars: null,
        conditions: [cuando(MINIMO, "MENOR", ind("DONCHIAN_BAJO_20"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "double-seven-btc",
    nombre: "Double Seven — BTC diario",
    familia: "SWING",
    estilo: "REVERSION",
    bloque: "CONCAVO",
    mercado: "BTC-USD",
    temporalidad: "1d",
    hipotesis:
      "Dentro de una tendencia alcista (precio sobre la SMA 200), un cierre en el mínimo de 7 días es un retroceso temporal que suele revertir; se sale en el máximo de 7 días.",
    descripcion:
      "Compra el retroceso dentro de la tendencia: cierre por encima de la SMA 200 y cierre por debajo del mínimo de los días anteriores. Sale cuando el precio recupera la EMA 9, con stop de 3 ATR y 10 días de tope. Es la única del estudio que rinde MEJOR en la ventana reciente que en su histórico completo. " +
      "APROXIMACIÓN, y es importante: la versión medida usa el mínimo y el máximo de 7 días. Los indicadores ALTO_7 y BAJO_7 del catálogo se calculan incluyendo la vela en curso, así que la condición «el cierre está por debajo del mínimo de 7 días» es imposible de cumplir con ellos -- el mínimo de la ventana es como mucho el mínimo de hoy, que ya es menor o igual que el cierre de hoy --. Por eso aquí el retroceso se mide contra el canal de Donchian de 10 días, que sí excluye la vela en curso, y la salida es la EMA 9 en vez del máximo de 7. Las cifras de `medido` son las de la versión de 7/7 medida en TradingView, NO las de estas reglas. " +
      "AVISO del estudio: en ETH la misma regla pierde (−33,39% histórico). Una ventaja que sólo existe en un activo merece desconfianza.",
    procedencia:
      "Larry Connors y Cesar Alvarez, «Short Term Trading Strategies That Work» (2008). Medida en este proyecto.",
    medido: medidoDelCandidato("double-seven-btc"),
    reglas: {
      name: "Double Seven — BTC diario",
      direction: "LONG",
      entry: [
        cuando(CIERRE, "MAYOR", ind("SMA200")),
        cuando(CIERRE, "MENOR", ind("DONCHIAN_BAJO_10")),
      ],
      exit: {
        stopAtr: 3,
        targetAtr: null,
        maxBars: 10,
        conditions: [cuando(CIERRE, "CRUZA_ARRIBA", ind("EMA9"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "supertrend-ema-btc",
    nombre: "SuperTrend + EMA 21/55 — BTC diario",
    familia: "SWING",
    estilo: "TENDENCIA",
    bloque: "CONVEXO",
    mercado: "BTC-USD",
    temporalidad: "1d",
    hipotesis:
      "El SuperTrend filtrado por el régimen de EMA 21/55 diario sigue la tendencia dominante de BTC, y las salidas asimétricas (trailing 12% en largo, 5% en corto) reconocen que las caídas son más rápidas que las subidas.",
    descripcion:
      "Entra cuando el cierre cruza por encima del SuperTrend (ATR 10, factor 1,5) estando la EMA 21 por encima de la EMA 55, y sale cuando el cierre lo cruza hacia abajo. El SuperTrend hace de stop que sube y nunca baja, así que no lleva stop de ATR fijo ni objetivo. Es la estrategia con menos drawdown de todo el estudio. " +
      "LO QUE ESTAS REGLAS NO TIENEN: la versión medida opera largos Y cortos con trailing stops asimétricos (12% en el largo, 5% en el corto), y el motor no sabe hacer trailing stops porcentuales ni llevar dos direcciones. Ésta es la pata larga con el SuperTrend haciendo de trailing. Las cifras de `medido` son las de la versión completa, así que la de aquí rendirá distinto -- probablemente menos, porque le falta la mitad del sistema.",
    procedencia:
      "Barrido de parámetros hecho en este proyecto (perp_lab). El factor 1,5 se eligió por degradación monótona fuera de muestra, no por ser el pico dentro de muestra. Medida en este proyecto.",
    medido: medidoDelCandidato("perp-lab-btc-ls"),
    reglas: {
      name: "SuperTrend + EMA 21/55 — BTC diario",
      direction: "LONG",
      entry: [
        cuando(CIERRE, "CRUZA_ARRIBA", ind("SUPERTREND")),
        cuando(ind("EMA21"), "MAYOR", ind("EMA55")),
      ],
      exit: {
        stopAtr: null,
        targetAtr: null,
        maxBars: null,
        conditions: [cuando(CIERRE, "CRUZA_ABAJO", ind("SUPERTREND"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "rsi2-connors-btc",
    nombre: "RSI(2) de Connors + SMA 200",
    familia: "SWING",
    estilo: "REVERSION",
    bloque: "CONCAVO",
    mercado: "BTC-USD",
    temporalidad: "1d",
    hipotesis:
      "Un RSI de 2 periodos por debajo de 5 dentro de una tendencia alcista marca una sobreventa de dos o tres días que el mercado suele corregir en la semana siguiente.",
    descripcion:
      "ESTÁ EN EL CEMENTERIO Y AQUÍ SE ENSEÑA POR ESO. Entra en largo con el RSI de 2 periodos por debajo de 5 y el cierre por encima de la SMA 200; sale cuando el RSI supera 70 o a los 10 días. Medida en este proyecto sobre BTC diario acertó el 66,67% de las veces y aun así perdió el 39,70%: las perdedoras eran mucho mayores que las ganadoras (factor de ganancia 0,755). " +
      "Es el mejor recordatorio del estudio de que un porcentaje de acierto alto sin control de la cola no es una ventaja, y por eso vale la pena verla operar en papel al lado de las que sí ganan. " +
      "NOTA sobre las cifras: la medición no dejó registrado su criterio exacto de salida, así que la salida de aquí (RSI > 70 o 10 días) es la canónica de Connors y puede no ser la que se midió.",
    procedencia:
      "Larry Connors, la estrategia del RSI de 2 periodos. Medida en este proyecto y descartada.",
    medido: medidoDelDescartado(
      "rsi2-connors",
      "histórico completo de COINBASE:BTCUSD 1D en el estudio de agosto de 2026, comisión 0,20% por lado",
    ),
    reglas: {
      name: "RSI(2) de Connors + SMA 200",
      direction: "LONG",
      entry: [cuando(ind("RSI2"), "MENOR", num(5)), cuando(CIERRE, "MAYOR", ind("SMA200"))],
      exit: {
        stopAtr: null,
        targetAtr: null,
        maxBars: 10,
        conditions: [cuando(ind("RSI2"), "MAYOR", num(70))],
      },
      size: 1,
      hours: [],
    },
  },

  // -------------------------------------------------------- Posición (1 día)

  {
    slug: "golden-cross-btc",
    nombre: "Golden Cross SMA 50/200",
    familia: "POSICION",
    estilo: "TENDENCIA",
    bloque: "CONVEXO",
    mercado: "BTC-USD",
    temporalidad: "1d",
    hipotesis:
      "Cuando la media de 50 días cruza por encima de la de 200, el régimen del activo ha cambiado y conviene estar dentro hasta que se cruce de vuelta.",
    descripcion:
      "La estrategia más citada de la prensa financiera y el control del estudio de agosto: entra en el cruce de la SMA 50 sobre la SMA 200 y sale en el cruce contrario, sin stop, sin objetivo y sin límite de tiempo. Diecinueve operaciones en once años. " +
      "LEER LAS DOS VENTANAS: en el histórico completo gana, pero en los últimos cuatro años -- que es la ventana que manda en este proyecto -- perdió el 42,00% con un factor de ganancia de 0,568. Las cifras de `medido` son las del histórico, y el histórico de BTC está inflado por 2015-2020. Que el control falle donde las candidatas aguantan es buena señal para el resto del estudio, no para esta estrategia.",
    procedencia:
      "El cruce de medias más citado de la prensa financiera. Medida en este proyecto como control y descartada.",
    medido: medidoDelDescartado(
      "golden-cross",
      "histórico completo de COINBASE:BTCUSD 1D; en la ventana reciente de 4 años perdió el 42,00% con factor de ganancia 0,568",
    ),
    reglas: {
      name: "Golden Cross SMA 50/200",
      direction: "LONG",
      entry: [cuando(ind("SMA50"), "CRUZA_ARRIBA", ind("SMA200"))],
      exit: {
        stopAtr: null,
        targetAtr: null,
        maxBars: null,
        conditions: [cuando(ind("SMA50"), "CRUZA_ABAJO", ind("SMA200"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "regimen-ema-21-55-btc",
    nombre: "Régimen de EMA 21/55",
    familia: "POSICION",
    estilo: "TENDENCIA",
    bloque: "CONVEXO",
    mercado: "BTC-USD",
    temporalidad: "1d",
    hipotesis:
      "El régimen de BTC se resume en dos medias: mientras la de 21 esté por encima de la de 55 el activo está en fase alcista, y las fases alcistas de BTC duran meses.",
    descripcion:
      "El filtro de régimen del ganador del barrido, operando solo: entra cuando la EMA 21 cruza por encima de la EMA 55 y sale cuando cruza por debajo. Sin stop, sin objetivo, sin tope de tiempo. Es la estrategia más simple de la biblioteca y está aquí como referencia: cualquier bot tendencial de BTC que no la bata está cobrando complejidad sin dar nada a cambio. " +
      "NO ESTÁ MEDIDA POR SEPARADO. Se midió como filtro dentro de la estrategia de SuperTrend, que es otra cosa; atribuirle aquellas cifras sería atribuirle el trabajo del SuperTrend.",
    procedencia:
      "El filtro de régimen del ganador del barrido (perp_lab), aislado. Nunca se midió solo en este proyecto.",
    medido: null,
    reglas: {
      name: "Régimen de EMA 21/55",
      direction: "LONG",
      entry: [cuando(ind("EMA21"), "CRUZA_ARRIBA", ind("EMA55"))],
      exit: {
        stopAtr: null,
        targetAtr: null,
        maxBars: null,
        conditions: [cuando(ind("EMA21"), "CRUZA_ABAJO", ind("EMA55"))],
      },
      size: 1,
      hours: [],
    },
  },

  {
    slug: "faber-sma200-eth",
    nombre: "Cruce de la SMA 200 (Faber)",
    familia: "POSICION",
    estilo: "TENDENCIA",
    bloque: "CONVEXO",
    mercado: "ETH-USD",
    temporalidad: "1d",
    hipotesis:
      "Estar dentro sólo cuando el precio está por encima de su media de diez meses no mejora el retorno, pero recorta las caídas grandes, que es donde se pierde el capital.",
    descripcion:
      "La regla de asignación táctica de Meb Faber, llevada al día: comprar cuando el cierre cruza por encima de la SMA 200 y estar fuera el resto del tiempo. No lleva stop ni objetivo -- la media ES la salida -- y puede pasar meses sin operar. " +
      "Su promesa no es ganar más que comprar y mantener sino perder menos en las caídas del 70%, que en ETH han sido tres desde 2016. En la ventana reciente comprar y mantener ETH dio +61,22% con un drawdown del 69,60%: contra eso es contra lo que hay que compararla, y esa comparación NO está hecha todavía.",
    procedencia:
      "Meb Faber, «A Quantitative Approach to Tactical Asset Allocation» (2007). Sin medir en este proyecto sobre ETH.",
    medido: null,
    reglas: {
      name: "Cruce de la SMA 200 (Faber)",
      direction: "LONG",
      entry: [cuando(CIERRE, "CRUZA_ARRIBA", ind("SMA200"))],
      exit: {
        stopAtr: null,
        targetAtr: null,
        maxBars: null,
        conditions: [cuando(CIERRE, "CRUZA_ABAJO", ind("SMA200"))],
      },
      size: 1,
      hours: [],
    },
  },
];

/**
 * Una estrategia por su slug.
 *
 * Los bots guardan el slug y no las reglas: si mañana se corrige una condición
 * mal escrita, los bots que ya existen tienen que heredar la corrección. Un bot
 * con las reglas copiadas dentro se queda con la versión del día que se creó y
 * nadie se entera.
 */
export function estrategiaPorSlug(slug: string): EstrategiaDeLaBiblioteca | null {
  return BIBLIOTECA.find((e) => e.slug === slug) ?? null;
}
