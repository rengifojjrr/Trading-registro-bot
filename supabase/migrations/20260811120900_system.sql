-- System-level tables: internal notifications, CSV import bookkeeping, and
-- a generic audit log for security-relevant events.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in (
    'SYNC_FAILURE',
    'DISCREPANCY',
    'UNCLASSIFIED_FILL',
    'MISSING_CONTRACT_SPEC',
    'CALC_UNVERIFIED',
    'NOTION_ERROR'
  )),
  severity text not null default 'WARNING' check (severity in ('INFO', 'WARNING', 'CRITICAL')),
  title text not null,
  message text not null,
  related_entity_type text,
  related_entity_id text,
  -- A stable key (e.g. 'SYNC_FAILURE:account:<id>') that identifies "the
  -- same underlying issue" across repeated occurrences, so a stuck problem
  -- (Notion down, a recurring unclassified fill) updates one row instead of
  -- spamming a new one every ~5 min sync cycle. NULL is fine for genuinely
  -- one-off notifications.
  dedup_key text,
  occurrence_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  is_read boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- The service role creates and updates notifications (including bumping
-- occurrence_count/last_seen_at on a dedup match). The owning user may only
-- SELECT and UPDATE their own rows -- in practice the client only ever
-- changes is_read/resolved_at, though this policy does not mechanically
-- restrict which columns an UPDATE touches (a private single-user app; see
-- docs/DATABASE.md for the tradeoff). No INSERT/DELETE policy: the client
-- cannot fabricate or erase a notification.
create policy "notifications_select_own" on public.notifications
  for select using ((select auth.uid()) = user_id);
create policy "notifications_update_own" on public.notifications
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index notifications_user_unread_idx on public.notifications (user_id, is_read, created_at desc);
create unique index notifications_dedup_idx on public.notifications (user_id, dedup_key) where resolved_at is null and dedup_key is not null;

comment on table public.notifications is
  'Internal alerts surfaced in the Activity page. Messages must be human-readable and sanitized -- never include API keys, tokens, or raw secrets. Rows here are never fabricated to "complete" a dashboard; if something is unverifiable, it is reported as such.';

create table public.csv_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  filename text not null,
  column_mapping jsonb not null default '{}'::jsonb,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  status text not null default 'PENDING' check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  created_at timestamptz not null default now()
);

alter table public.csv_imports enable row level security;

-- The upload itself is a user-initiated action, but processing (parsing,
-- dedup detection, row counts) happens in a server action using the
-- service-role client so those counts can never be spoofed from the
-- client -- hence select-only here too.
create policy "csv_imports_select_own" on public.csv_imports
  for select using ((select auth.uid()) = user_id);

-- One row per source row in an uploaded CSV -- this is what actually makes
-- "preview + duplicate detection" implementable and debuggable, rather than
-- a single opaque summary count on csv_imports.
create table public.csv_import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  csv_import_id uuid not null references public.csv_imports (id) on delete cascade,
  row_number integer not null,
  raw_row jsonb not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'IMPORTED', 'DUPLICATE', 'ERROR')),
  error_message text,
  matched_raw_fill_id text references public.raw_fills (entry_id),
  created_at timestamptz not null default now()
);

alter table public.csv_import_rows enable row level security;

create policy "csv_import_rows_select_own" on public.csv_import_rows
  for select using ((select auth.uid()) = user_id);

create index csv_import_rows_import_idx on public.csv_import_rows (csv_import_id, row_number);

-- Generic audit trail for security-relevant events (auth, settings changes,
-- manual trade adjustments). Written by server-side code using the service
-- role; regular users can read their own history but cannot insert directly.
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_log enable row level security;

create policy "audit_log_select_own" on public.audit_log
  for select using ((select auth.uid()) = user_id);

create index audit_log_user_idx on public.audit_log (user_id, created_at desc);
