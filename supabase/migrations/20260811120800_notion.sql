-- Notion mirror: optional, one-way (app -> Notion), fully decoupled from
-- the Coinbase sync pipeline. A Notion outage or bug must never block or
-- affect raw_fills/trades processing -- these tables are only ever written
-- by the separate Notion sync worker (service role). notion_field_mappings
-- is the one table here the user directly edits (their own field-mapping
-- configuration), so it keeps full CRUD.

create table public.notion_sync_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null unique references public.trades (id) on delete cascade,
  notion_page_id text not null,
  notion_database_id text not null,
  last_synced_at timestamptz,
  last_synced_hash text, -- hash of the last payload sent, to skip no-op updates
  status text not null default 'PENDING' check (status in ('SYNCED', 'PENDING', 'ERROR')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notion_sync_links enable row level security;

create policy "notion_sync_links_select_own" on public.notion_sync_links
  for select using ((select auth.uid()) = user_id);

create trigger set_notion_sync_links_updated_at
  before update on public.notion_sync_links
  for each row execute function public.set_updated_at();

create unique index notion_sync_links_page_idx on public.notion_sync_links (notion_page_id);

create table public.notion_sync_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED_PERMANENT')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notion_sync_queue enable row level security;

create policy "notion_sync_queue_select_own" on public.notion_sync_queue
  for select using ((select auth.uid()) = user_id);

create trigger set_notion_sync_queue_updated_at
  before update on public.notion_sync_queue
  for each row execute function public.set_updated_at();

create index notion_sync_queue_status_idx on public.notion_sync_queue (status, next_attempt_at);

comment on table public.notion_sync_queue is
  'Exponential-backoff work queue, processed only by the service-role Notion worker. attempt_count drives backoff delay; status=FAILED_PERMANENT stops retries and should raise a notification instead.';

create table public.notion_field_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  internal_field text not null, -- e.g. 'product_id', 'direction', 'net_pnl'
  notion_property_name text not null,
  notion_property_type text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, internal_field)
);

alter table public.notion_field_mappings enable row level security;

create policy "notion_field_mappings_all_own" on public.notion_field_mappings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger set_notion_field_mappings_updated_at
  before update on public.notion_field_mappings
  for each row execute function public.set_updated_at();

create table public.notion_sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid references public.trades (id) on delete set null,
  action text not null check (action in ('CREATE', 'UPDATE')),
  status text not null check (status in ('SUCCESS', 'ERROR', 'RATE_LIMITED')),
  http_status integer,
  rate_limited boolean not null default false,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.notion_sync_history enable row level security;

create policy "notion_sync_history_select_own" on public.notion_sync_history
  for select using ((select auth.uid()) = user_id);

create index notion_sync_history_trade_idx on public.notion_sync_history (trade_id, created_at desc);
