-- El calendario económico: qué se publica, cuándo, y qué salió.
--
-- Operar futuros de Bitcoin con apalancamiento y no saber que el IPC sale en
-- veinte minutos es la clase de sorpresa que cuesta una liquidación. La
-- aplicación ya sabe qué posición tienes abierta; lo que le faltaba era saber
-- qué viene, para poder ponerlas una al lado de la otra.
--
-- Es una tabla de **referencia**, no de usuario: que la Oficina de Estadísticas
-- Laborales publique el IPC el jueves a las 12:30 UTC es un hecho del mundo,
-- igual que el tamaño de un contrato en `products`. Por eso lleva la misma
-- política que aquélla -- cualquiera autenticado la lee, sólo el service role
-- la escribe -- y no `user_id`.
--
-- `source` existe desde el primer día aunque hoy sólo haya una fuente: el
-- adaptador es reemplazable a propósito (ver src/lib/economic-calendar), y el
-- día que la fuente cambie, las filas viejas tienen que seguir sabiendo de
-- dónde salieron en vez de mentir.

create table if not exists public.economic_events (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'TRADINGVIEW',
  -- El identificador que le da la fuente. Junto con `source` es la clave de
  -- idempotencia: sincronizar la misma ventana diez veces no duplica nada.
  source_event_id text not null,
  -- Cuándo se publica, en UTC. La aplicación lo pasa a la zona horaria de
  -- `app_settings` al enseñarlo; guardarlo ya convertido haría imposible
  -- cambiar de zona sin reescribir la tabla.
  occurs_at timestamptz not null,
  country text not null,
  currency text,
  title text not null,
  -- El nombre largo del indicador. `title` es «PPI MoM»; esto es «Producer
  -- Price Inflation MoM», y es lo que permite agrupar las publicaciones de un
  -- mismo indicador a lo largo del tiempo.
  indicator text,
  category text,
  -- -1 baja, 0 media, 1 alta. Es la escala de la fuente, guardada tal cual:
  -- traducirla aquí a otra cosa obligaría a mantener dos escalas sincronizadas.
  importance smallint not null default 0,
  -- El periodo al que se refiere el dato («Ago», «Sep/05»), que no es lo mismo
  -- que la fecha de publicación.
  period text,
  actual numeric,
  forecast numeric,
  previous numeric,
  -- Cómo se escribe el número: '%' y 'K' son cosas distintas y las dos hacen
  -- falta para que «205» se lea «205K» y no doscientos cinco.
  unit text,
  scale text,
  comment text,
  source_name text,
  source_url text,
  raw_payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_event_id)
);

alter table public.economic_events enable row level security;

create policy "economic_events_select_authenticated" on public.economic_events
  for select using ((select auth.role()) = 'authenticated');
-- Sin políticas de escritura a propósito: sólo el cliente de service role
-- (que se salta RLS) refresca esta tabla, igual que en `products`.

create trigger set_economic_events_updated_at
  before update on public.economic_events
  for each row execute function public.set_updated_at();

-- La consulta que hace la pantalla es siempre «los de esta ventana de fechas,
-- en orden», y muchas veces «sólo los importantes».
create index if not exists economic_events_occurs_idx
  on public.economic_events (occurs_at);
create index if not exists economic_events_importance_idx
  on public.economic_events (importance, occurs_at);
-- Para «las últimas veces que salió este mismo indicador».
create index if not exists economic_events_indicator_idx
  on public.economic_events (indicator, occurs_at desc);

comment on table public.economic_events is
  'Calendario económico: publicaciones macro con hora, importancia, previsión, dato previo y dato real. Tabla de referencia (sin user_id), escrita sólo por el service role desde src/lib/economic-calendar.';
comment on column public.economic_events.importance is
  '-1 baja, 0 media, 1 alta. Escala de la fuente, guardada sin traducir.';
comment on column public.economic_events.occurs_at is
  'Momento de publicación en UTC. Se convierte a la zona del usuario al mostrarlo, nunca al guardarlo.';
