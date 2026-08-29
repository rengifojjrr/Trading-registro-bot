-- El resto de la barra de TradingView: de veintitrés herramientas a cuarenta y
-- cinco.
--
-- Faltaban familias enteras -- las anotaciones (texto, nota, llamada, etiqueta
-- de precio, banderín), los abanicos de Fibonacci y de Gann, los patrones ABCD
-- y de tres impulsos -- que en la barra están y aquí no se podían ni elegir.
--
-- Sólo cambia la lista de valores admitidos: la forma de `points` y de `style`
-- es la misma que dejó la migración anterior, y por eso las nuevas no necesitan
-- nada más que estar permitidas.
--
-- La de tres impulsos usa siete puntos, dos más que la que más usaba hasta
-- ahora. `points` es una lista, así que eso no obliga a tocar la tabla; el
-- comentario de la columna sí, porque decía «uno a cinco».

alter table public.chart_drawings
  drop constraint if exists chart_drawings_tool_check;

alter table public.chart_drawings
  add constraint chart_drawings_tool_check check (tool in (
    -- Líneas
    'HLINE', 'HRAY', 'VLINE', 'TRENDLINE', 'RAY', 'EXTENDED', 'CROSSLINE',
    'TREND_ANGLE', 'INFO_LINE', 'ARROW',
    -- Figuras
    'RECTANGLE', 'ROTATED_RECTANGLE', 'ELLIPSE', 'TRIANGLE',
    'PARALLEL_CHANNEL', 'ARC', 'CURVE', 'PATH', 'POLYLINE',
    -- Fibonacci y Gann
    'FIB', 'FIB_EXTENSION', 'FIB_FAN', 'FIB_TIMEZONE', 'FIB_CHANNEL',
    'FIB_CIRCLE', 'PITCHFORK', 'GANN_BOX', 'GANN_FAN',
    -- Posición
    'LONG_POSITION', 'SHORT_POSITION',
    -- Medida y proyección
    'DATE_PRICE_RANGE', 'PRICE_RANGE', 'DATE_RANGE', 'FORECAST',
    -- Patrones
    'ELLIOTT', 'XABCD', 'CYPHER', 'ABCD', 'TRIANGLE_PATTERN', 'THREE_DRIVES',
    'HEAD_SHOULDERS',
    -- Anotaciones
    'TEXT', 'NOTE', 'CALLOUT', 'PRICE_LABEL', 'FLAG'
  ));

comment on column public.chart_drawings.points is
  'Lista de {time, price}. De uno a siete puntos según la herramienta.';
