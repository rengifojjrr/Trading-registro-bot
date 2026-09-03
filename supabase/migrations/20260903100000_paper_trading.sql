-- El papel: los bots operando con dinero de mentira sobre el mercado de verdad.
--
-- Entre el backtest y la cuenta real falta el paso más aburrido y el que más
-- bots mata: verlos operar en vivo, con el precio que va llegando, sin poner
-- un euro. Un backtest sabe el futuro de la vela que está evaluando; esto no.
-- Por eso una simulación en papel de tres meses dice cosas que mil pasadas de
-- Monte Carlo no dicen: si el bot se queda colgado, si el dato le llega tarde,
-- si el deslizamiento se come lo que el backtest daba por ganado.
--
-- Cuatro tablas y unos ajustes, con una idea detrás de cada una:
--
--   * `paper_accounts`      -- el dinero: cuánto se le asignó, cuánto queda
--                              libre y cuánto vale ahora. Una por bot.
--   * `paper_positions`     -- lo que tiene abierto ahora mismo. Como mucho
--                              una por bot, porque aquí no se piramida.
--   * `paper_trades`        -- la operación ya cerrada. Es la trazabilidad: si
--                              una cifra de la ficha no se puede explicar
--                              sumando filas de aquí, la cifra está mal.
--   * `paper_equity_points` -- la curva, para poder pintarla sin recorrer el
--                              histórico entero cada vez.
--
-- No se reutiliza `trades` como hacen los bots reales. `trades` son
-- operaciones que pasaron de verdad, reconstruidas desde los fills de
-- Coinbase, y con ellas se declaran impuestos y se mide cómo va la cuenta.
-- Meter dinero inventado ahí obligaría a filtrar «lo que es de mentira» en
-- cada consulta del resto de la aplicación, y el día que se olvide un filtro
-- el P&L del año sale mal. Separadas, lo peor que puede pasar es que una
-- pantalla salga vacía.

-- Los costes de la simulación, uno por usuario.
--
-- Globales y no por bot: son del simulador, no de la estrategia. Si un día se
-- decide que el deslizamiento real es el doble, cambia para todos a la vez y
-- la comparación entre bots -- que es para lo que existe la pantalla -- sigue
-- siendo una comparación. Un bot con costes propios sería un bot compitiendo
-- con ventaja, y acabaría ganando el que tuviera el dueño más optimista.
create table if not exists public.paper_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  /* Lo que se cobra al entrar y al salir, en porcentaje del importe. */
  comision_pct numeric not null default 0.2,
  /* Lo que se paga por no ejecutar al precio que se veía. Es buena parte de
     la diferencia entre un backtest y la realidad, y por eso tiene su propio
     número en vez de ir sumado a la comisión: cuando un bot deja de
     funcionar hay que poder preguntarse si es él o si se le está cobrando de
     más. */
  deslizamiento_pct numeric not null default 0.02,
  /* Con cuánto se abre una cuenta nueva si el usuario no dice otra cosa. */
  capital_por_defecto numeric not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint paper_settings_comision_range check (comision_pct >= 0 and comision_pct <= 5),
  constraint paper_settings_deslizamiento_range check (deslizamiento_pct >= 0 and deslizamiento_pct <= 5),
  constraint paper_settings_capital_positivo check (capital_por_defecto > 0)
);

alter table public.paper_settings enable row level security;

drop policy if exists "paper_settings_own" on public.paper_settings;
create policy "paper_settings_own"
  on public.paper_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists set_paper_settings_updated_at on public.paper_settings;
create trigger set_paper_settings_updated_at
  before update on public.paper_settings
  for each row execute function public.set_updated_at();

comment on table public.paper_settings is
  'Costes y capital de partida de la simulación en papel. Uno por usuario: los mismos para todos sus bots, para que compararlos signifique algo.';
comment on column public.paper_settings.deslizamiento_pct is
  'Lo que se paga por no ejecutar al precio que se veía. Separado de la comisión para poder saber si un bot deja de funcionar por él.';

