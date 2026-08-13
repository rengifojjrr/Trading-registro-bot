-- trade_price_extremes has existed since the position/extremes migration
-- but only ever had a SELECT policy, so nothing could actually populate
-- it -- the MFE/MAE numbers were computed on the fly for a single trade
-- and thrown away, which made any cross-trade aggregate impossible.
--
-- Writes are still the user's own rows only. The values are computed from
-- Coinbase candles by the app (see lib/analytics/mfe-mae.ts) and refreshed
-- in place per trade, hence INSERT + UPDATE but deliberately no DELETE:
-- a stale row should be recomputed, never silently dropped.
create policy "trade_price_extremes_insert_own" on public.trade_price_extremes
  for insert with check ((select auth.uid()) = user_id);

create policy "trade_price_extremes_update_own" on public.trade_price_extremes
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
