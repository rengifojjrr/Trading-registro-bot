-- Titulares: lo que mueve el precio y no está en ningún calendario.
--
-- El calendario económico sólo sabe de lo que está programado -- el IPC sale
-- el día 12 a las 12:30 desde hace décadas. Una moción de cierre que fracasa
-- en el Senado, un hackeo o un ETF aprobado no están en ninguna agenda y
-- mueven el precio igual o más. La aplicación no decía nada de eso.
--
-- Tabla de referencia, como `economic_events`: sin `user_id`, la escribe la
-- sincronización con el rol de servicio y la lee cualquiera que haya entrado.
-- Un titular de Reuters no es de nadie.
create table if not exists public.market_news (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'TRADINGVIEW',
  -- El identificador de la fuente. Junto con `source` es la clave de
  -- idempotencia: sincronizar la misma ventana diez veces no duplica nada.
  source_news_id text not null,
  published_at timestamptz not null,
  title text not null,
  -- Quién lo publica. No es decoración: que algo lo diga Reuters o lo diga un
  -- blog cambia cuánto pesa, y es lo primero que se mira en una lista.
  provider text,
  url text,
  -- El resumen viene de una segunda petición por titular, así que puede
  -- faltar: sin él la ficha se lee igual, con el titular y el gráfico.
  summary text,
  /**
   * Los símbolos que la fuente relaciona con el titular. Sirve para no
   * guardar noticias de otro mercado cuando se amplíe a más productos.
   */
  symbols text[] not null default '{}',
  /**
   * El tema, deducido por reglas sobre el titular (`lib/market-news/temas.ts`).
   * Vacío cuando ninguna regla casa: es preferible a colgarle un tema
   * inventado, porque un filtro por temas sólo vale si los temas son ciertos.
   */
  topics text[] not null default '{}',
  -- Lo que hizo el precio después, medido sobre velas de un minuto. Null
  -- mientras no se haya medido; cero es una medición que dio cero.
  move_pct_1h numeric,
  max_move_pct_1h numeric,
  measured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_news_id)
);

alter table public.market_news enable row level security;

create policy "market_news_select_authenticated" on public.market_news
  for select to authenticated using (true);

create trigger set_market_news_updated_at
  before update on public.market_news
  for each row execute function public.set_updated_at();

create index if not exists market_news_published_idx on public.market_news (published_at desc);
-- Para «los que de verdad movieron»: se ordena por el movimiento medido entre
-- los que ya tienen medición.
create index if not exists market_news_movimiento_idx
  on public.market_news (published_at desc)
  where measured_at is not null;