-- La cuenta ficticia de un bot.
--
-- Una por bot y no una por intento: reiniciar la simulación vacía sus
-- operaciones y su curva, no crea una segunda fila. Si algún día hace falta
-- comparar dos simulaciones del mismo bot, eso es una tabla de «sesiones» con
-- su propio identificador, no una cuenta duplicada que habría que desempatar
-- por fecha en cada consulta.
create table if not exists public.paper_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  /* Encendida o apagada. Apagada no es lo mismo que vacía: conserva capital,
     histórico y curva, y volver a encenderla continúa donde lo dejó. Nace
     apagada a propósito -- crear la cuenta y ponerla a operar son dos
     decisiones distintas, y la segunda la toma el usuario. */
  enabled boolean not null default false,
  /* Lo que le puso el usuario, lo que queda sin invertir y lo que vale ahora
     mismo (el efectivo más lo que valdría cerrar la posición abierta).
     Las tres se guardan y no se derivan del histórico. La pantalla que el
     usuario quiere es «todos los bots a la vez», y sacar el equity de cada
     uno recorriendo sus operaciones y su posición sería pagar el mismo
     recorrido en cada pintado. La verdad la sigue teniendo `paper_trades`:
     esto es el acumulado, y un recálculo puede rehacerlo desde ahí.
     Subirle o bajarle el dinero a un bot es mover `capital_asignado` y
     `efectivo` en la misma cantidad: el capital dice cuánto se le confió y el
     efectivo cuánto de eso está disponible. */
  capital_asignado numeric not null,
  efectivo numeric not null,
  equity numeric not null,
  /* Cuándo se encendió por primera vez: sin ella un «+8%» no significa nada,
     porque no se sabe en cuánto tiempo. */
  started_at timestamptz,
  /* Cuándo lo miró por última vez el simulador. Es lo que delata a un bot
     encendido al que no le está llegando precio: sin esta columna, «no ha
     operado porque no había señal» y «no se está ejecutando» se ven igual en
     la lista, y son cosas muy distintas. */
  last_tick_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /* Una cuenta por bot. Dos cuentas del mismo bot sumarían dos veces en el
     total del portfolio sin que nada avisara. */
  constraint paper_accounts_uno_por_bot unique (bot_id),
  constraint paper_accounts_capital_no_negativo check (capital_asignado >= 0),
  constraint paper_accounts_efectivo_no_negativo check (efectivo >= 0),
  /* Una cuenta simulada no puede deber dinero: el simulador tiene que cerrar
     la posición y apagar el bot antes de llegar ahí. Si esta restricción
     salta no es un problema de escritura, es que la gestión de riesgo del
     simulador dejó pasar algo, y es mejor que la escritura falle a que la
     ficha enseñe un patrimonio negativo como si fuera normal. */
  constraint paper_accounts_equity_no_negativo check (equity >= 0),
  /* Encendida sin fecha de encendido es una cuenta que no se puede ordenar ni
     medir. Al encender se ponen las dos a la vez:
     `set enabled = true, started_at = coalesce(started_at, now())`. */
  constraint paper_accounts_encendida_con_fecha check (not enabled or started_at is not null)
);

/* La lista del usuario enseña los encendidos primero y luego por antigüedad. */
create index if not exists paper_accounts_user_idx
  on public.paper_accounts (user_id, enabled, created_at desc);

alter table public.paper_accounts enable row level security;

drop policy if exists "paper_accounts_own" on public.paper_accounts;
create policy "paper_accounts_own"
  on public.paper_accounts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists set_paper_accounts_updated_at on public.paper_accounts;
create trigger set_paper_accounts_updated_at
  before update on public.paper_accounts
  for each row execute function public.set_updated_at();

comment on table public.paper_accounts is
  'La cuenta de dinero ficticio de un bot sobre precio real. Una por bot; apagada conserva capital, histórico y curva.';
comment on column public.paper_accounts.equity is
  'Efectivo más el valor de la posición abierta. Se guarda y no se deriva porque la pantalla pinta todos los bots a la vez.';
comment on column public.paper_accounts.last_tick_at is
  'Última vez que el simulador miró esta cuenta. Distingue «sin señal» de «no se está ejecutando».';

-- Lo que el bot tiene abierto ahora mismo.
--
-- Como mucho una posición por bot, y eso lo garantiza el índice único parcial
-- de abajo, no el código. El repositorio no piramida: una segunda entrada del
-- mismo bot es un fallo del simulador -- una señal repetida, dos ejecuciones a
-- la vez -- y sin la restricción ese fallo no se ve hasta que el equity está
-- descuadrado y ya no se sabe por qué.
create table if not exists public.paper_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  side text not null,
  size numeric not null,
  /* El precio al que se entró, ya con el deslizamiento aplicado: lo que hace
     falta después es a qué precio se entró de verdad, no cuál se veía. */
  precio_entrada numeric not null,
  hora_entrada timestamptz not null default now(),
  /* Nulos porque no toda estrategia sale por precio: hay salidas por número
     de velas y por condición, y ésas entran sin stop ni objetivo puestos. */
  stop numeric,
  objetivo numeric,
  /* El ATR del momento de entrar. Se guarda porque el stop suele ser un
     múltiplo suyo, y el ATR de hoy no es el de aquel día: sin esta columna no
     se puede saber después a cuántos ATR estaba puesto el stop. */
  atr_entrada numeric,
  /* Al cerrar se marca CERRADA y se escribe la fila de `paper_trades`; la
     posición no se borra. Si el cálculo de la operación fallara, borrarla
     dejaría un hueco sin rastro de que llegó a existir. El índice único sólo
     mira las abiertas, así que el bot puede volver a entrar en el acto. */
  status text not null default 'ABIERTA',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint paper_positions_side_known check (side in ('LARGO', 'CORTO')),
  constraint paper_positions_status_known check (status in ('ABIERTA', 'CERRADA')),
  constraint paper_positions_size_positivo check (size > 0),
  constraint paper_positions_precio_positivo check (precio_entrada > 0),
  constraint paper_positions_stop_positivo check (stop is null or stop > 0),
  constraint paper_positions_objetivo_positivo check (objetivo is null or objetivo > 0),
  constraint paper_positions_atr_no_negativo check (atr_entrada is null or atr_entrada >= 0)
);

