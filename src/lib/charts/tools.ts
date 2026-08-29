/**
 * El catálogo de herramientas de dibujo, con sus parámetros.
 *
 * El gráfico tenía cinco herramientas y un solo parámetro -- el color. Esto
 * las lleva a las de la barra de TradingView y, sobre todo, hace que cada una
 * tenga ajustes propios: una línea de tendencia se prolonga o no, un
 * retroceso de Fibonacci enseña unos niveles u otros, una posición larga
 * calcula su relación beneficio/riesgo.
 *
 * Todo vive aquí, en un sitio, y no repartido por el componente del gráfico:
 * añadir una herramienta es añadir una entrada a esta tabla, no tocar cuatro
 * archivos y acordarse del quinto.
 *
 * Puro: describe las herramientas, no las dibuja.
 */

export type ToolId =
  // --------------------------------------------------------------- Líneas
  | "HLINE"
  | "HRAY"
  | "VLINE"
  | "TRENDLINE"
  | "RAY"
  | "EXTENDED"
  | "CROSSLINE"
  | "TREND_ANGLE"
  | "INFO_LINE"
  | "ARROW"
  // -------------------------------------------------------------- Figuras
  | "RECTANGLE"
  | "ROTATED_RECTANGLE"
  | "ELLIPSE"
  | "TRIANGLE"
  | "PARALLEL_CHANNEL"
  | "ARC"
  | "CURVE"
  | "PATH"
  | "POLYLINE"
  // ------------------------------------------------------------ Fibonacci
  | "FIB"
  | "FIB_EXTENSION"
  | "FIB_FAN"
  | "FIB_TIMEZONE"
  | "FIB_CHANNEL"
  | "FIB_CIRCLE"
  | "PITCHFORK"
  | "GANN_BOX"
  | "GANN_FAN"
  // ------------------------------------------------------------ Posición
  | "LONG_POSITION"
  | "SHORT_POSITION"
  // -------------------------------------------------------------- Medida
  | "DATE_PRICE_RANGE"
  | "PRICE_RANGE"
  | "DATE_RANGE"
  | "FORECAST"
  // ------------------------------------------------------------- Patrones
  | "ELLIOTT"
  | "XABCD"
  | "CYPHER"
  | "ABCD"
  | "TRIANGLE_PATTERN"
  | "THREE_DRIVES"
  | "HEAD_SHOULDERS"
  // ----------------------------------------------------------- Anotaciones
  | "TEXT"
  | "NOTE"
  | "CALLOUT"
  | "PRICE_LABEL"
  | "FLAG";

export type ToolGroup =
  | "LINEAS"
  | "FIGURAS"
  | "FIBONACCI"
  | "POSICION"
  | "MEDIDA"
  | "PATRONES"
  | "ANOTACION";

export const GROUP_LABELS: Record<ToolGroup, string> = {
  LINEAS: "Líneas",
  FIGURAS: "Figuras",
  FIBONACCI: "Fibonacci y Gann",
  POSICION: "Posición",
  MEDIDA: "Medida y proyección",
  PATRONES: "Patrones",
  ANOTACION: "Anotaciones",
};

/** Qué parámetros expone una herramienta en su panel de ajustes. */
export type ParamId =
  | "color"
  | "lineWidth"
  | "lineStyle"
  | "fill"
  | "fillOpacity"
  | "extendLeft"
  | "extendRight"
  | "showPrice"
  | "showLabels"
  | "levels"
  | "textLabel"
  | "riskReward"
  | "accountSize"
  | "riskPercent"
  | "waveDegree"
  | "fontSize";

export interface ToolMeta {
  id: ToolId;
  label: string;
  /** Qué hace, en una línea, para el desplegable de ayuda. */
  hint: string;
  group: ToolGroup;
  /**
   * Cuántos clics hacen falta para colocarla.
   *
   * Es el dato del que sale todo lo demás -- la vista previa, cuándo se
   * guarda, si se puede arrastrar por un extremo -- así que se declara aquí en
   * vez de deducirse con condicionales repartidos por el componente.
   */
  points: number;
  /** Los ajustes que aparecen al abrirla, en este orden. */
  params: ParamId[];
}

/**
 * Las herramientas, en el orden en que salen en la barra.
 *
 * El orden importa: las de línea primero porque son el 80% del uso, y los
 * patrones al final porque son las que menos se tocan.
 */
