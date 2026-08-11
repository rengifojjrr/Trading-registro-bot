-- User profile and application settings. One row of each per auth.users row,
-- created automatically on signup via the handle_new_user trigger at the
-- bottom of this file.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- auth.uid() is wrapped as (select auth.uid()) throughout this project's
-- policies: Postgres then evaluates it once per statement (an InitPlan)
-- instead of once per row, which is Supabase's documented RLS performance
-- guidance. Functionally identical to the bare call, just faster at scale.
create policy "profiles_select_own" on public.profiles
  for select using ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check ((select auth.uid()) = id);

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- app_settings.active_product_id references products(product_id), but the
-- products table is created in the next migration. The column is nullable
-- and unconstrained here; the FK is attached with ALTER TABLE once products
-- exists (see 20260811120200_accounts_and_products.sql).
create table public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC',
  sync_interval_minutes integer not null default 5 check (sync_interval_minutes > 0),
  reconciliation_hour_local smallint not null default 2 check (reconciliation_hour_local between 0 and 23),
  monthly_report_day smallint not null default 1 check (monthly_report_day between 1 and 28),
  active_venue text not null default 'FCM' check (active_venue in ('FCM', 'INTX')),
  active_product_id text,
  notion_enabled boolean not null default false,
  notion_database_id text,
  -- Automatic 5-minute sync stays off until the user explicitly enables it
  -- after the manual 20-50 trade validation gate described in the project
  -- plan. Nothing in the app flips this automatically.
  auto_sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "app_settings_all_own" on public.app_settings
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger set_app_settings_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

comment on column public.app_settings.auto_sync_enabled is
  'Gate for the ~5 min Coinbase REST sync cron. Must stay false until the user has manually validated 20-50 reconstructed trades against Coinbase with no material differences.';

-- Bootstrap profile + settings rows whenever a new Supabase Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');

  insert into public.app_settings (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
