-- Las herramientas de dibujo del gráfico, con sus parámetros.
--
-- Había cinco herramientas y un solo parámetro, el color. Ahora hay veintitrés
-- y cada una tiene sus ajustes: una línea se prolonga o no, un Fibonacci
-- enseña unos niveles u otros, una posición calcula su relación
-- beneficio/riesgo.
--
-- Dos cambios:
--
-- 1. `points` pasa de guardar `{p1, p2}` a guardar una lista. Hay herramientas
--    de uno, dos, tres, cuatro y cinco puntos, y una lista las cubre todas sin
--    inventar nombres como `p3`, `p4`, `p5`. Lo ya guardado se migra abajo.
--
-- 2. `style` es nuevo y guarda sólo lo que se aparta de los valores de fábrica.
--    Así, cambiar el valor por defecto de algo llega a los dibujos que nunca lo
--    tocaron, en vez de dejarlos congelados con lo que era normal el día que se
--    dibujaron. Es el mismo criterio que ya seguían los niveles de Fibonacci al
--    vivir en el código.
--
-- La columna `color` se queda: los dibujos viejos la tienen puesta y el
-- lector la usa como valor de partida cuando `style` no trae color. Borrarla
-- obligaría a migrar el color de cada fila y no gana nada.

alter table public.chart_drawings
  add column if not exists style jsonb not null default '{}'::jsonb;

alter table public.chart_drawings
  drop constraint if exists chart_drawings_style_is_object;

alter table public.chart_drawings
  add constraint chart_drawings_style_is_object
  check (jsonb_typeof(style) = 'object');

-- El catálogo entero. La restricción anterior sólo aceptaba las cinco de
-- antes, así que sin esto cualquier herramienta nueva fallaría al guardarse.
alter table public.chart_drawings
  drop constraint if exists chart_drawings_tool_check;

alter table public.chart_drawings
  add constraint chart_drawings_tool_check check (tool in (
    -- Líneas
    'HLINE', 'HRAY', 'VLINE', 'TRENDLINE', 'RAY', 'EXTENDED', 'CROSSLINE',
    -- Figuras
    'RECTANGLE', 'ELLIPSE', 'TRIANGLE', 'PARALLEL_CHANNEL', 'ARC', 'PATH',
    -- Fibonacci y Gann
    'FIB', 'FIB_EXTENSION', 'PITCHFORK', 'GANN_BOX',
    -- Posición
    'LONG_POSITION', 'SHORT_POSITION',
    -- Medida y proyección
    'DATE_PRICE_RANGE', 'FORECAST',
    -- Patrones
    'ELLIOTT', 'XABCD', 'HEAD_SHOULDERS'
  ));

-- Lo ya dibujado, a la forma nueva.
--
-- Se hace en SQL y no en el lector para que quede una sola forma en la tabla:
-- un lector que entiende dos formatos es uno que hay que mantener entendiendo
-- dos formatos para siempre, y el segundo se olvida al añadir el tercero.
update public.chart_drawings
set points = jsonb_build_array(points -> 'p1', points -> 'p2')
where jsonb_typeof(points) = 'object'
  and points ? 'p1'
  and points ? 'p2';

-- Las de un punto guardaban `{price}` o `{time}` sueltos. Se envuelven en una
-- lista con un solo elemento, conservando lo que hubiera.
update public.chart_drawings
set points = jsonb_build_array(points)
where jsonb_typeof(points) = 'object'
  and (points ? 'price' or points ? 'time');

comment on column public.chart_drawings.points is
  'Lista de {time, price}. Uno a cinco puntos según la herramienta.';
comment on column public.chart_drawings.style is
  'Sólo lo que se aparta de los valores de fábrica; el resto sale del código.';
