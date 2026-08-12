-- User-drawn chart markup (horizontal lines, trend lines, rectangles) on a
-- trade's candlestick chart -- basic technical-analysis annotation tools,
-- separate from journal_entries.stop_loss_price/take_profit_price (which
-- are single planned levels, not freeform markup) and from trades (never
-- touched by sync/reconstruction). Create/delete only in the UI (no
-- in-place edits), so there's no updated_at/trigger here, matching
-- trade_comments/trade_screenshots rather than journal_entries.
create table public.chart_drawings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades (id) on delete cascade,
  tool text not null check (tool in ('HLINE', 'TRENDLINE', 'RECTANGLE')),
  -- Shape depends on tool (validated at the application layer, same as
  -- other raw_payload-style jsonb columns in this schema):
  --   HLINE:      {"price": number}
  --   TRENDLINE:  {"p1": {"time": unix_seconds, "price": number}, "p2": {...}}
  --   RECTANGLE:  same shape as TRENDLINE -- two opposite corners
  points jsonb not null,
  color text not null default '#a78bfa',
  created_at timestamptz not null default now()
);

alter table public.chart_drawings enable row level security;

create policy "chart_drawings_all_own" on public.chart_drawings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index chart_drawings_trade_idx on public.chart_drawings (trade_id);
