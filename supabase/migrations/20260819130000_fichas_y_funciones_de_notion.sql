-- Lo que hacía falta para que los módulos de vida se puedan abrir y editar,
-- y para que dejen de perder por el camino lo que Notion sí guarda.
--
-- Va todo en una migración porque son piezas de la misma idea: hasta ahora
-- cada fila era un resumen de sólo lectura, y una ficha que se abre necesita
-- a la vez tener qué enseñar (el cuerpo de la página, el icono), dónde
-- guardar lo que se le cuelga (comentarios, adjuntos, vínculos) y una red
-- debajo para cuando alguien borre de más.

-- ---------------------------------------------------------------- columnas

-- El cuerpo de la página de Notion. Es donde vive el trabajo de verdad: el
-- guion de un vídeo y la explicación de una tarea se escriben dentro de la
-- página, no en una propiedad, y por eso la primera importación los dejó
-- fuera enteros.
alter table public.content_pieces add column if not exists body text;
alter table public.tasks_items    add column if not exists description text;

-- El icono de la página. No es decoración: es lo que hace que reconozcas una
-- fila sin llegar a leerla.
alter table public.sleep_entries   add column if not exists icon text;
alter table public.tasks_items     add column if not exists icon text;
alter table public.meals_entries   add column if not exists icon text;
alter table public.reading_books   add column if not exists icon text;
alter table public.content_pieces  add column if not exists icon text;
alter table public.tasks_projects  add column if not exists icon text;

-- Tu propia estimación de cuánto dormiste, que no es la resta de las dos
-- horas apuntadas. Se guarda aparte precisamente porque la diferencia entre
-- las dos es el dato interesante.
alter table public.sleep_entries add column if not exists self_reported text;

-- «DIFICULTAD DE GRABAR» es una lista de varios valores en Notion. La columna
-- de un solo valor se queda para no romper nada que la lea, pero deja de ser
-- la fuente: se rellena con el primero de la lista.
alter table public.content_pieces
  add column if not exists record_difficulties text[] not null default '{}';

update public.content_pieces
   set record_difficulties = array[record_difficulty]
 where record_difficulty is not null
   and record_difficulties = '{}';

-- Una tarea puede durar varios días y puede tener hora. Hasta ahora todo se
-- aplanaba a un día suelto, así que lo que duraba se archivaba como si
-- ocurriera entero el último día.
alter table public.tasks_items
  add column if not exists due_end date,
  add column if not exists due_time time;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks_items'::regclass
      and conname = 'tasks_items_due_range_check'
  ) then
    alter table public.tasks_items
      add constraint tasks_items_due_range_check
      check (due_end is null or (due_date is not null and due_end >= due_date));
  end if;
end $$;

-- El color de un proyecto existía desde el principio y nunca se escribió.
-- Aquí se le da el mismo juego de nombres que usa Notion, para que importar
-- un color sea copiarlo y no traducirlo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tasks_projects'::regclass
      and conname = 'tasks_projects_color_check'
  ) then
    alter table public.tasks_projects
      add constraint tasks_projects_color_check
      check (color is null or color in (
        'default', 'gray', 'brown', 'orange', 'yellow',
        'green', 'blue', 'purple', 'pink', 'red'
      ));
  end if;
end $$;

-- ------------------------------------------------------------ entidades

-- Las tablas que siguen apuntan a cualquier fila de cualquier módulo, así que
-- guardan a qué tipo de cosa apuntan. No hay clave foránea posible contra
-- once tablas distintas; lo que sí hay es la misma política de RLS que todo
-- lo demás, y el borrado en cascada se hace explícito desde la aplicación.
--
-- La alternativa -- una tabla de comentarios por módulo, otra de adjuntos por
-- módulo -- son sesenta tablas para guardar lo mismo, y obliga a tocar el
-- esquema cada vez que nace un módulo.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'entity_kind') then
    create type public.entity_kind as enum (
      'SUENO', 'HABITO', 'TAREA', 'PROYECTO',
      'COMIDA', 'LECTURA', 'LIBRO', 'CONTENIDO'
    );
  end if;
end $$;

-- Comentarios. Notion deja abrir un hilo en cualquier página, y esa es la vía
-- por la que alguien que no eres tú -- un editor, por ejemplo -- deja una nota
-- sin tocar el contenido.
create table if not exists public.core_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_kind public.entity_kind not null,
  entity_id uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists core_comments_entity_idx
  on public.core_comments (user_id, entity_kind, entity_id, created_at);

-- Adjuntos. En el calendario de contenido hay dos propiedades de archivo
-- («Videos» y «Listo») donde viven los montajes; guardar sólo una dirección de
-- texto significaba que el fichero se quedaba en Drive y la app no lo tenía.
create table if not exists public.core_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_kind public.entity_kind not null,
  entity_id uuid not null,
  -- Cuál de las ranuras de archivo de la entidad ocupa. En contenido hay dos
  -- distintas y no significan lo mismo: el montaje y la versión final.
  slot text not null default 'ADJUNTO',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, storage_path)
);

