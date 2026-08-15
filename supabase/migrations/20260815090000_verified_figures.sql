-- Freeze the numbers a trade had at the moment it was verified.
--
-- The validation workflow asks you to compare a reconstructed trade against
-- Coinbase and tick it off. But nothing stopped a later recomputation --
-- a new override, a corrected fill, an algorithm change -- from silently
-- moving the figures you already signed off on. The verification would
-- still say "coincide" while pointing at different numbers.
--
-- Storing the snapshot makes that detectable: after every reconstruction we
-- compare, and a difference raises a notification instead of passing
-- unnoticed. The verification is deliberately NOT invalidated automatically
-- -- deciding whether the new number is the right one is a judgement call,
-- and silently un-ticking work the user did would be its own surprise.

alter table public.trade_verifications
  add column if not exists verified_figures jsonb,
  add column if not exists figures_changed_at timestamptz;

comment on column public.trade_verifications.verified_figures is
  'Snapshot of {net_pnl, entry_wap, exit_wap, max_size, total_commissions} as they were when the user verified this trade. Compared after each reconstruction; see lib/validation/figures.ts.';

comment on column public.trade_verifications.figures_changed_at is
  'Set when a recomputation produced figures different from verified_figures. Never cleared automatically -- re-verifying the trade replaces the snapshot and resets it.';
