-- The immutable raw data layer. This is the only layer that talks to
-- Coinbase's shape directly; everything else (trades, stats, journal) is
-- derived from it and can be recomputed from scratch at any time.
--
-- Both tables are written exclusively by server-side sync code using the
-- service-role client (lib/supabase/admin.ts) -- there is deliberately no
-- INSERT/UPDATE/DELETE policy for the `authenticated` role on either table.
-- The signed-in user's own browser session can only ever read its own rows.
-- This means "the raw layer can't be tampered with from the client" is a
-- database-enforced property, not just a rule nobody violates in the UI.
--
-- raw_orders is a mutable *snapshot* of order state (Coinbase orders
-- transition through statuses -- OPEN, FILLED, PARTIALLY_FILLED, CANCELLED
-- -- and the sync job re-fetches/upserts by order_id as that status
-- changes), refreshed only by the service role.
--
-- raw_fills is append-only and immutable even to the service role's normal
-- usage pattern: a fill is a completed historical event; corrections arrive
-- from Coinbase as new rows with trade_type REVERSAL/CORRECTION/SYNTHETIC,
-- never as an edit to an existing row.

create table public.raw_orders (
  order_id text primary key, -- Coinbase order_id
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  product_id text references public.products (product_id),
  order_type text,
  order_side text check (order_side in ('BUY', 'SELL')),
  status text,
  raw_payload jsonb not null,
  sync_run_id uuid references public.sync_runs (id),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.raw_orders enable row level security;

create policy "raw_orders_select_own" on public.raw_orders
  for select using ((select auth.uid()) = user_id);

create trigger set_raw_orders_updated_at
  before update on public.raw_orders
  for each row execute function public.set_updated_at();

create index raw_orders_account_idx on public.raw_orders (account_id);
create index raw_orders_user_product_idx on public.raw_orders (user_id, product_id);
create index raw_orders_sync_run_idx on public.raw_orders (sync_run_id);

create table public.raw_fills (
  -- Coinbase's `entry_id`: "unique identifier for the fill". Deliberately
  -- NOT `coinbase_trade_id` as the primary key -- Coinbase documents that
  -- field as unique only for trade_type=FILL, not for REVERSAL/CORRECTION/
  -- SYNTHETIC adjustment rows, so it cannot be relied on as an idempotency
  -- key.
  entry_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  order_id text references public.raw_orders (order_id),
  product_id text not null references public.products (product_id),
  -- Coinbase's own trade identifier. Named coinbase_trade_id (not trade_id)
  -- so it's never confused with trades.id, an entirely different concept
  -- (our reconstructed-trade primary key).
  coinbase_trade_id text,
  trade_time timestamptz not null,
  sequence_timestamp timestamptz not null,
  trade_type text not null default 'FILL' check (trade_type in ('FILL', 'REVERSAL', 'CORRECTION', 'SYNTHETIC')),
  side text not null check (side in ('BUY', 'SELL')),
  price numeric not null,
  size numeric not null,
  commission numeric not null default 0,
  commission_detail jsonb,
  liquidity_indicator text check (liquidity_indicator in ('MAKER', 'TAKER', 'UNKNOWN_LIQUIDITY_INDICATOR')),
  size_in_quote boolean not null default false,
  retail_portfolio_id text,
  -- Non-empty for futures combo fills, which the reconstruction engine does
  -- not have confirmed single-leg-equivalent semantics for yet -- see
  -- docs/COINBASE_INTEGRATION.md open questions. Fills with legs populated
  -- must be routed to the UNCLASSIFIED_FILL notification path rather than
  -- silently processed as a simple single-leg fill.
  future_legs jsonb not null default '[]'::jsonb,
  raw_payload jsonb not null, -- full, untouched fill object as returned by Coinbase
  sync_run_id uuid references public.sync_runs (id),
  ingested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
  -- No updated_at / no update trigger on purpose: this table is append-only.
);

alter table public.raw_fills enable row level security;

create policy "raw_fills_select_own" on public.raw_fills
  for select using ((select auth.uid()) = user_id);
-- No insert, update, or delete policy for `authenticated`: only the
-- service-role sync job may write here, and even it never updates or
-- deletes a row once inserted.

create index raw_fills_account_product_idx on public.raw_fills (account_id, product_id, sequence_timestamp);
create index raw_fills_product_time_idx on public.raw_fills (product_id, trade_time);
create index raw_fills_order_idx on public.raw_fills (order_id);
create index raw_fills_coinbase_trade_id_idx on public.raw_fills (coinbase_trade_id);
create index raw_fills_sync_run_idx on public.raw_fills (sync_run_id);

comment on table public.raw_fills is
  'Immutable, append-only mirror of Coinbase fills. Primary key is entry_id (the fill''s own unique id), not coinbase_trade_id. Never updated or deleted via the app; the trade reconstruction engine treats this as ground truth and is fully re-runnable against it.';
