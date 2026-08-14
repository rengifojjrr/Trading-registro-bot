-- Records the manual check of a reconstructed trade against Coinbase's own
-- history (see docs/VALIDATION_CHECKLIST.md). This is the gate for turning
-- auto_sync_enabled on: automated tests prove the code does what the code
-- says, this proves what the code says matches the real account.
--
-- One row per trade (unique), so re-checking a trade updates the verdict
-- rather than inflating the count. `matches = false` is deliberately
-- storable: a recorded mismatch must block the gate, not be discarded.
create table public.trade_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null unique references public.trades (id) on delete cascade,
  matches boolean not null,
  note text,
  verified_at timestamptz not null default now()
);

alter table public.trade_verifications enable row level security;

create policy "trade_verifications_all_own" on public.trade_verifications
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index trade_verifications_user_idx on public.trade_verifications (user_id);

comment on table public.trade_verifications is
  'Manual verification of a reconstructed trade against Coinbase. Rows with matches=false block enabling auto-sync until resolved -- see docs/VALIDATION_CHECKLIST.md.';
