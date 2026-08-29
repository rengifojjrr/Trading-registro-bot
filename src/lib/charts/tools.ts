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
  // -------------------------------------------------------------- Figuras
  | "RECTANGLE"
  | "ELLIPSE"
  | "TRIANGLE"
  | "PARALLEL_CHANNEL"
  | "ARC"
  | "PATH"
  // ------------------------------------------------------------ Fibonacci
  | "FIB"
  | "FIB_EXTENSION"
  | "PITCHFORK"
  | "GANN_BOX"
  // ------------------------------------------------------------ Posición
  | "LONG_POSITION"
  | "SHORT_POSITION"
  // -------------------------------------------------------------- Medida
  | "DATE_PRICE_RANGE"
  | "FORECAST"
  // ------------------------------------------------------------- Patrones
  | "ELLIOTT"
  | "XABCD"
  | "HEAD_SHOULDERS";

export type ToolGroup = "LINEAS" | "FIGURAS" | "FIBONACCI" | "POSICION" | "MEDIDA" | "PATRONES";

export const GROUP_LABELS: Record<ToolGroup, string> = {
  LINEAS: "Líneas",
  FIGURAS: "Figuras",
  FIBONACCI: "Fibonacci y Gann",
  POSICION: "Posición",
  MEDIDA: "Medida y proyección",
  PATRONES: "Patrones",
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
  | "waveDegree";

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
    id: "PATH",
    label: "Trazado",
    hint: "Varios puntos seguidos. Para seguir un movimiento que no es recto.",
    group: "FIGURAS",
    points: 4,
    params: ["color", "lineWidth", "lineStyle", "showLabels", "textLabel"],
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
    id: "HEAD_SHOULDERS",
    label: "Hombro-cabeza-hombro",
    hint: "Cinco puntos y la línea de cuello entre los valles.",
    group: "PATRONES",
    points: 5,
    params: ["color", "lineWidth", "lineStyle", "showLabels"],
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
  const orden: ToolGroup[] = ["LINEAS", "FIGURAS", "FIBONACCI", "POSICION", "MEDIDA", "PATRONES"];
  return orden.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    tools: TOOLS.filter((t) => t.group === group),
  }));
}