create unique index if not exists paper_positions_una_abierta_por_bot
  on public.paper_positions (bot_id)
  where status = 'ABIERTA';

create index if not exists paper_positions_bot_idx
  on public.paper_positions (bot_id, hora_entrada desc);

alter table public.paper_positions enable row level security;

drop policy if exists "paper_positions_own" on public.paper_positions;
create policy "paper_positions_own"
  on public.paper_positions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists set_paper_positions_updated_at on public.paper_positions;
create trigger set_paper_positions_updated_at
  before update on public.paper_positions
  for each row execute function public.set_updated_at();

comment on table public.paper_positions is
  'La posición simulada de un bot. Como mucho una abierta por bot: lo garantiza el índice único parcial paper_positions_una_abierta_por_bot.';
comment on column public.paper_positions.atr_entrada is
  'El ATR en el momento de entrar. Sin él no se puede saber después a cuántos ATR estaba el stop, porque el ATR de hoy no es el de aquel día.';

-- La operación cerrada. Esto es la trazabilidad.
--
-- Toda cifra que enseñe la ficha de un bot en papel -- rentabilidad, factor de
-- beneficio, racha, drawdown -- tiene que salir de sumar filas de esta tabla.
-- Si una cifra no se puede reconstruir desde aquí, la cifra está mal.
--
-- El precio y la hora de entrada se copian aunque también estén en la posición
-- de la que salió: una operación cerrada es un hecho terminado y tiene que
-- poder leerse sola, sin depender de que la posición siga existiendo.
create table if not exists public.paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  /* De qué posición salió, para poder ir de la operación a lo que se pensaba
     al abrirla: el stop, el objetivo y el ATR de aquel día. Se pone a nulo si
     la posición desaparece, porque la operación sigue siendo cierta sin ella. */
  position_id uuid references public.paper_positions(id) on delete set null,
  side text not null,
  size numeric not null,
  precio_entrada numeric not null,
  hora_entrada timestamptz not null,
  precio_salida numeric not null,
  hora_salida timestamptz not null,
  /* El resultado en dinero y en porcentaje. Los dos guardados: el porcentaje
     no se saca del dinero sin arrastrar sobre qué se calculó -- si sobre el
     importe de la posición o sobre el equity de la cuenta aquel día -- y esa
     ambigüedad es la que hace que dos pantallas enseñen números distintos de
     la misma operación. `pnl` es neto: la comisión ya está descontada. */
  pnl numeric not null,
  pnl_pct numeric not null,
  /* Lo que se llevaron los costes, aparte, para poder ver cuánto habría
     ganado el bot sin ellos. Un bot que sólo pierde por comisiones no se
     retira: se le hace operar menos. */
  comision numeric not null default 0,
  /* Por qué se cerró. APAGADO es el usuario apagando la cuenta con la
     posición abierta, y no es lo mismo que MANUAL, que es cerrar esta
     operación a mano; mezclarlos escondería que las salidas por apagón suelen
     ser las peores del histórico. */
  motivo_salida text not null,
  /* Cuántas velas aguantó. Es lo que separa «el sistema acertó» de «el
     sistema acertó por los pelos»: una salida por tiempo a las dos barras y
     otra a las doscientas no son la misma estrategia. */
  barras_en_mercado integer,
  created_at timestamptz not null default now(),

  constraint paper_trades_side_known check (side in ('LARGO', 'CORTO')),
  constraint paper_trades_motivo_known check (
    motivo_salida in ('STOP', 'OBJETIVO', 'TIEMPO', 'CONDICION', 'MANUAL', 'APAGADO')
  ),
  constraint paper_trades_size_positivo check (size > 0),
  constraint paper_trades_precios_positivos check (precio_entrada > 0 and precio_salida > 0),
  constraint paper_trades_comision_no_negativa check (comision >= 0),
  constraint paper_trades_barras_no_negativas check (
    barras_en_mercado is null or barras_en_mercado >= 0
  ),
  /* Salir antes de entrar rompe cualquier cálculo de duración y cualquier
     curva ordenada por fecha. Se permite la igualdad: entrar y salir dentro
     de la misma vela es legítimo. */
  constraint paper_trades_orden_temporal check (hora_salida >= hora_entrada)
);

