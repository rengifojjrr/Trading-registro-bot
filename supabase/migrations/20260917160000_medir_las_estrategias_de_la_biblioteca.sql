/*
  Dónde se guarda lo que mide una estrategia de la biblioteca.

  De las veintidós estrategias del catálogo, once salían como «Sin medir». No
  era un descuido: la regla del módulo dice que `medido` es null salvo que
  exista la medición, porque «un número de rentabilidad inventado en una ficha
  que el usuario va a enseñar es una mentira, y una que nadie va a poder
  detectar». Las once que faltaban simplemente no estaban en el estudio de
  agosto.

  La salida no es escribirles unas cifras a mano --sería la misma mentira, sólo
  que accidental-- sino poder medirlas de verdad desde la aplicación: traer el
  histórico, pasarlo por el mismo `runBacktest` con el que se midieron las
  otras, y guardar el resultado aquí.

  Lo que se guarda es **la medición, no la estrategia**. Por eso la clave es el
  `slug` de la biblioteca y no una referencia a `backtest_strategies`: la
  biblioteca es código, existe sin que nadie haya dado de alta un bot, y se
  puede medir antes de decidir si se quiere. Y por eso hay una fila por
  usuario: cada uno mide cuando quiere y sobre el histórico que haya en ese
  momento.

  Una sola fila por estrategia y usuario, que se pisa al volver a medir. El
  histórico de mediciones sería otra tabla y otra pantalla; lo que hace falta
  aquí es la última, que es contra la que se decide.
*/

create table if not exists public.strategy_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  /* El identificador de la biblioteca (`lib/paper/strategy-library.ts`). */
  slug text not null,

  /* Las cuatro cifras con las que se compara una estrategia con otra. */
  pnl_pct numeric not null,
  dd_pct numeric not null,
  trades integer not null,
  profit_factor numeric,

  /* Sobre qué se midió: producto, temporalidad, cuántas velas y desde cuándo.
     Sin esto una cifra no significa nada -- un +30% en doce días de velas de
     cinco minutos y un +30% en cinco años no son la misma frase. */
  market text not null,
  timeframe text not null,
  velas integer not null,
  desde timestamptz not null,
  hasta timestamptz not null,
  /* La comisión por lado con la que se midió, en porcentaje. */
  comision_pct numeric not null,

  measured_at timestamptz not null default now(),

  constraint strategy_measurements_una_por_slug unique (user_id, slug)
);

comment on table public.strategy_measurements is
  'La última medición de cada estrategia de la biblioteca, por usuario. Las cifras salen de runBacktest sobre histórico real; nunca se escriben a mano.';

alter table public.strategy_measurements enable row level security;

/* `(select auth.uid())` y no `auth.uid()` suelto: envuelto se evalúa una vez
   por consulta en lugar de una vez por fila. Ver `docs/DATABASE.md`. */
create policy strategy_measurements_own_rows on public.strategy_measurements
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

/* Toda consulta filtra por usuario y luego por slug, que es como se lee la
   biblioteca entera de una vez para pintarla. */
create index if not exists strategy_measurements_slug_idx
  on public.strategy_measurements (user_id, slug);
