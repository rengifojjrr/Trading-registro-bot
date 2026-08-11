-- Sync bookkeeping: cursor/watermark state per account+type, a log of every
-- sync run, and a log of every nightly reconciliation pass (with individual
-- discrepancies broken out into their own table for auditability). Created
-- before the raw layer because raw_fills/raw_orders reference sync_runs(id).
--
-- All tables in this file are written exclusively by server-side code using
-- the service-role client (lib/supabase/admin.ts) -- the signed-in user's
-- own session can only ever SELECT its own rows. This is what makes "sync
-- status can't be silently faked from the client" a database-enforced
-- property, not just an app-code convention.

create table public.sync_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  sync_type text not null check (sync_type in ('POLL', 'RECONCILE')),
  -- Coinbase's own pagination cursor, meaningful only within one in-progress
  -- paginated run.
  cursor text,
  -- The durable cross-run anchor: the max sequence_timestamp seen so far.
  -- Each new run computes its fetch start as high_water_mark minus
  -- overlap_window_seconds, so cursor (ephemeral) and high_water_mark
  -- (durable) serve different purposes and are both needed.
  high_water_mark timestamptz,
  overlap_window_seconds integer not null default 300,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  consecutive_failures integer not null default 0,
  status text not null default 'IDLE' check (status in ('IDLE', 'RUNNING', 'SUCCESS', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, sync_type)
);

alter table public.sync_state enable row level security;

create policy "sync_state_select_own" on public.sync_state
  for select using ((select auth.uid()) = user_id);

create trigger set_sync_state_updated_at
  before update on public.sync_state
  for each row execute function public.set_updated_at();

comment on column public.sync_state.overlap_window_seconds is
  'How far back each poll re-checks even already-synced time, to catch late-arriving or amended fills (Coinbase can post REVERSAL/CORRECTION fills after the fact).';

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  sync_state_id uuid not null references public.sync_state (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED')),
  fills_fetched integer not null default 0,
  fills_new integer not null default 0,
  orders_fetched integer not null default 0,
  trades_created integer not null default 0,
  trades_updated integer not null default 0,
  discrepancies_found integer not null default 0,
  error_summary text, -- sanitized, human-readable; must never contain secrets/tokens
  raw_error jsonb,
  created_at timestamptz not null default now()
);

alter table public.sync_runs enable row level security;

create policy "sync_runs_select_own" on public.sync_runs
  for select using ((select auth.uid()) = user_id);

create index sync_runs_state_idx on public.sync_runs (sync_state_id, started_at desc);

create table public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  run_date date not null default (now() at time zone 'utc')::date,
  window_start timestamptz not null,
  window_end timestamptz not null,
  coinbase_fill_count integer,
  db_fill_count integer,
  resolved boolean not null default false,
  resolved_at timestamptz,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'RUNNING' check (status in ('RUNNING', 'SUCCESS', 'FAILED')),
  created_at timestamptz not null default now()
);

alter table public.reconciliation_runs enable row level security;

create policy "reconciliation_runs_select_own" on public.reconciliation_runs
  for select using ((select auth.uid()) = user_id);

create index reconciliation_runs_account_idx on public.reconciliation_runs (account_id, run_date desc);

-- One row per individual discrepancy found by a reconciliation run, instead
-- of a single jsonb blob on the run itself -- this is what makes "resolved"
-- unambiguous (per-discrepancy, not per-run) and lets a discrepancy link to
-- a specific notifications row.
create table public.reconciliation_discrepancies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reconciliation_run_id uuid not null references public.reconciliation_runs (id) on delete cascade,
  discrepancy_type text not null check (discrepancy_type in (
    'MISSING_IN_DB',
    'MISSING_IN_COINBASE',
    'FIELD_MISMATCH',
    'UNCLASSIFIED_FILL',
    'TRADE_BOUNDARY_CHANGED'
  )),
  entity_type text not null,
  entity_id text not null,
  expected jsonb,
  actual jsonb,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);

alter table public.reconciliation_discrepancies enable row level security;

create policy "reconciliation_discrepancies_select_own" on public.reconciliation_discrepancies
  for select using ((select auth.uid()) = user_id);

create index reconciliation_discrepancies_run_idx on public.reconciliation_discrepancies (reconciliation_run_id);
create index reconciliation_discrepancies_unresolved_idx on public.reconciliation_discrepancies (user_id) where resolved_at is null;
