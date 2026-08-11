-- Extensions and shared helper functions used across later migrations.

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Generic updated_at maintenance trigger, reused by every mutable table.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Row trigger: stamps updated_at = now() on every UPDATE. Attached per-table below.';
