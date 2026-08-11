-- Two independent, optional-by-construction tables:
--
-- position_snapshots lands Coinbase's own reported open-position view
-- (CFM's `GET /cfm/positions`) so nightly reconciliation can diff "what
-- Coinbase says my current open position is" against "what our reconstructed
-- OPEN trades say" -- this catches reconstruction *logic* bugs even when
-- every raw fill was ingested correctly, which fill-count diffing alone
-- cannot do.
--
-- trade_price_extremes stores MFE/MAE. It is deliberately a separate,
-- nullable-by-row table rather than columns on trades: not every trade will
-- have a value (depends on candle history being available for that time
-- window and product), and is_approximate/granularity_used make the
-- "candle-approximate, not tick-exact" caveat structural rather than a
-- comment someone has to remember to add in the UI.

create table public.position_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  product_id text not null references public.products (product_id),
  side text check (side in ('LONG', 'SHORT', 'UNKNOWN')),
  number_of_contracts numeric,
  avg_entry_price numeric,
  unrealized_pnl numeric,
  raw_payload jsonb not null,
  snapshotted_at timestamptz not null default now()
);

alter table public.position_snapshots enable row level security;

create policy "position_snapshots_select_own" on public.position_snapshots
  for select using ((select auth.uid()) = user_id);

create index position_snapshots_account_product_idx on public.position_snapshots (account_id, product_id, snapshotted_at desc);

comment on table public.position_snapshots is
  'Point-in-time copy of Coinbase''s own reported open position (CFM /cfm/positions today). Written by the service role during sync/reconciliation. Used to catch reconstruction-logic errors that fill-count diffing alone would miss.';

create table public.trade_price_extremes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null unique references public.trades (id) on delete cascade,
  mfe_price numeric,
  mae_price numeric,
  mfe_pct numeric,
  mae_pct numeric,
  granularity_used text, -- e.g. 'candle_1m', 'candle_5m' -- null means unavailable, not zero
  candle_source text,
  is_approximate boolean not null default true,
  unavailable_reason text, -- populated instead of a value when candles could not be obtained
  computed_at timestamptz not null default now()
);

alter table public.trade_price_extremes enable row level security;

create policy "trade_price_extremes_select_own" on public.trade_price_extremes
  for select using ((select auth.uid()) = user_id);

comment on table public.trade_price_extremes is
  'MFE/MAE, computed from candle data (module TBD in a later phase -- see docs/COINBASE_INTEGRATION.md open questions on the candles endpoint). is_approximate is always true today (candle-based, not tick-exact) and must stay reflected in the UI. A row with unavailable_reason set and null prices means "we checked and could not compute this", never a fabricated 0.';
