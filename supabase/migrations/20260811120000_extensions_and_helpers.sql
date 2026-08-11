-- Extensions and shared helper functions used across later migrations.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Generic updated_at maintenance trigger, reused by every mutable table.
-- `set search_path = public` pins the function against the classic
-- Postgres search-path-hijack footgun (flagged by Supabase's own security
-- advisor when this was first omitted).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Row trigger: stamps updated_at = now() on every UPDATE. Attached per-table below.';
