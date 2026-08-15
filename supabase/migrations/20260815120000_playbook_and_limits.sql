-- Turning the journal from a record of what happened into something that
-- affects how you trade.
--
-- Three additions, all of which exist for the same reason: a trading
-- journal that is only filled in afterwards documents mistakes but does
-- nothing to prevent them.

-- 1. Playbook: the checklist you tick BEFORE entering, per strategy.
--    Stored as ordered items so a strategy's rules are explicit and
--    comparable across trades rather than living in prose in the notes.
create table public.playbook_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  strategy_id uuid not null references public.strategies (id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.playbook_items enable row level security;

create policy "playbook_items_all_own" on public.playbook_items
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index playbook_items_strategy_idx on public.playbook_items (strategy_id, sort_order);

-- Which items were actually ticked for a given trade. A row per ticked
-- item rather than a count, so "which rule did I skip on my losing trades"
-- is answerable.
create table public.trade_playbook_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  playbook_item_id uuid not null references public.playbook_items (id) on delete cascade,
  checked boolean not null default false,
  created_at timestamptz not null default now(),
  unique (trade_id, playbook_item_id)
);

alter table public.trade_playbook_checks enable row level security;

create policy "trade_playbook_checks_all_own" on public.trade_playbook_checks
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index trade_playbook_checks_trade_idx on public.trade_playbook_checks (trade_id);

-- 2. Mistake taxonomy. Deliberately a closed list rather than free text:
--    "entré tarde" written three different ways is three different things
--    to a database and one thing to a person, and only the countable
--    version can tell you which mistake is costing you the most.
create table public.trade_mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  mistake_code text not null check (mistake_code in (
    'LATE_ENTRY',
    'EARLY_ENTRY',
    'NO_SETUP',
    'MOVED_STOP',
    'NO_STOP',
    'OVERSIZED',
    'EARLY_EXIT',
    'LATE_EXIT',
    'REVENGE_TRADE',
    'OVERTRADING',
    'AGAINST_PLAN',
    'FOMO'
  )),
  note text,
  created_at timestamptz not null default now(),
  unique (trade_id, mistake_code)
);

alter table public.trade_mistakes enable row level security;

create policy "trade_mistakes_all_own" on public.trade_mistakes
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index trade_mistakes_trade_idx on public.trade_mistakes (trade_id);
create index trade_mistakes_code_idx on public.trade_mistakes (user_id, mistake_code);

-- 3. Limits the trader sets for themselves. Null means "no limit", which
--    is different from zero -- a max daily loss of 0 would block everything.
alter table public.app_settings
  add column if not exists max_daily_loss numeric,
  add column if not exists max_trades_per_day integer,
  add column if not exists max_risk_per_trade_pct numeric,
  add column if not exists account_size numeric;

comment on column public.app_settings.max_daily_loss is
  'Absolute currency amount. Null = no limit. Used to warn, never to block -- this app has no trading permissions and could not stop an order even if it wanted to.';
comment on column public.app_settings.account_size is
  'Used to express risk per trade as a percentage. Null until the user provides it.';
