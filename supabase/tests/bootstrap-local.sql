/*
  Lo mínimo de Supabase para aplicar las migraciones en un Postgres vacío.

  Sirve para una cosa: probar las migraciones y sus RLS en una base que no es
  la de verdad (`scripts/probar-migraciones-local.sh`). No es Supabase: no hay
  GoTrue, ni PostgREST, ni Storage. Hay lo que las migraciones nombran:

  - los roles `anon`, `authenticated`, `service_role` y `authenticator`;
  - `auth.users` y `auth.uid()` / `auth.role()` / `auth.jwt()`, que leen el
    JWT de `request.jwt.claims` igual que en Supabase;
  - los permisos por defecto del esquema `public` que pone Supabase (por eso
    cada función nueva tiene que llevar su `revoke`);
  - un `storage` de cartón con `buckets`, `objects` y `foldername()`.

  `pg_cron` y `pg_net` no vienen con un Postgres normal: el guion quita sus
  `create extension` antes de aplicar (ninguna migración los usa al aplicarse:
  el trabajo de pg_cron se crea a mano, ver docs/SIMULADOR.md).
*/

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login noinherit;
  end if;
end $$;

grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create schema if not exists extensions;
create schema if not exists storage;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- Supabase deja `extensions` en el search_path de todos: `gen_random_uuid()`
-- es del núcleo desde Postgres 13, pero `digest()` y compañía vienen de aquí.
do $$
begin
  execute format('alter database %I set search_path = "$user", public, extensions', current_database());
end $$;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(auth.jwt() ->> 'role', current_user)
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable
as $$
  select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)]
$$;

grant usage on schema storage to anon, authenticated, service_role;
