-- Account-level margin/risk parameters for the risk calculator (see
-- lib/risk/margin.ts). Everything here is a slow-changing constant the
-- user configures once from what Coinbase's own account UI shows them --
-- NOT a live value this app can read automatically. Coinbase's public
-- /products/{id} endpoint (already synced into products.raw_metadata)
-- does expose real intraday/overnight initial-margin rates per product,
-- so those are read from there instead of duplicated here; maintenance
-- margin rate has no such endpoint, so it stays user-entered.
-- Stored as fractions (0.10 = 10%), consistent with products.contract_size-
-- adjacent numeric columns and the raw Coinbase margin-rate fields.
alter table public.app_settings
  add column maintenance_margin_rate numeric not null default 0.10,
  add column target_margin_ratio numeric not null default 0.75,
  add column trading_fee_pct numeric not null default 0.0002,
  add column min_fee_per_contract numeric not null default 0.15;
