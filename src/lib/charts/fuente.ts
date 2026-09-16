/**
 * De quién es el gráfico.
 *
 * Había dos gráficos en la aplicación. El de una operación tenía veinte
 * herramientas de dibujo, indicadores, escalas, reproducción y capturas; el de
 * una publicación macro no tenía ninguna, y se sentía roto precisamente porque
 * el otro existía. No era una decisión de diseño: era que los dibujos colgaban
 * de una operación y de nada más, así que sobre las velas de un dato macro no
 * había dónde guardar una línea.
 *
 * Resuelto eso en la tabla (`chart_drawings` acepta los dos dueños), lo único
 * que separa a los dos gráficos es esto: de quién son los dibujos, de dónde
 * salen las velas y hasta dónde se traen. Todo lo demás --que es casi todo-- es
 * el mismo componente.
 *
 * Puro: nombres, rutas y aritmética de ventanas. Sin red y sin pantalla, para
 * que lo que decide qué se pide se pueda probar sin montar un gráfico.
 */

/** Cuánto se trae alrededor de una publicación, en horas. */
export const HORAS_ANTES = 24;

/**
 * **Éste era el gráfico corriéndose solo hacia la derecha al alejar el zoom.**
 *
 * El cargador del borde derecho pedía hasta *ahora mismo*; para una noticia de
 * junio eso son tres meses de velas disponibles. Alejar el zoom dejaba hueco a
 * la derecha, el cargador traía trescientas velas para llenarlo, seguía
 * habiendo hueco, y vuelta a empezar.
 *
 * El tope tampoco es arbitrario: pasadas cuarenta y ocho horas lo que se ve ya
 * no es la reacción a ese dato sino el mercado haciendo su vida, que es otra
 * pregunta y tiene otra pantalla.
 */
export const HORAS_DESPUES = 48;

export type FuenteDelGrafico =
  | {
      tipo: "operacion";
      id: string;
      /** Los extremos de la operación, en segundos. */
      desde: number;
      hasta: number;
    }
  | {
      tipo: "evento";
      id: string;
      /** El instante de la publicación, en segundos: el centro de todo. */
      t0: number;
    };

/** El momento alrededor del cual gira el gráfico. */
export function centroDe(fuente: FuenteDelGrafico): number {
  return fuente.tipo === "evento" ? fuente.t0 : fuente.desde;
}

/**
 * Dónde viven los dibujos de este gráfico.
 *
 * Dos rutas y un solo almacén detrás (`lib/chart-drawings/store.ts`): lo que
 * cambia es la columna que ata el dibujo a su dueño, no lo que se valida ni
 * cómo se guarda.
 */
export function rutaDeDibujos(fuente: FuenteDelGrafico, drawingId?: string): string {
  const base = fuente.tipo === "operacion" ? "trades" : "noticias";
  const raiz = `/api/${base}/${fuente.id}/drawings`;
  return drawingId ? `${raiz}/${drawingId}` : raiz;
}

/**
 * Dónde se guarda la vista --temporalidad, escala, qué se enseña-- de *este*
 * gráfico.
 *
 * Con el prefijo del tipo delante: sin él, un identificador de operación y uno
 * de publicación compartirían espacio de nombres, y aunque hoy los dos sean
 * UUID, atarlo a esa coincidencia es dejar puesta una trampa para el día que
 * uno de los dos deje de serlo.
 */
export function claveDeVista(fuente: FuenteDelGrafico): string {
  return `grafico:vista:${fuente.tipo}:${fuente.id}`;
}

/**
 * Hasta dónde se pueden traer velas, o `null` si la ventana es fija.
 *
 * Una operación tiene principio y fin: la ruta de velas deriva la ventana de
 * sus propias marcas de tiempo y no hay nada que cargar al llegar al borde. Una
 * publicación es un instante en medio de un mercado que sigue, así que se
 * carga hacia los lados -- con tope, por lo de arriba.
 */
export function topesDeVelas(
  fuente: FuenteDelGrafico,
  ahora: number,
): { suelo: number; techo: number } | null {
  if (fuente.tipo === "operacion") return null;
  return {
    suelo: fuente.t0 - HORAS_ANTES * 3600,
    // Ni un segundo en el futuro: pedir velas que aún no existen devuelve una
    // lista vacía y el cargador lo reintentaría en cada desplazamiento.
    techo: Math.min(fuente.t0 + HORAS_DESPUES * 3600, ahora),
  };
}

