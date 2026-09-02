-- El módulo de bots: la cantera, el equipo y lo que los vigila.
--
-- Un bot no es una estrategia de backtest ni una etiqueta de estrategia. Las
-- tres cosas se llaman parecido y son distintas:
--
--   * `strategies`           -- una etiqueta que le pones a una operación ya
--                               hecha («esto fue una ruptura de rango»).
--   * `backtest_strategies`  -- reglas ejecutables sobre velas.
--   * `bots`                 -- un sistema que opera solo, con su mercado, su
--                               temporalidad, su fase en la cantera y su
--                               historial de operaciones reales o en papel.
--
-- Un bot puede nacer de una estrategia de backtest (`backtest_strategy_id`)
-- y etiquetar sus operaciones con una estrategia (`strategy_id`), pero lo que
-- se vigila es el bot: si su rendimiento en vivo se parece al que prometió su
-- línea base, en qué fase está y cuánto capital tiene asignado.
--
-- Las operaciones de un bot son filas de `trades` con `bot_id`. Se reutiliza
-- la tabla y no se crea otra porque el P&L de un bot tiene que ser el mismo
-- tipo de cifra que el tuyo: sale del mismo motor y se puede restar.

create table if not exists public.bots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  /* Lo que opera y a qué ritmo. Texto libre porque un bot puede operar un
     producto que la plataforma no sincroniza (un EA en MetaTrader). */
  market text not null,
  timeframe text not null,
  /* De qué familia es y en qué bloque del portfolio cuenta. El bloque se
     puede corregir a mano: un scalper puede ser cóncavo o híbrido según cómo
     esté construido, y eso lo sabe quien lo construyó. */
  style text not null,
  block text not null,
  /* Dónde está en la cantera. F1 a F7, o retirado (el cementerio). */
  phase text not null default 'F1',
  /* Qué parte del capital tiene asignada y cuánto arriesga cada operación. */
  sizing_pct numeric not null default 0,
  risk_per_trade_pct numeric not null default 0.5,
  /* La «matrícula» del bot en la plataforma donde corre (magic number). */
  magic_number text,
  /* La frase de una línea que explica por qué el mercado le paga. Es la
     primera puerta del método: sin ella no hay hipótesis, hay superstición. */
  hypothesis text,
  /* Lo que prometió: las cifras del backtest o de su histórico contra las que
     se compara lo que hace en vivo. Ver lib/bots/types.ts. */
  baseline jsonb not null default '{}'::jsonb,
  /* El contrato de drawdown: el percentil 95 del Monte Carlo, firmado. Si un
     día lo supera no tiene mala suerte, está incumpliendo contrato. */
  drawdown_contract_pct numeric,
  contract_signed_at timestamptz,
  backtest_strategy_id uuid references public.backtest_strategies(id) on delete set null,
  strategy_id uuid references public.strategies(id) on delete set null,
  notes text,
  /* El cementerio: cuándo se retiró y la autopsia. Un bot retirado no vuelve
     sin pasar otra vez por la cantera. */
  retired_at timestamptz,
  retirement_reason text,
  retirement_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint bots_name_not_blank check (length(trim(name)) > 0),
  constraint bots_unique_name unique (user_id, name),
  constraint bots_style_known check (
    style in ('TENDENCIA', 'MOMENTUM', 'REVERSION', 'GRID', 'SCALPING', 'RUPTURA', 'ORDERFLOW', 'IA')
  ),
  constraint bots_block_known check (block in ('CONVEXO', 'CONCAVO', 'HIBRIDO')),
  constraint bots_phase_known check (
    phase in ('F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'RETIRADO')
  ),
  constraint bots_sizing_range check (sizing_pct >= 0 and sizing_pct <= 100),
  constraint bots_risk_range check (risk_per_trade_pct >= 0 and risk_per_trade_pct <= 10),
  constraint bots_contract_range check (
    drawdown_contract_pct is null or (drawdown_contract_pct >= 0 and drawdown_contract_pct <= 100)
  ),
  constraint bots_baseline_is_object check (jsonb_typeof(baseline) = 'object'),
  constraint bots_retirement_reason_known check (
    retirement_reason is null or retirement_reason in (
      'ALPHA_DECAY', 'OVERFITTING', 'BROKER', 'CAMBIO_REGIMEN', 'SUPERADO', 'NO_SUPERIOR', 'OTRO'
    )
  ),
  /* Retirado y con fecha de retiro van juntos, o ninguno: un bot «retirado»
     sin fecha no se puede ordenar en el cementerio, y uno con fecha que sigue
     en F7 estaría operando desde la tumba. */
  constraint bots_retired_consistent check ((phase = 'RETIRADO') = (retired_at is not null))
);

create index if not exists bots_user_phase_idx on public.bots (user_id, phase, created_at desc);

alter table public.bots enable row level security;

drop policy if exists "bots_own" on public.bots;
create policy "bots_own"
  on public.bots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.bots is
  'Sistemas que operan solos, con su fase en la cantera y su línea base. Sus operaciones son filas de trades con bot_id.';
comment on column public.bots.baseline is
  'Cifras del backtest o del histórico contra las que se compara lo que hace en vivo. Ver lib/bots/types.ts.';
