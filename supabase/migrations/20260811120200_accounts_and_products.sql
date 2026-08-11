-- accounts: a Coinbase portfolio the user has connected (read-only).
-- products: shared, non-user-owned reference data mirroring Coinbase's
-- `GET /products/{product_id}` response. This is the single source of truth
-- the P&L engine reads contract multipliers from -- never hardcode a
-- contract_size in application code.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id text not null, -- Coinbase retail_portfolio_id
  venue text not null check (venue in ('FCM', 'INTX')),
  name text not null,
  currency text not null default 'USD',
  is_demo boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, portfolio_id, venue)
);

alter table public.accounts enable row level security;

create policy "accounts_all_own" on public.accounts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger set_accounts_updated_at
  before update on public.accounts
  for each row execute function public.set_updated_at();

create index accounts_user_id_idx on public.accounts (user_id);

comment on column public.accounts.is_demo is
  'True only for the seeded demo/walkthrough account. Never set by real Coinbase sync. Drives the "demo data" banner in the UI.';

-- Reference data (Coinbase product/contract specs). Not user-owned: any
-- authenticated user may read it, only server-side (service role) code may
-- write it.
create table public.products (
  product_id text primary key, -- e.g. 'BIT-27MAR26-CDE'
  venue text not null check (venue in ('CBE', 'FCM', 'INTX', 'UNKNOWN_VENUE_TYPE')),
  product_type text not null check (product_type in ('SPOT', 'FUTURE', 'EQUITY', 'OPTION_GROUP', 'FUTURE_GROUP')),
  base_currency_id text,
  quote_currency_id text,
  contract_size numeric, -- the real contract multiplier
  contract_root_unit text,
  contract_expiry_type text check (contract_expiry_type in ('EXPIRING', 'PERPETUAL')),
  contract_expiry timestamptz,
  contract_expiry_timezone text,
  risk_managed_by text check (risk_managed_by in ('MANAGED_BY_FCM', 'MANAGED_BY_VENUE')),
  display_name text,
  raw_metadata jsonb not null default '{}'::jsonb, -- full raw product payload from Coinbase
  fetched_at timestamptz not null default now(),
  is_stale boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.products enable row level security;

create policy "products_select_authenticated" on public.products
  for select using ((select auth.role()) = 'authenticated');
-- Deliberately no insert/update/delete policy for regular users: only the
-- server-side service-role client (which bypasses RLS) refreshes this table.

create trigger set_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

comment on table public.products is
  'Coinbase product/contract reference data (shared, not per-user). The P&L engine must read contract_size from here, never hardcode a multiplier.';

-- Now that products exists, attach the deferred FK from app_settings.
alter table public.app_settings
  add constraint app_settings_active_product_fkey
  foreign key (active_product_id) references public.products (product_id);
