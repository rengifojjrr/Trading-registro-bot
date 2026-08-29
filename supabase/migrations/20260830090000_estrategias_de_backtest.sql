-- Las estrategias de backtest.
--
-- Tabla propia y no una columna en `strategies`. Las dos se llaman
-- «estrategia» y no son lo mismo: `strategies` es una etiqueta que le pones a
-- una operación que ya hiciste --«esto fue una ruptura de rango»-- y esto es
-- un conjunto de reglas ejecutables. Meterlas juntas obligaría a que la mitad
-- de las columnas estuvieran vacías en cada fila según de cuál se trate, que
-- es el síntoma de que son dos cosas.
--
-- Las reglas van en `jsonb` y no en columnas. Su forma es un árbol de
-- condiciones que va a cambiar cada vez que se añada un bloque nuevo, y una
-- migración por cada bloque sería el precio de haberlas puesto en columnas.
-- Lo que no cambia --nombre, producto, si está activa-- sí tiene su columna,
-- porque es por lo que se busca y se ordena.

create table if not exists public.backtest_strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  /* El producto sobre el que se pensó. Una regla de Bitcoin sobre Ethereum no
     significa nada, y guardarlo evita correrla sobre lo que no toca. */
  product_id text,
  /* Las condiciones, el horario, los cierres y el tamaño. */
  rules jsonb not null default '{}'::jsonb,
  /* Comisión, deslizamiento y tamaño de tick con los que se probó. Se guardan
     con la estrategia porque un resultado sin ellos no se puede interpretar:
     el mismo backtest con comisión cero y con comisión real son dos cosas. */
  costs jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint backtest_strategies_name_not_blank check (length(trim(name)) > 0),
  constraint backtest_strategies_rules_is_object check (jsonb_typeof(rules) = 'object'),
  constraint backtest_strategies_costs_is_object check (jsonb_typeof(costs) = 'object'),
  /* Dos estrategias con el mismo nombre son imposibles de distinguir en una
     lista, que es donde se eligen. */
  constraint backtest_strategies_unique_name unique (user_id, name)
);

create index if not exists backtest_strategies_user_idx
  on public.backtest_strategies (user_id, created_at desc);

alter table public.backtest_strategies enable row level security;

drop policy if exists "backtest_strategies_own" on public.backtest_strategies;
create policy "backtest_strategies_own"
  on public.backtest_strategies
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.backtest_strategies is
  'Reglas ejecutables de backtest. Distinta de `strategies`, que etiqueta operaciones ya hechas.';
comment on column public.backtest_strategies.rules is
  'Condiciones de entrada y salida, horario y tamaño. Ver lib/backtest/types.ts.';
comment on column public.backtest_strategies.costs is
  'Comisión, deslizamiento y tick con los que se probó: sin ellos el resultado no se puede interpretar.';
