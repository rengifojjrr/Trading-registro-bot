-- Un dibujo puede colgar de una operación o de una publicación macro.
--
-- `chart_drawings.trade_id` era `not null`, y eso era justo lo que impedía
-- que el gráfico de una noticia tuviera las mismas herramientas que el de una
-- operación: no había dónde guardar la línea. El resultado eran dos gráficos
-- distintos en la misma aplicación, uno con herramientas y otro sin ellas, y
-- el segundo se siente roto precisamente porque el primero existe.
--
-- Un dueño y sólo uno. La alternativa -- dos columnas sin restricción -- deja
-- que exista una fila con las dos puestas o con ninguna, y entonces cada
-- consulta tiene que decidir qué significa eso. `num_nonnulls` lo impide en la
-- base de datos, que es donde las reglas no se olvidan.
alter table public.chart_drawings
  alter column trade_id drop not null;

alter table public.chart_drawings
  add column if not exists event_id uuid references public.economic_events (id) on delete cascade;

alter table public.chart_drawings
  drop constraint if exists chart_drawings_un_solo_dueno;

alter table public.chart_drawings
  add constraint chart_drawings_un_solo_dueno
  check (num_nonnulls(trade_id, event_id) = 1);

create index if not exists chart_drawings_event_idx on public.chart_drawings (event_id);

comment on column public.chart_drawings.event_id is
  'La publicación macro sobre cuyo gráfico se dibujó. Excluyente con trade_id.';