/**
 * Cuántas velas se piden a cada lado de la publicación al cambiar de tamaño.
 *
 * Trescientas en total, que es lo que devuelve como mucho una petición: pedir
 * las setenta y dos horas enteras en velas de un minuto serían cuatro mil, la
 * ruta recorta por el final, y el gráfico abriría enseñando **las cinco horas
 * anteriores al dato** y ni una vela de la reacción.
 *
 * Más después que antes porque lo que se viene a mirar es la reacción. Se mide
 * en velas y no en minutos para que la proporción se conserve en cualquier
 * temporalidad.
 */
export const VELAS_PEDIDAS_ANTES = 60;
export const VELAS_PEDIDAS_DESPUES = 240;

/** A qué URL se le piden las velas de una temporalidad. */
export function peticionDeVelas(
  fuente: FuenteDelGrafico,
  productId: string,
  granularity: string,
  segundosPorVela: number,
  rango?: { desde: number; hasta: number },
): string {
  if (fuente.tipo === "operacion") {
    // Sólo la operación y la temporalidad: la ruta deriva la ventana de las
    // marcas de tiempo de la propia operación, así que una vela más fina
    // acerca en vez de desbordar el presupuesto de velas por petición.
    const query = new URLSearchParams({ tradeId: fuente.id, granularity });
    return `/api/coinbase/trade-candles?${query}`;
  }

  const query = new URLSearchParams({
    granularity,
    productId,
    start: String(
      Math.floor(rango?.desde ?? fuente.t0 - VELAS_PEDIDAS_ANTES * segundosPorVela),
    ),
    end: String(Math.ceil(rango?.hasta ?? fuente.t0 + VELAS_PEDIDAS_DESPUES * segundosPorVela)),
  });
  return `/api/economic-calendar/candles?${query}`;
}

/**
 * Cuántas velas se ven al abrir el gráfico de una publicación, a cada lado.
 *
 * En velas y no en minutos: es lo que hace que el encuadre se vea igual de bien
 * en un minuto que en una hora. Con minutos fijos, cambiar a velas de una hora
 * pedía enseñar los cuarenta y cinco minutos anteriores al dato --menos de una
 * vela-- y el gráfico salía con el dato pegado a un borde y el resto vacío.
 *
 * Más después que antes porque lo que se viene a mirar es la reacción, no lo
 * que había antes.
 */
export const VELAS_ANTES = 30;
export const VELAS_DESPUES = 70;

/**
 * El encuadre de apertura, recortado a las velas que de verdad hay.
 *
 * Sin el recorte, pedir treinta velas antes y setenta después de lo que hay
 * deja franjas vacías a los lados -- y el cargador del borde se lanza a
 * llenarlas nada más abrir, que es como empezaba el desfile hacia la derecha.
 */
export function encuadreInicial(
  t0: number,
  segundosPorVela: number,
  tiempos: number[],
): { from: number; to: number } {
  const primera = tiempos[0] ?? t0;
  const ultima = tiempos[tiempos.length - 1] ?? t0;
  return {
    from: Math.max(t0 - VELAS_ANTES * segundosPorVela, primera),
    to: Math.min(t0 + VELAS_DESPUES * segundosPorVela, ultima + segundosPorVela),
  };
}

/**
 * Qué tramo pedir al llegar a un borde, o `null` si ya no hay nada que traer.
 *
 * Trescientas velas por petición, que es el tope de Coinbase, y nunca más allá
 * de los topes: devolver `null` es lo que corta el bucle de «hay hueco, traigo
 * velas, sigue habiendo hueco».
 */
export function tramoDelBorde(
  lado: "izquierda" | "derecha",
  tiempos: number[],
  segundosPorVela: number,
  topes: { suelo: number; techo: number },
): { desde: number; hasta: number } | null {
  if (tiempos.length === 0) return null;

  if (lado === "izquierda") {
    const primera = tiempos[0];
    if (primera <= topes.suelo) return null;
    return { desde: Math.max(primera - 300 * segundosPorVela, topes.suelo), hasta: primera - segundosPorVela };
  }

  const ultima = tiempos[tiempos.length - 1];
  if (ultima >= topes.techo) return null;
  return { desde: ultima + segundosPorVela, hasta: Math.min(ultima + 300 * segundosPorVela, topes.techo) };
}