create index if not exists core_attachments_entity_idx
  on public.core_attachments (user_id, entity_kind, entity_id, created_at);

-- Vínculos entre módulos. En Notion tu base de tareas tiene una relación de
-- verdad con otra base; aquí los seis módulos eran islas.
--
-- Se guarda dirigido y se consulta en las dos direcciones. Normalizar el par
-- para guardarlo una sola vez obligaría a ordenar tipo e identificador antes
-- de cada inserción, y a leerlo al revés la mitad de las veces: más listo y
-- más difícil de seguir.
create table if not exists public.core_relations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  from_kind public.entity_kind not null,
  from_id uuid not null,
  to_kind public.entity_kind not null,
  to_id uuid not null,
  created_at timestamptz not null default now(),
  check (not (from_kind = to_kind and from_id = to_id)),
  unique (user_id, from_kind, from_id, to_kind, to_id)
);

create index if not exists core_relations_to_idx
  on public.core_relations (user_id, to_kind, to_id);

-- La papelera. Borrar era inmediato y definitivo, con el botón justo al lado
-- del que cambia el estado; Notion te guarda lo borrado treinta días.
--
-- Se archiva la fila entera y sus hijos en JSON para poder devolverla con su
-- mismo identificador: restaurar una comida sin sus ingredientes sería
-- devolver un nombre vacío.
create table if not exists public.core_trash (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entity_kind public.entity_kind not null,
  entity_id uuid not null,
  -- Para poder decir «Tarea · Crear Inventario» en la lista sin reconstruir
  -- el JSON entero.
  label text not null,
  payload jsonb not null,
  deleted_at timestamptz not null default now()
);

create index if not exists core_trash_user_idx
  on public.core_trash (user_id, deleted_at desc);

-- Vistas guardadas por módulo. En «To-Do» tienes siete y en el calendario de
-- contenido cinco; aquí había pestañas fijas que no se podían ni duplicar.
--
-- Igual que las vistas de trading, se guarda la query string entera en lugar
-- de una columna por filtro: cualquier filtro futuro queda soportado sin
-- volver a tocar el esquema.
create table if not exists public.core_module_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  module text not null check (char_length(module) between 1 and 40),
  name text not null check (char_length(trim(name)) between 1 and 60),
  path text not null check (path like '/%'),
  query text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, module, name)
);

create index if not exists core_module_views_module_idx
  on public.core_module_views (user_id, module, sort_order, created_at);

-- Plantillas. Crear algo aquí empezaba siempre en blanco, y ese blanco es
-- justo lo que hace que no se rellene: en Notion tienes «Nueva tarea» y tres
-- plantillas distintas de publicación.
create table if not exists public.core_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  module text not null check (char_length(module) between 1 and 40),
  name text not null check (char_length(trim(name)) between 1 and 60),
  -- Los valores que la plantilla precarga, con los mismos nombres que los
  -- campos del formulario del módulo.
  payload jsonb not null default '{}'::jsonb,
  -- El cuerpo con el que nace la página. Es lo que hace útil «New Video Post»:
  -- no los campos, sino el esqueleto de HOOK / SCRIPT / TAGS ya escrito.
  body text,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, module, name)
);

create index if not exists core_templates_module_idx
  on public.core_templates (user_id, module, sort_order, created_at);

-- Una sola plantilla por defecto en cada módulo: dos serían un empate que
-- alguien tendría que desempatar en la interfaz cada vez.
create unique index if not exists core_templates_one_default_idx
  on public.core_templates (user_id, module) where is_default;

-- --------------------------------------------------------------------- RLS

alter table public.core_comments     enable row level security;
alter table public.core_attachments  enable row level security;
alter table public.core_relations    enable row level security;
alter table public.core_trash        enable row level security;
alter table public.core_module_views enable row level security;
alter table public.core_templates    enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'core_comments', 'core_attachments', 'core_relations',
    'core_trash', 'core_module_views', 'core_templates'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_own_rows', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_own_rows', t
    );
  end loop;
end $$;

-- ----------------------------------------------------------------- storage

-- Mismo convenio que las capturas de operaciones: cubo privado y la carpeta
-- de primer nivel es el identificador del usuario, que es lo que la política
-- comprueba.
insert into storage.buckets (id, name, public)
values ('vida-adjuntos', 'vida-adjuntos', false)
on conflict (id) do nothing;

drop policy if exists "vida_adjuntos_select_own" on storage.objects;
create policy "vida_adjuntos_select_own" on storage.objects
  for select using (
    bucket_id = 'vida-adjuntos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "vida_adjuntos_insert_own" on storage.objects;
create policy "vida_adjuntos_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'vida-adjuntos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "vida_adjuntos_delete_own" on storage.objects;
create policy "vida_adjuntos_delete_own" on storage.objects
  for delete using (
    bucket_id = 'vida-adjuntos'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

comment on policy "vida_adjuntos_select_own" on storage.objects is
  'Convenio de ruta: {user_id}/{entity_kind}/{entity_id}/{fichero}, igual que core_attachments.storage_path.';
