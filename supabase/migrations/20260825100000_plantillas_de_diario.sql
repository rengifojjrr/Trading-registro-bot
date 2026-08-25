-- Combinaciones de diario guardadas para volver a aplicarlas.
--
-- Los errores se repiten: eso es lo que los hace errores. Una ráfaga de FOMO
-- tras una pérdida lleva siempre las mismas etiquetas, la misma emoción y casi
-- la misma nota, y volver a marcarlas una por una cada vez es la fricción que
-- hace que a la tercera ya no se apunte nada.
--
-- Se guarda el contenido, no una referencia a las operaciones: la plantilla es
-- «cómo suele pasarme esto», no «lo que puse aquel día».
create table if not exists public.journal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  -- Lo mismo que acepta la aplicación en bloque: errores, emociones,
  -- estrategia, adherencia, lección y notas. Se guarda como jsonb porque el
  -- conjunto de campos aplicables ya está definido y validado en
  -- `lib/journal/bulk-apply.ts`, y duplicarlo en columnas obligaría a migrar la
  -- tabla cada vez que se añada uno.
  values jsonb not null default '{}'::jsonb,
  -- Cuántas veces se ha usado, para poder ordenar por lo que de verdad se usa
  -- en lugar de por orden alfabético.
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint journal_templates_name_not_blank check (btrim(name) <> ''),
  constraint journal_templates_values_is_object check (jsonb_typeof(values) = 'object'),
  -- Dos plantillas con el mismo nombre serían dos filas indistinguibles en un
  -- desplegable, que es la peor forma de tener que adivinar.
  constraint journal_templates_unique_name unique (user_id, name)
);

create index if not exists journal_templates_user_idx
  on public.journal_templates (user_id, use_count desc, name);

alter table public.journal_templates enable row level security;

drop policy if exists "journal_templates_own" on public.journal_templates;
create policy "journal_templates_own" on public.journal_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
