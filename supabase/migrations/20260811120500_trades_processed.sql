-- The processed/reconstructed layer. Every row here must be derivable from
-- raw_fills alone (plus the documented reconstruction rules + any active
-- row in trade_grouping_overrides), so it can be recomputed without losing
-- information.
--
-- Reconstruction is a diff-and-upsert against a STABLE identity, not a
-- delete-and-reinsert: trades.opening_fill_id (the raw fill whose
-- allocation opened the trade -- i.e. the position 0-to-nonzero fill, or
-- the leftover portion of a reversal-crossing fill) is what the engine
-- matches on to decide "update this existing trade in place" vs "this is a
-- new trade". Preserving trades.id across recomputation is what keeps
-- journal_entries / trade_tags / trade_screenshots / trade_comments /
-- notion_sync_links (all FK'd to trades.id) intact every time the grouping
-- algorithm is fixed and rerun -- a plain delete-and-reinsert would
-- silently orphan every one of those on every rebuild.

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  product_id text not null references public.products (product_id),
  -- The raw fill that opened this trade (position 0 -> nonzero). NULL only
  -- for trades whose source is CSV_IMPORT/MANUAL/DEMO_SEED, which have no
  -- corresponding Coinbase fill to anchor to. NOT NULL and unique per
  -- (account, product) for source=COINBASE_SYNC -- this is the diff-upsert
  -- key described above.
  opening_fill_id text references public.raw_fills (entry_id),
  direction text not null check (direction in ('LONG', 'SHORT')),
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  opened_at timestamptz not null,
  closed_at timestamptz,
  duration_seconds integer generated always as (
    case when closed_at is not null
      then extract(epoch from (closed_at - opened_at))::integer
      else null
    end
  ) stored,
  max_size numeric not null default 0,
  total_entry_qty numeric not null default 0,
  total_exit_qty numeric not null default 0,
  entry_wap numeric, -- weighted-average entry price
  exit_wap numeric, -- weighted-average exit price
  notional_value numeric,
  -- Snapshot of products.contract_size at the time this trade was computed.
  -- The P&L engine still reads the live products table as the source of
  -- truth when computing, but the value used is copied here so a historical
  -- trade stays self-contained and auditable even if the reference spec is
  -- later corrected (which should itself trigger a flagged recompute, not a
  -- silent change to this trade's already-reported numbers).
  contract_multiplier numeric not null default 1,
  entry_commissions numeric not null default 0,
  exit_commissions numeric not null default 0,
  total_commissions numeric generated always as (entry_commissions + exit_commissions) stored,
  gross_pnl numeric,
  net_pnl numeric,
  return_pct numeric,
  entries_count integer not null default 0,
  exits_count integer not null default 0,
  reconstruction_version integer not null default 1,
  -- Derived display flag: true when an active trade_grouping_overrides row
  -- shaped this trade. The override row itself (below) is the actual
  -- mechanism, not this flag -- reconstruction reads active overrides and
  -- applies them deterministically as part of the same pure computation, so
  -- a full rebuild is still 100% reproducible from raw_fills + overrides.
  is_manually_adjusted boolean not null default false,
  -- Session at trade entry, DST-aware (lib/sessions/classify.ts), anchored
  -- to opened_at only -- a swing trade held across sessions still gets one
  -- label, by design (see docs/DATABASE.md). session_computed is objective/
  -- derived, exactly like the rest of this table; session_override exists
  -- only for the rare manual correction, mirroring how the rest of the
  -- objective/subjective split works elsewhere in the schema.
  session_computed text check (session_computed in (
    'SYDNEY', 'SYDNEY_TOKYO_OVERLAP', 'TOKYO', 'TOKYO_LONDON_OVERLAP',
    'LONDON', 'LONDON_NEW_YORK_OVERLAP', 'NEW_YORK', 'OFF_SESSION'
  )),
  session_override text check (session_override in (
    'SYDNEY', 'SYDNEY_TOKYO_OVERLAP', 'TOKYO', 'TOKYO_LONDON_OVERLAP',
    'LONDON', 'LONDON_NEW_YORK_OVERLAP', 'NEW_YORK', 'OFF_SESSION'
  )),
  session_effective text generated always as (coalesce(session_override, session_computed)) stored,
  source text not null default 'COINBASE_SYNC' check (source in ('COINBASE_SYNC', 'CSV_IMPORT', 'MANUAL', 'DEMO_SEED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closed_at is null or closed_at >= opened_at),
  unique (account_id, product_id, opening_fill_id)
);

alter table public.trades enable row level security;

-- Read-only for the signed-in user: trades are materialized exclusively by
-- the reconstruction engine running under the service-role client (either
-- during sync or when re-run after a trade_grouping_overrides change), so
-- there is deliberately no INSERT/UPDATE/DELETE policy for `authenticated`.
create policy "trades_select_own" on public.trades
  for select using ((select auth.uid()) = user_id);

create trigger set_trades_updated_at
  before update on public.trades
  for each row execute function public.set_updated_at();

create index trades_user_opened_idx on public.trades (user_id, opened_at desc);
create index trades_user_closed_idx on public.trades (user_id, closed_at desc);
create index trades_user_product_idx on public.trades (user_id, product_id);
create index trades_user_status_idx on public.trades (user_id, status);
create index trades_session_idx on public.trades (user_id, session_effective);

comment on column public.trades.reconstruction_version is
  'Version of the reconstruction algorithm (lib/reconstruction/engine.ts) that produced this row. Bumped whenever the grouping logic changes, so historical trades can be identified and recomputed.';
comment on column public.trades.source is
  'DEMO_SEED rows come from the Phase 1 demo seed only -- never written by real sync, CSV import, or manual entry. Used to drive the "demo data" banner.';

-- The actual mechanism for "manually correct a grouping, later revert to
-- automatic" (as opposed to trades.is_manually_adjusted, which is just a
-- derived display flag). Reconstruction reads all is_active rows scoped to
-- an (account, product) and applies them deterministically alongside the
-- automatic position-lifecycle rule, so the engine stays a pure function of
-- (raw_fills, active overrides) and a full rebuild is still reproducible.
-- Deactivating an override (is_active = false) and rerunning reconstruction
-- is what "revert to automatic" means in practice.
create table public.trade_grouping_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  product_id text not null references public.products (product_id),
  override_type text not null check (override_type in ('MERGE', 'SPLIT', 'REASSIGN', 'EXCLUDE_FILL')),
  anchor_fill_id text not null references public.raw_fills (entry_id),
  payload jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trade_grouping_overrides enable row level security;

create policy "trade_grouping_overrides_all_own" on public.trade_grouping_overrides
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger set_trade_grouping_overrides_updated_at
  before update on public.trade_grouping_overrides
  for each row execute function public.set_updated_at();

create index trade_grouping_overrides_scope_idx on public.trade_grouping_overrides (account_id, product_id, is_active);

-- Junction between a trade and the raw fills that compose it. allocated_size
-- can be less than the fill's own size: when a fill crosses through zero
-- position (a long/short reversal), it is split across two trades (one
-- ENTRY row, one EXIT row, on two different trades), each carrying its own
-- pro-rated allocated_size/allocated_commission (documented, tested
-- pro-rata rule -- see docs/RECONCILIATION_RULES.md; Coinbase gives one
-- commission for the whole fill and no other principled split exists).
create table public.trade_fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  raw_fill_id text not null references public.raw_fills (entry_id),
  role text not null check (role in ('ENTRY', 'EXIT')),
  allocated_size numeric not null check (allocated_size > 0),
  allocated_commission numeric not null default 0,
  sequence_no integer not null,
  created_at timestamptz not null default now(),
  -- The reversal-split invariant, enforced by the database rather than only
  -- by application logic: a given raw fill can be an ENTRY-allocation at
  -- most once and an EXIT-allocation at most once, full stop. A simple
  -- (non-reversal) fill produces exactly one of these rows; a reversal-
  -- crossing fill produces exactly two, one of each role, on two different
  -- trades.
  unique (raw_fill_id, role)
);

alter table public.trade_fills enable row level security;

create policy "trade_fills_select_own" on public.trade_fills
  for select using ((select auth.uid()) = user_id);

create index trade_fills_trade_idx on public.trade_fills (trade_id);
create index trade_fills_raw_fill_idx on public.trade_fills (raw_fill_id);

comment on table public.trade_fills is
  'Materialized exclusively by the reconstruction engine (service role). unique(raw_fill_id, role) is the reversal-split invariant: sum(allocated_size) across a raw fill''s row(s) must equal raw_fills.size exactly -- asserted in lib/reconstruction tests, not expressible as a cheap cross-row CHECK constraint.';

-- Audit trail of every (re)computation of trades for an account/product.
create table public.trade_reconstruction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  product_id text not null references public.products (product_id),
  algorithm_version integer not null,
  fills_processed integer not null default 0,
  trades_created integer not null default 0,
  trades_updated integer not null default 0,
  trades_closed integer not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCESS', 'FAILED')),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.trade_reconstruction_runs enable row level security;

create policy "trade_reconstruction_runs_select_own" on public.trade_reconstruction_runs
  for select using ((select auth.uid()) = user_id);

create index trade_reconstruction_runs_account_idx on public.trade_reconstruction_runs (account_id, started_at desc);
