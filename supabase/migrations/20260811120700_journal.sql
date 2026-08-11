-- Journal layer: strategies/tags/screenshots/comments plus journal_entries,
-- the single table holding every *subjective* field. journal_entries is
-- kept strictly separate from trades (objective, Coinbase-derived) so the
-- UI and RLS story stay clear about which data can and cannot be silently
-- edited: trades rows change only via sync/reconstruction (service role,
-- read-only to the client), journal_entries rows change only via the
-- user's own journal edits (full CRUD for the owning user, below).
--
-- Note: session classification lives on trades.session_computed /
-- session_override / session_effective, not here -- it is objective/
-- derived (a deterministic function of opened_at + IANA timezone rules),
-- not a subjective journal field, even though the user types a correction
-- into the same UI panel as the fields below. See docs/DATABASE.md.

create table public.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null default '{}'::jsonb,
  timeframe_entry text,
  timeframe_reference text,
  timeframe_structure text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.strategies enable row level security;

create policy "strategies_all_own" on public.strategies
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger set_strategies_updated_at
  before update on public.strategies
  for each row execute function public.set_updated_at();

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.tags enable row level security;

create policy "tags_all_own" on public.tags
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table public.trade_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trade_id, tag_id)
);

alter table public.trade_tags enable row level security;

create policy "trade_tags_all_own" on public.trade_tags
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index trade_tags_tag_idx on public.trade_tags (tag_id);

-- One row per trade, created lazily on first journal edit (not by sync).
create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null unique references public.trades (id) on delete cascade,
  strategy_id uuid references public.strategies (id),
  htf_bias text,
  sr_proximity text,
  planned_direction text check (planned_direction in ('LONG', 'SHORT', 'NONE')),
  risk_amount numeric,
  stop_loss_price numeric,
  take_profit_price numeric,
  result_r numeric,
  plan_adherence smallint check (plan_adherence between 1 and 5),
  entry_quality smallint check (entry_quality between 1 and 5),
  emotional_state text,
  mistake_tag text,
  lesson_learned text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_entries enable row level security;

create policy "journal_entries_all_own" on public.journal_entries
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger set_journal_entries_updated_at
  before update on public.journal_entries
  for each row execute function public.set_updated_at();

create table public.trade_screenshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  storage_path text not null, -- Supabase Storage object path
  caption text,
  phase text check (phase in ('BEFORE', 'AFTER', 'OTHER')),
  uploaded_at timestamptz not null default now()
);

alter table public.trade_screenshots enable row level security;

create policy "trade_screenshots_all_own" on public.trade_screenshots
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index trade_screenshots_trade_idx on public.trade_screenshots (trade_id);

create table public.trade_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table public.trade_comments enable row level security;

create policy "trade_comments_all_own" on public.trade_comments
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index trade_comments_trade_idx on public.trade_comments (trade_id, created_at);