export const TOOLS: ToolMeta[] = [
  // --------------------------------------------------------------- Líneas
  {
    id: "TRENDLINE",
    label: "Línea de tendencia",
    hint: "Dos puntos. Lo que más se usa: unir dos máximos o dos mínimos.",
    group: "LINEAS",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "extendLeft", "extendRight", "showPrice", "textLabel"],
  },
  {
    id: "RAY",
    label: "Rayo",
    hint: "Como la línea de tendencia, pero se prolonga hacia el futuro.",
    group: "LINEAS",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "showPrice", "textLabel"],
  },
  {
    id: "EXTENDED",
    label: "Línea extendida",
    hint: "Se prolonga por los dos lados, hasta salirse del gráfico.",
    group: "LINEAS",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "showPrice", "textLabel"],
  },
  {
    id: "HLINE",
    label: "Línea horizontal",
    hint: "Un precio, de lado a lado del gráfico.",
    group: "LINEAS",
    points: 1,
    params: ["color", "lineWidth", "lineStyle", "showPrice", "textLabel"],
  },
  {
    id: "HRAY",
    label: "Rayo horizontal",
    hint: "Un precio, desde donde lo pongas hacia la derecha.",
    group: "LINEAS",
    points: 1,
    params: ["color", "lineWidth", "lineStyle", "showPrice", "textLabel"],
  },
  {
    id: "VLINE",
    label: "Línea vertical",
    hint: "Un momento: la apertura, una noticia, el cierre de sesión.",
    group: "LINEAS",
    points: 1,
    params: ["color", "lineWidth", "lineStyle", "textLabel"],
  },
  {
    id: "CROSSLINE",
    label: "Cruz",
    hint: "Precio y momento a la vez, en cruz.",
    group: "LINEAS",
    points: 1,
    params: ["color", "lineWidth", "lineStyle", "showPrice"],
  },
  {
    id: "TREND_ANGLE",
    label: "Ángulo de tendencia",
    hint: "Una línea que además dice con cuántos grados sube o baja.",
    group: "LINEAS",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "extendRight", "showLabels", "fontSize"],
  },
  {
    id: "INFO_LINE",
    label: "Línea informativa",
    hint: "Una línea que dice cuánto se movió el precio y en cuántas velas.",
    group: "LINEAS",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "showPrice", "showLabels", "fontSize"],
  },
  {
    id: "ARROW",
    label: "Flecha",
    hint: "Señalar algo concreto: aquí entré, aquí me salté el plan.",
    group: "LINEAS",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "textLabel", "fontSize"],
  },

  // -------------------------------------------------------------- Figuras
  {
    id: "RECTANGLE",
    label: "Rectángulo",
    hint: "Una zona: rango, consolidación, hueco por cerrar.",
    group: "FIGURAS",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "textLabel"],
  },
  {
    id: "ROTATED_RECTANGLE",
    label: "Rectángulo rotado",
    hint: "Una zona que sigue la pendiente: dos puntos y un tercero para el grosor.",
    group: "FIGURAS",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "textLabel"],
  },
  {
    id: "ELLIPSE",
    label: "Elipse",
    hint: "Rodear algo sin decir que es una zona de precio exacta.",
    group: "FIGURAS",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "textLabel"],
  },
  {
    id: "TRIANGLE",
    label: "Triángulo",
    hint: "Tres puntos. Cuñas y triángulos de continuación.",
    group: "FIGURAS",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "textLabel"],
  },
  {
    id: "PARALLEL_CHANNEL",
    label: "Canal paralelo",
    hint: "Dos puntos para la línea y un tercero para la anchura.",
    group: "FIGURAS",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "extendRight", "textLabel"],
  },
  {
    id: "ARC",
    label: "Arco",
    hint: "Una curva entre dos puntos, con el tercero marcando cuánto se comba.",
    group: "FIGURAS",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "textLabel"],
  },
  {
    id: "CURVE",
    label: "Curva",
    hint: "Como el arco, pero cerrada y rellena: una zona curva.",
    group: "FIGURAS",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "textLabel"],
  },
  {
    id: "PATH",
    label: "Trazado",
    hint: "Varios puntos seguidos. Para seguir un movimiento que no es recto.",
    group: "FIGURAS",
    points: 4,
    params: ["color", "lineWidth", "lineStyle", "showLabels", "textLabel"],
  },
  {
    id: "POLYLINE",
    label: "Polilínea",
    hint: "Cinco puntos que se cierran solos: una zona de la forma que quieras.",
    group: "FIGURAS",
    points: 5,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "textLabel"],
  },

  // ------------------------------------------------------------ Fibonacci
  {
    id: "FIB",
    label: "Retroceso de Fibonacci",
    hint: "Del extremo al extremo del movimiento que quieres medir.",
    group: "FIBONACCI",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "levels", "showLabels", "showPrice", "extendRight"],
  },
  {
    id: "FIB_EXTENSION",
    label: "Extensión de Fibonacci",
    hint: "Tres puntos: impulso, retroceso y desde dónde proyectar.",
    group: "FIBONACCI",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "levels", "showLabels", "showPrice"],
  },
  {
    id: "FIB_FAN",
    label: "Abanico de Fibonacci",
    hint: "Rayos que salen del primer punto por cada nivel del movimiento.",
    group: "FIBONACCI",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "levels", "showLabels", "fontSize"],
  },
  {
    id: "FIB_TIMEZONE",
    label: "Zonas horarias de Fibonacci",
    hint: "Verticales en 1, 2, 3, 5, 8, 13… veces la distancia que marques.",
    group: "FIBONACCI",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "showLabels", "fontSize"],
  },
  {
    id: "FIB_CHANNEL",
    label: "Canal de Fibonacci",
    hint: "Un canal con los niveles repartidos entre sus dos bordes.",
    group: "FIBONACCI",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "levels", "showLabels", "extendRight", "fontSize"],
  },
  {
    id: "FIB_CIRCLE",
    label: "Círculos de Fibonacci",
    hint: "Anillos alrededor del primer punto, a cada nivel del radio.",
    group: "FIBONACCI",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "levels", "fill", "fillOpacity", "showLabels"],
  },
  {
    id: "PITCHFORK",
    label: "Horquilla de Andrews",
    hint: "Tres puntos: la mediana sale del primero, entre los otros dos.",
    group: "FIBONACCI",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "extendRight"],
  },
  {
    id: "GANN_BOX",
    label: "Caja de Gann",
    hint: "Una rejilla de precio y tiempo sobre el movimiento.",
    group: "FIBONACCI",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "levels", "showLabels"],
  },
  {
    id: "GANN_FAN",
    label: "Abanico de Gann",
    hint: "Los ángulos de Gann desde un punto: el 1×1 lo fija el segundo.",
    group: "FIBONACCI",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "levels", "showLabels", "fontSize"],
  },

  // ------------------------------------------------------------- Posición
  {
    id: "LONG_POSITION",
    label: "Posición larga",
    hint: "Entrada, stop y objetivo. Calcula la relación beneficio/riesgo.",
    group: "POSICION",
    points: 3,
    params: ["color", "fillOpacity", "riskReward", "accountSize", "riskPercent", "showPrice"],
  },
  {
    id: "SHORT_POSITION",
    label: "Posición corta",
    hint: "Lo mismo, al revés: el objetivo va por debajo.",
    group: "POSICION",
    points: 3,
    params: ["color", "fillOpacity", "riskReward", "accountSize", "riskPercent", "showPrice"],
  },

  // --------------------------------------------------------------- Medida
  {
    id: "DATE_PRICE_RANGE",
    label: "Rango de fecha y precio",
    hint: "Cuánto se movió y cuánto tardó, en un recuadro.",
    group: "MEDIDA",
    points: 2,
    params: ["color", "lineWidth", "fill", "fillOpacity", "showLabels"],
  },
  {
    id: "PRICE_RANGE",
    label: "Rango de precio",
    hint: "Sólo cuánto se movió, sin contar el tiempo.",
    group: "MEDIDA",
    points: 2,
    params: ["color", "lineWidth", "fill", "fillOpacity", "showLabels", "fontSize"],
  },
  {
    id: "DATE_RANGE",
    label: "Rango de fechas",
    hint: "Sólo cuánto duró, sin contar el precio.",
    group: "MEDIDA",
    points: 2,
    params: ["color", "lineWidth", "fill", "fillOpacity", "showLabels", "fontSize"],
  },
  {
    id: "FORECAST",
    label: "Proyección",
    hint: "Dónde crees que va: dos puntos y la flecha hacia donde apuntas.",
    group: "MEDIDA",
    points: 3,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "showPrice", "textLabel"],
  },

  // ------------------------------------------------------------- Patrones
  {
    id: "ELLIOTT",
    label: "Onda de Elliott",
    hint: "Cinco puntos numerados. El grado cambia cómo se etiquetan.",
    group: "PATRONES",
    points: 5,
    params: ["color", "lineWidth", "lineStyle", "waveDegree", "showLabels"],
  },
  {
    id: "XABCD",
    label: "Patrón XABCD",
    hint: "Cinco puntos con sus proporciones entre tramos.",
    group: "PATRONES",
    points: 5,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "showLabels"],
  },
  {
    id: "CYPHER",
    label: "Patrón Cypher",
    hint: "Un XABCD que además dice si cada tramo cae donde el Cypher pide.",
    group: "PATRONES",
    points: 5,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "showLabels"],
  },
  {
    id: "ABCD",
    label: "Patrón ABCD",
    hint: "Cuatro puntos: el tramo CD debería medir lo que midió el AB.",
    group: "PATRONES",
    points: 4,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "showLabels"],
  },
  {
    id: "TRIANGLE_PATTERN",
    label: "Patrón triangular",
    hint: "Cuatro toques que estrechan el rango: el triángulo de manual.",
    group: "PATRONES",
    points: 4,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "showLabels"],
  },
  {
    id: "THREE_DRIVES",
    label: "Tres impulsos",
    hint: "Siete puntos: tres empujes con sus dos retrocesos.",
    group: "PATRONES",
    points: 7,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "showLabels"],
  },
  {
    id: "HEAD_SHOULDERS",
    label: "Hombro-cabeza-hombro",
    hint: "Cinco puntos y la línea de cuello entre los valles.",
    group: "PATRONES",
    points: 5,
    params: ["color", "lineWidth", "lineStyle", "showLabels"],
  },

  // ---------------------------------------------------------- Anotaciones
  {
    id: "TEXT",
    label: "Texto",
    hint: "Escribir sobre el gráfico. El texto se pone en los ajustes.",
    group: "ANOTACION",
    points: 1,
    params: ["color", "textLabel", "fontSize"],
  },
  {
    id: "NOTE",
    label: "Nota",
    hint: "Texto dentro de un recuadro, para que destaque sobre las velas.",
    group: "ANOTACION",
    points: 1,
    params: ["color", "lineWidth", "fill", "fillOpacity", "textLabel", "fontSize"],
  },
  {
    id: "CALLOUT",
    label: "Llamada",
    hint: "Un recuadro con una línea que apunta a lo que comenta.",
    group: "ANOTACION",
    points: 2,
    params: ["color", "lineWidth", "lineStyle", "fill", "fillOpacity", "textLabel", "fontSize"],
  },
  {
    id: "PRICE_LABEL",
    label: "Etiqueta de precio",
    hint: "El precio de ese punto, escrito y enmarcado.",
    group: "ANOTACION",
    points: 1,
    params: ["color", "lineWidth", "fill", "fillOpacity", "textLabel", "fontSize"],
  },
  {
    id: "FLAG",
    label: "Banderín",
    hint: "Clavar una marca en un momento: la noticia, el error, la entrada.",
    group: "ANOTACION",
    points: 1,
    params: ["color", "lineWidth", "fill", "fillOpacity", "textLabel", "fontSize"],
  },
];

export const TOOL_BY_ID: Record<ToolId, ToolMeta> = Object.fromEntries(
  TOOLS.map((t) => [t.id, t]),
) as Record<ToolId, ToolMeta>;

export const TOOL_IDS: ToolId[] = TOOLS.map((t) => t.id);

export function isToolId(value: string): value is ToolId {
  return (TOOL_IDS as readonly string[]).includes(value);
}

/** Las herramientas agrupadas, en el orden de los grupos. */
export function toolsByGroup(): { group: ToolGroup; label: string; tools: ToolMeta[] }[] {
  const orden: ToolGroup[] = [
    "LINEAS",
    "FIGURAS",
    "FIBONACCI",
    "POSICION",
    "MEDIDA",
    "PATRONES",
    "ANOTACION",
  ];
  return orden.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    tools: TOOLS.filter((t) => t.group === group),
  }));
}
