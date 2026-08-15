-- Vistas guardadas: una combinación de filtros con nombre.
--
-- Los filtros de esta aplicación ya viven en la query string, así que una
-- vista guardada no necesita una columna por filtro: guardar la cadena
-- entera significa que cualquier filtro que se añada en el futuro queda
-- soportado sin tocar el esquema.
--
-- Se guarda también la ruta porque los mismos filtros significan cosas
-- distintas en /trades, /analytics y /behaviour, y una vista sin ruta no
-- sabría a cuál volver.
create table if not exists public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  path text not null check (path like '/%'),
  query text not null default '',
  created_at timestamptz not null default now(),

  -- Dos vistas con el mismo nombre en la misma página serían imposibles de
  -- distinguir en la interfaz.
  unique (user_id, path, name)
);

create index if not exists saved_views_user_path_idx
  on public.saved_views (user_id, path, created_at);

alter table public.saved_views enable row level security;

drop policy if exists "saved_views_own_rows" on public.saved_views;
create policy "saved_views_own_rows" on public.saved_views
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
