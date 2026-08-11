-- Reporting rollups. stats_daily is recomputed deterministically from trades
-- after every sync/reconciliation (not a fragile, independently-maintained
-- cache) -- see docs/DATABASE.md for the recompute contract, including why
-- it must never be the only code path that can produce these numbers (any
-- filtered dashboard view computes live from lib/analytics instead).
--
-- All three tables are populated exclusively by server-side jobs using the
-- service-role client; the signed-in user only ever reads their own rows.

create table public.daily_balances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  balance_date date not null, -- in the user's configured timezone at computation time
  equity numeric,
  realized_pnl numeric not null default 0,
  unrealized_pnl numeric,
  net_deposits numeric,
  source text not null default 'COMPUTED' check (source in ('COMPUTED', 'COINBASE_API', 'MANUAL')),
  computed_at timestamptz not null default now(),
  unique (account_id, balance_date)
);

alter table public.daily_balances enable row level security;

create policy "daily_balances_select_own" on public.daily_balances
  for select using ((select auth.uid()) = user_id);

create index daily_balances_account_date_idx on public.daily_balances (account_id, balance_date desc);

comment on column public.daily_balances.source is
  'COMPUTED = starting balance + cumulative net P&L, derived internally. COINBASE_API = read from a Coinbase balance endpoint once Phase 2+ wires one up. MANUAL = a correction inserted by a server action on the user''s behalf (e.g. an untracked deposit), never written directly by the client. Divergence between COMPUTED and COINBASE_API for the same date is itself a useful reconciliation signal.';

create table public.stats_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  period_type text not null check (period_type in ('DAY', 'WEEK', 'MONTH')),
  period_start date not null,
  trades_count integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  breakeven integer not null default 0,
  gross_pnl numeric not null default 0,
  net_pnl numeric not null default 0,
  commissions numeric not null default 0,
  win_rate numeric,
  profit_factor numeric,
  expectancy numeric,
  max_drawdown numeric,
  best_trade_id uuid references public.trades (id),
  worst_trade_id uuid references public.trades (id),
  computed_at timestamptz not null default now(),
  unique (account_id, period_type, period_start)
);

alter table public.stats_daily enable row level security;

create policy "stats_daily_select_own" on public.stats_daily
  for select using ((select auth.uid()) = user_id);

create index stats_daily_account_period_idx on public.stats_daily (account_id, period_type, period_start desc);

comment on table public.stats_daily is
  'A nightly-refreshed cache of the unfiltered dashboard view only. The moment any filter is active (date range, product, session, setup...), the dashboard must call the same lib/analytics functions live over the filtered trade set rather than reading this table -- two divergent code paths (cached vs filtered) is how "filters coherently affect all metrics" quietly breaks.';

create table public.monthly_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  period_month date not null, -- first day of the month
  generated_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  pdf_storage_path text,
  csv_storage_path text,
  created_at timestamptz not null default now(),
  unique (account_id, period_month)
);

alter table public.monthly_reports enable row level security;

create policy "monthly_reports_select_own" on public.monthly_reports
  for select using ((select auth.uid()) = user_id);