comment on column public.bots.drawdown_contract_pct is
  'Percentil 95 del drawdown en el Monte Carlo, firmado. Superarlo es incumplir contrato, no mala suerte.';

-- Cada ascenso y cada descenso, con las cifras que lo justificaron.
--
-- Es el «historial del pipeline» de la ficha: sin él, un bot en F6 no dice
-- cuándo llegó ni con qué números, y la decisión de ascenderlo no se puede
-- revisar después.
create table if not exists public.bot_phase_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bot_id uuid not null references public.bots(id) on delete cascade,
  from_phase text,
  to_phase text not null,
  reason text,
  /* Las métricas en el momento del cambio, para poder revisar la decisión. */
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),

  constraint bot_phase_history_metrics_is_object check (jsonb_typeof(metrics) = 'object')
);

create index if not exists bot_phase_history_bot_idx
  on public.bot_phase_history (bot_id, created_at desc);

alter table public.bot_phase_history enable row level security;

drop policy if exists "bot_phase_history_own" on public.bot_phase_history;
create policy "bot_phase_history_own"
  on public.bot_phase_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- El diario de impulsos.
--
-- El componente más peligroso del sistema no es un bot: es quien lo vigila.
-- Cada vez que quieres apagar lo que va mal o subir el riesgo cuando el mes va
-- bien, se apunta aquí. A los siete días se mira qué hizo el bot mientras
-- tanto, y sale cuánto habría costado hacerte caso.
create table if not exists public.bot_impulses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  /* Sin bot cuando el impulso es sobre la cuenta entera («subir el tamaño»). */
  bot_id uuid references public.bots(id) on delete set null,
  action text not null,
  note text,
  /* Si al final lo hiciste. Los que no se ejecutan son los que se evalúan:
     son las multas que no llegaste a pagar. */
  executed boolean not null default false,
  created_at timestamptz not null default now(),

  constraint bot_impulses_action_known check (
    action in ('APAGAR', 'CERRAR', 'REDUCIR', 'SUBIR', 'OTRO')
  )
);

create index if not exists bot_impulses_user_idx on public.bot_impulses (user_id, created_at desc);

alter table public.bot_impulses enable row level security;

drop policy if exists "bot_impulses_own" on public.bot_impulses;
create policy "bot_impulses_own"
  on public.bot_impulses
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Los umbrales del portfolio, uno por usuario.
--
-- Están en su tabla y no en `app_settings` porque son del módulo de bots y
-- sólo de él: `app_settings` ya tiene treinta columnas de todo, y las
-- puertas del pipeline no tienen nada que ver con el intervalo de
-- sincronización. Los valores de fábrica son los del método: 40/40/20, la
-- escalera 8/12/15/20 y las puertas PF 1,5 / 0,15R / Sharpe 1 / DD 20% / 30
-- operaciones.
create table if not exists public.bot_portfolio_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_convexo numeric not null default 40,
  target_concavo numeric not null default 40,
  target_hibrido numeric not null default 20,
  ks_alert_pct numeric not null default 8,
  ks_reduce_pct numeric not null default 12,
  ks_close_pct numeric not null default 15,
  ks_off_pct numeric not null default 20,
  gate_profit_factor numeric not null default 1.5,
  gate_expectancy_r numeric not null default 0.15,
  gate_sharpe numeric not null default 1,
  gate_max_drawdown_pct numeric not null default 20,
  gate_min_trades integer not null default 30,
  updated_at timestamptz not null default now(),

  constraint bot_portfolio_targets_sum check (target_convexo + target_concavo + target_hibrido = 100),
  constraint bot_portfolio_targets_range check (
    target_convexo >= 0 and target_concavo >= 0 and target_hibrido >= 0
  ),
  /* La escalera tiene que subir: un nivel de emergencia por debajo del de
     alerta no es una escalera, es una trampa. */
  constraint bot_portfolio_ladder_ordered check (
    ks_alert_pct > 0 and ks_alert_pct < ks_reduce_pct
    and ks_reduce_pct < ks_close_pct and ks_close_pct < ks_off_pct and ks_off_pct <= 100
  ),
  constraint bot_portfolio_gates_range check (
    gate_profit_factor > 0 and gate_expectancy_r >= 0 and gate_sharpe >= 0
    and gate_max_drawdown_pct > 0 and gate_max_drawdown_pct <= 100 and gate_min_trades > 0
  )
);

alter table public.bot_portfolio_settings enable row level security;

drop policy if exists "bot_portfolio_settings_own" on public.bot_portfolio_settings;
create policy "bot_portfolio_settings_own"
  on public.bot_portfolio_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Las operaciones de un bot.
--
-- Una columna en `trades` y no una tabla de enlace: el recálculo de la
-- reconstrucción hace `on conflict ... do update` sobre columnas concretas y
-- no toca ésta, así que la asignación sobrevive a un recálculo. Con una tabla
-- aparte habría que decidir qué pasa con el enlace cuando una operación queda
-- huérfana, y aquí la respuesta la da la propia fila.
alter table public.trades
  add column if not exists bot_id uuid references public.bots(id) on delete set null;

create index if not exists trades_bot_idx on public.trades (bot_id) where bot_id is not null;

comment on column public.trades.bot_id is
  'El bot que abrió esta operación, si la abrió un bot. Sobrevive al recálculo.';