/* La ficha de un bot pide sus últimas operaciones y la pantalla de todos pide
   las últimas del usuario. Son dos recorridos distintos, y por eso dos
   índices y no uno. */
create index if not exists paper_trades_bot_idx
  on public.paper_trades (bot_id, hora_salida desc);

create index if not exists paper_trades_user_idx
  on public.paper_trades (user_id, hora_salida desc);

alter table public.paper_trades enable row level security;

drop policy if exists "paper_trades_own" on public.paper_trades;
create policy "paper_trades_own"
  on public.paper_trades
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.paper_trades is
  'Operaciones simuladas ya cerradas. Es la trazabilidad: toda cifra de la ficha de un bot en papel tiene que salir de sumar filas de aquí.';
comment on column public.paper_trades.pnl is
  'Resultado neto en dinero, con la comisión ya descontada. La comisión se guarda aparte en su propia columna.';
comment on column public.paper_trades.motivo_salida is
  'STOP, OBJETIVO, TIEMPO, CONDICION, MANUAL o APAGADO. APAGADO es el usuario apagando la cuenta con la posición abierta, distinto de MANUAL.';

-- La curva de capital, un punto por cada vez que el simulador mira la cuenta.
--
-- Tabla propia en vez de derivar la curva de las operaciones. Una curva hecha
-- sólo con cierres es una escalera que se salta justo lo que interesa: el
-- hueco de dentro de una operación que llegó a perder un 15% antes de cerrar
-- en verde. El drawdown de verdad vive en esos huecos.
create table if not exists public.paper_equity_points (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  ts timestamptz not null default now(),
  equity numeric not null,

  constraint paper_equity_points_equity_no_negativo check (equity >= 0)
);

/* Único y no un índice a secas: el tick puede correr dos veces sobre el mismo
   instante -- una tarea reintentada, dos pestañas abiertas -- y el resultado
   serían dos puntos idénticos que la gráfica pinta como un escalón que nunca
   ocurrió. Con la clave puesta, la segunda escritura es un
   `on conflict (bot_id, ts) do nothing`. Y sirve además como el índice por
   (bot_id, ts) que necesita la consulta de la curva. */
create unique index if not exists paper_equity_points_bot_ts_idx
  on public.paper_equity_points (bot_id, ts);

alter table public.paper_equity_points enable row level security;

drop policy if exists "paper_equity_points_own" on public.paper_equity_points;
create policy "paper_equity_points_own"
  on public.paper_equity_points
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.paper_equity_points is
  'La curva de capital simulada, un punto por tick. Tabla propia porque una curva hecha sólo con cierres se salta el drawdown de dentro de la operación.';

-- Dos columnas más en la ficha del bot.
--
-- `descripcion_larga` es qué hace la estrategia, contado entero. `hypothesis`
-- ya guarda la frase de una línea de por qué el mercado le paga, y no son lo
-- mismo: una es el argumento y la otra el manual de instrucciones. Con un solo
-- campo habría que elegir cuál de las dos se enseña en la lista, y la lista
-- necesita la corta.
--
-- `familia_operativa` es el ritmo, no el estilo. `style` dice de qué familia
-- de estrategias es -- tendencia, reversión, rejilla -- pero no a qué
-- velocidad opera, y un bot de tendencia en velas de un minuto y otro en velas
-- semanales ni se vigilan igual ni se ejecutan igual: al primero le sobran
-- operaciones para juzgar una semana mala y al segundo no le llegan en un año.
-- `timeframe` tampoco lo resuelve, porque es texto libre y no se puede agrupar
-- por él.
--
-- Nula mientras no se decida: los bots que ya existen no tienen por qué
-- inventarse una familia para poder guardarse.
alter table public.bots
  add column if not exists descripcion_larga text;

alter table public.bots
  add column if not exists familia_operativa text;

alter table public.bots
  drop constraint if exists bots_familia_operativa_known;

alter table public.bots
  add constraint bots_familia_operativa_known check (
    familia_operativa is null or familia_operativa in (
      'HFT', 'SCALPING', 'INTRADIA', 'SWING', 'POSICION'
    )
  );

create index if not exists bots_familia_idx
  on public.bots (user_id, familia_operativa)
  where familia_operativa is not null;

comment on column public.bots.descripcion_larga is
  'Qué hace la estrategia, contado entero, para la ficha. Distinta de hypothesis, que es la frase de por qué el mercado le paga.';
comment on column public.bots.familia_operativa is
  'El ritmo al que opera: HFT, SCALPING, INTRADIA, SWING o POSICION. El ritmo, no el estilo, que ése ya lo dice style.';
