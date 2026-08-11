-- Support for importing historical trades out of an existing Notion trading
-- journal (a one-time/on-demand backfill -- distinct from the ongoing,
-- one-way app -> Notion mirror in 20260811120800_notion.sql, which is
-- unaffected by this migration). Real Notion trading journals commonly
-- track more than one instrument and more than one account (prop-firm
-- evaluations, other brokers) -- the constraints below widen just enough to
-- hold that data honestly, without pretending it's Coinbase data.

alter table public.trades
  drop constraint trades_source_check;
alter table public.trades
  add constraint trades_source_check
  check (source in ('COINBASE_SYNC', 'CSV_IMPORT', 'MANUAL', 'DEMO_SEED', 'NOTION_IMPORT'));

alter table public.accounts
  drop constraint accounts_venue_check;
alter table public.accounts
  add constraint accounts_venue_check
  check (venue in ('FCM', 'INTX', 'EXTERNAL'));

alter table public.products
  drop constraint products_venue_check;
alter table public.products
  add constraint products_venue_check
  check (venue in ('CBE', 'FCM', 'INTX', 'UNKNOWN_VENUE_TYPE', 'EXTERNAL'));

comment on constraint accounts_venue_check on public.accounts is
  'EXTERNAL covers accounts/instruments that did not come from the Coinbase API -- e.g. a prop-firm futures account or another exchange, imported from a manual journal (Notion, CSV). Live Coinbase sync (lib/coinbase) only ever writes FCM/INTX rows.';

-- Idempotency + audit trail for the Notion -> platform import. Re-running
-- the import must never duplicate a trade: each Notion page maps to at
-- most one trade via this table, keyed by notion_page_id.
create table public.notion_import_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null unique references public.trades (id) on delete cascade,
  notion_page_id text not null unique,
  notion_database_id text not null,
  raw_properties jsonb not null, -- full original Notion property values, for audit/debugging
  imported_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now()
);

alter table public.notion_import_links enable row level security;

create policy "notion_import_links_select_own" on public.notion_import_links
  for select using ((select auth.uid()) = user_id);

create index notion_import_links_trade_idx on public.notion_import_links (trade_id);

comment on table public.notion_import_links is
  'One row per imported Notion journal page. Written by the service-role import script (scripts/import-notion-journal.ts), not by the app -- this is a backfill tool, not a live sync path.';
