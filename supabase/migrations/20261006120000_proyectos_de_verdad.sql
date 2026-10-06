/*
  Proyectos de verdad: quién está, qué hace cada uno, por dónde va y qué pasó.

  Hasta hoy un proyecto era un nombre bajo el que colgar tareas. Para un negocio
  con socios hace falta más: cómo va en una frase, un objetivo, una ficha
  técnica, los frentes en que se parte el trabajo, una hoja de ruta con etapas
  e hitos, la gente que está y lo que hace cada una, y una bitácora de lo que
  pasó. Es la etapa E1 del diseño «un solo cerebro» (docs del agente).

  ## Todo es aditivo

  Ni un `drop`, ni un `update` de filas que ya existen:

  - `tasks_projects` y `tasks_items` ganan columnas nuevas, todas nulas o con
    valor por defecto. Las pantallas de hoy no leen ninguna y siguen igual.
  - `tasks_items.origin` nace **nula** para las tareas de antes y con
    'A_MANO' por defecto para las nuevas. Darle 'A_MANO' a todas habría sido
    mentir sobre las que vinieron de Notion; nula dice «de antes» y la
    aplicación lo traduce mirando `notion_page_id`.
  - Tablas nuevas: `core_people` (personas, en el núcleo porque las usarán
    varios módulos), y del módulo de tareas `tasks_project_members`,
    `tasks_streams` (frentes), `tasks_milestones` (etapas e hitos),
    `tasks_project_log` (bitácora), `tasks_project_docs` y sus versiones (la
    ficha técnica) y `tasks_project_sources` (documentos y enlaces).

  ## Nada apunta a lo de otro

  Las RLS dicen «sólo tus filas», pero una clave foránea se comprueba sin RLS:
  con un id ajeno se podría colgar una fila tuya de un proyecto de otra persona.
  Por eso cada referencia nueva es compuesta, `(x_id, user_id)` contra
  `(id, user_id)`: la base no deja apuntar fuera de lo propio, la consulta sea
  quien sea quien la haga. Para eso `tasks_projects` y `tasks_items` ganan un
  índice único `(id, user_id)` que no cambia nada de lo que ya hay (el id ya
  es único solo).

  `on delete set null (columna)` es de Postgres 15: anula sólo esa columna y no
  `user_id`, que es obligatoria.

  ## Quién escribió cada campo

  `field_src` guarda, campo a campo, quién lo puso: 'owner' (tú, en la
  aplicación), 'claude' (un archivo importado) o 'bot'. Importar otra vez el
  mismo proyecto nunca pisa un campo tuyo; sólo cambia lo que puso Claude.
  Un campo sin marca que ya tiene valor cuenta como tuyo: es lo que escribiste
  antes de que existiera la marca.

  ## Ids nacidos en el origen

  Las tablas nuevas aceptan el id que traiga quien inserta (por defecto, uno
  al azar). El importador los genera en el navegador antes de enseñar el plan,
  así que darle dos veces a «Crear» no duplica nada: la segunda vez las filas
  ya existen con esos ids. `ext_source` + `ext_id` quedan para el puente con el
  bot (E4), con índice único **no parcial** por la lección de
  `20260819120000_notion_ids_unicos.sql`.

  ## La versión la sube la base

  `version` empieza en 1 y la sube un disparador en cada `update`. Será la
  base de los conflictos entre la aplicación y el bot (E4); hoy sólo cuenta.
*/

-- ------------------------------------------------- referencias compuestas

create unique index if not exists tasks_projects_id_user_idx
  on public.tasks_projects (id, user_id);

create unique index if not exists tasks_items_id_user_idx
  on public.tasks_items (id, user_id);

-- ------------------------------------------------------------- proyecto v2

alter table public.tasks_projects
  add column if not exists slug text
    check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60)),
  add column if not exists aliases text[] not null default '{}',
  add column if not exists status text not null default 'EN_MARCHA'
    check (status in ('IDEA', 'EN_MARCHA', 'ESPERANDO', 'ATASCADO', 'EN_PAUSA', 'TERMINADO', 'DESCARTADO')),
  -- Nulo = lo calcula la aplicación. Puesto a mano vale hasta `health_until`.
  add column if not exists health text
    check (health is null or health in ('VERDE', 'AMARILLO', 'ROJO')),
  add column if not exists health_until timestamptz,
  add column if not exists objective text
    check (objective is null or char_length(objective) <= 300),
  -- «Cómo va»: un párrafo corto, con cuándo y quién lo escribió.
  add column if not exists how_md text
    check (how_md is null or char_length(how_md) <= 1500),
  add column if not exists how_at timestamptz,
  add column if not exists how_by text
    check (how_by is null or how_by in ('OWNER', 'CLAUDE', 'BOT')),
  -- Cuánto sube a la nube. Hoy sólo se construye 'COMPLETA'; los otros dos
  -- niveles existen para que un archivo que los pida se rechace en vez de
  -- subirse entero sin querer.
  add column if not exists cloud_level text not null default 'COMPLETA'
    check (cloud_level in ('COMPLETA', 'TITULOS', 'RESERVADO')),
  add column if not exists started_on date,
  add column if not exists target_on date,
  add column if not exists closed_on date,
  add column if not exists field_src jsonb not null default '{}'::jsonb,
  add column if not exists ext_source text,
  add column if not exists ext_id text,
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

-- Nulos distintos entre sí: los proyectos de antes, sin slug, no chocan.
create unique index if not exists tasks_projects_slug_idx
  on public.tasks_projects (user_id, slug);

create unique index if not exists tasks_projects_ext_idx
  on public.tasks_projects (user_id, ext_source, ext_id);

-- ---------------------------------------------------------------- personas

-- Sólo quien entra en algo tuyo (un proyecto, una tarea). Nunca la agenda de
-- contactos: el teléfono no sube, como mucho sus cuatro últimas cifras si lo
-- decides, y el enlace con su WhatsApp lo pondrá el bot (E5) tras un «sí»
-- escrito, nunca por el nombre (hay homónimos).
create table if not exists public.core_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Como la llamas tú.
  name text not null check (char_length(trim(name)) between 1 and 80),
  aliases text[] not null default '{}',
  -- Tu propia fila, «Yo». Una por usuario.
  is_owner boolean not null default false,
  relation text check (relation is null or char_length(relation) <= 120),
  org text check (org is null or char_length(org) <= 120),
  circle text check (circle is null or circle in ('FAMILIA', 'AMIGOS', 'TRABAJO', 'CLIENTES', 'SERVICIOS', 'OTROS')),
  -- TU nota corta. La ficha larga que arma el bot vive en la Mac.
  note text check (note is null or char_length(note) <= 1000),
  -- El enlace verificado con su WhatsApp. Sólo lo pondrá el bot.
  has_whatsapp boolean not null default false,
  -- Lo que dijiste tú: si tiene WhatsApp o no. No enlaza nada.
  whatsapp_hint text check (whatsapp_hint is null or whatsapp_hint in ('SI', 'NO')),
  phone_tail text check (phone_tail is null or phone_tail ~ '^[0-9]{4}$'),
  color text check (color is null or color in (
    'default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'
  )),
  archived_at timestamptz,
  field_src jsonb not null default '{}'::jsonb,
  ext_source text,
  ext_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, ext_source, ext_id)
);

create unique index if not exists core_people_owner_idx
  on public.core_people (user_id) where is_owner;

create index if not exists core_people_user_idx
  on public.core_people (user_id, archived_at, name);

-- ----------------------------------------------------- quién está y qué hace

create table if not exists public.tasks_project_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  person_id uuid not null,
  role text check (role is null or char_length(role) <= 80),
  -- Qué hace en ESTE proyecto, en una a tres líneas.
  does_md text check (does_md is null or char_length(does_md) <= 600),
  side text check (side is null or side in ('NOSOTROS', 'CONTRAPARTE', 'ASESOR', 'OTRO')),
  is_lead boolean not null default false,
  since date,
  active boolean not null default true,
  sort_order integer not null default 0,
  field_src jsonb not null default '{}'::jsonb,
  ext_source text,
  ext_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, person_id),
  unique (user_id, ext_source, ext_id),
  foreign key (project_id, user_id) references public.tasks_projects (id, user_id) on delete cascade,
  foreign key (person_id, user_id) references public.core_people (id, user_id) on delete cascade
);

create index if not exists tasks_project_members_person_idx
  on public.tasks_project_members (user_id, person_id);

-- ------------------------------------------------------- frentes («por cosa»)

create table if not exists public.tasks_streams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  name text not null check (char_length(trim(name)) between 1 and 60),
  lead_person_id uuid,
  sort_order integer not null default 0,
  active boolean not null default true,
  field_src jsonb not null default '{}'::jsonb,
  ext_source text,
  ext_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, name),
  unique (id, user_id),
  unique (user_id, ext_source, ext_id),
  foreign key (project_id, user_id) references public.tasks_projects (id, user_id) on delete cascade,
  foreign key (lead_person_id, user_id) references public.core_people (id, user_id)
    on delete set null (lead_person_id)
);

-- -------------------------------------------- hoja de ruta: etapas e hitos

create table if not exists public.tasks_milestones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  kind text not null check (kind in ('ETAPA', 'HITO')),
  -- La etapa a la que pertenece un hito. Una etapa no cuelga de nada.
  stage_id uuid,
  title text not null check (char_length(trim(title)) between 1 and 160),
  detail text check (detail is null or char_length(detail) <= 1000),
  starts_on date,
  due_on date,
  due_precision text not null default 'DIA'
    check (due_precision in ('DIA', 'SEMANA', 'MES', 'TRIMESTRE')),
  status text not null default 'PENDIENTE'
    check (status in ('PENDIENTE', 'EN_CURSO', 'HECHO', 'BLOQUEADO', 'SALTADO')),
  blocked_why text check (blocked_why is null or char_length(blocked_why) <= 300),
  done_at timestamptz,
  owner_person_id uuid,
  sort_order integer not null default 0,
  field_src jsonb not null default '{}'::jsonb,
  ext_source text,
  ext_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'HITO' or stage_id is null),
  check (stage_id is null or stage_id <> id),
  check (starts_on is null or due_on is null or due_on >= starts_on),
  unique (id, user_id),
  unique (user_id, ext_source, ext_id),
  foreign key (project_id, user_id) references public.tasks_projects (id, user_id) on delete cascade,
  foreign key (stage_id, user_id) references public.tasks_milestones (id, user_id)
    on delete set null (stage_id),
  foreign key (owner_person_id, user_id) references public.core_people (id, user_id)
    on delete set null (owner_person_id)
);

create index if not exists tasks_milestones_project_idx
  on public.tasks_milestones (user_id, project_id, sort_order);

-- ----------------------------------------------- tareas: crece tasks_items

-- Sigue siendo LA lista: la de «Hoy», la de «Todas» y el calendario la leen
-- igual que antes. Lo nuevo cuelga al lado.
alter table public.tasks_items
  -- La fila «Yo» de core_people = tuya; nulo = sin asignar.
  add column if not exists assignee_id uuid,
  add column if not exists with_ids uuid[] not null default '{}',
  add column if not exists stream_id uuid,
  add column if not exists milestone_id uuid,
  -- Subtareas, un nivel.
  add column if not exists parent_id uuid,
  add column if not exists origin text,
  add column if not exists source_kind text,
  -- Siempre OPACA: nunca el texto de un mensaje ni de una transcripción.
  add column if not exists source_ref text,
  add column if not exists source_label text,
  add column if not exists source_at timestamptz,
  add column if not exists field_src jsonb not null default '{}'::jsonb,
  add column if not exists ext_source text,
  add column if not exists ext_id text,
  add column if not exists version integer not null default 1;

-- El valor por defecto va aparte y después: así las tareas de antes se quedan
-- con nulo («de antes») y sólo las que nazcan desde ahora reciben 'A_MANO'.
alter table public.tasks_items alter column origin set default 'A_MANO';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.tasks_items'::regclass
                 and conname = 'tasks_items_origin_check') then
    alter table public.tasks_items add constraint tasks_items_origin_check
      check (origin is null or origin in (
        'A_MANO', 'NOTION', 'WHATSAPP', 'VOZ', 'CLAUDE', 'ANALISIS', 'REUNION', 'LLAMADA', 'IMPORTAR'
      ));
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.tasks_items'::regclass
                 and conname = 'tasks_items_source_check') then
    alter table public.tasks_items add constraint tasks_items_source_check
      check (
        (source_kind is null or source_kind in ('LLAMADA', 'REUNION', 'MENSAJE', 'DICTADO', 'DOCUMENTO', 'CLAUDE'))
        and (source_ref is null or char_length(source_ref) <= 80)
        and (source_label is null or char_length(source_label) <= 120)
      );
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.tasks_items'::regclass
                 and conname = 'tasks_items_parent_not_self_check') then
    alter table public.tasks_items add constraint tasks_items_parent_not_self_check
      check (parent_id is null or parent_id <> id);
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.tasks_items'::regclass
                 and conname = 'tasks_items_assignee_fkey') then
    alter table public.tasks_items add constraint tasks_items_assignee_fkey
      foreign key (assignee_id, user_id) references public.core_people (id, user_id)
      on delete set null (assignee_id);
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.tasks_items'::regclass
                 and conname = 'tasks_items_stream_fkey') then
    alter table public.tasks_items add constraint tasks_items_stream_fkey
      foreign key (stream_id, user_id) references public.tasks_streams (id, user_id)
      on delete set null (stream_id);
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.tasks_items'::regclass
                 and conname = 'tasks_items_milestone_fkey') then
    alter table public.tasks_items add constraint tasks_items_milestone_fkey
      foreign key (milestone_id, user_id) references public.tasks_milestones (id, user_id)
      on delete set null (milestone_id);
  end if;

  if not exists (select 1 from pg_constraint where conrelid = 'public.tasks_items'::regclass
                 and conname = 'tasks_items_parent_fkey') then
    -- Borrar la tarea madre suelta a sus subtareas en vez de llevárselas: la
    -- papelera archiva la tarea, no sus hijas, y una cascada las perdería sin
    -- que «deshacer» pudiera devolverlas.
    alter table public.tasks_items add constraint tasks_items_parent_fkey
      foreign key (parent_id, user_id) references public.tasks_items (id, user_id)
      on delete set null (parent_id);
  end if;
end $$;

create unique index if not exists tasks_items_ext_idx
  on public.tasks_items (user_id, ext_source, ext_id);

create index if not exists tasks_items_assignee_idx
  on public.tasks_items (user_id, assignee_id);

create index if not exists tasks_items_milestone_idx
  on public.tasks_items (milestone_id) where milestone_id is not null;

create index if not exists tasks_items_stream_idx
  on public.tasks_items (stream_id) where stream_id is not null;

create index if not exists tasks_items_parent_idx
  on public.tasks_items (parent_id) where parent_id is not null;

-- --------------------------------------------------------------- bitácora

create table if not exists public.tasks_project_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  -- Cuándo pasó, que no es cuándo se apuntó.
  at timestamptz not null default now(),
  kind text not null
    check (kind in ('NOTA', 'AVANCE', 'DECISION', 'BLOQUEO', 'LLAMADA', 'REUNION', 'MENSAJE', 'ESTADO')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  body text check (body is null or char_length(body) <= 1500),
  person_ids uuid[] not null default '{}',
  source_kind text check (source_kind is null or source_kind in ('LLAMADA', 'REUNION', 'MENSAJE', 'DICTADO', 'DOCUMENTO', 'CLAUDE')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 80),
  source_label text check (source_label is null or char_length(source_label) <= 120),
  origin text not null default 'A_MANO'
    check (origin in ('A_MANO', 'NOTION', 'WHATSAPP', 'VOZ', 'CLAUDE', 'ANALISIS', 'REUNION', 'LLAMADA', 'IMPORTAR')),
  -- Lo apuntó la aplicación sola (un cambio de estado), no tú.
  auto boolean not null default false,
  ext_source text,
  ext_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ext_source, ext_id),
  foreign key (project_id, user_id) references public.tasks_projects (id, user_id) on delete cascade
);

create index if not exists tasks_project_log_project_idx
  on public.tasks_project_log (user_id, project_id, at desc);

-- -------------------------------------------- documentos: la ficha técnica

create table if not exists public.tasks_project_docs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  kind text not null check (kind in ('FICHA', 'HOJA_DE_RUTA', 'ACTA', 'NOTA', 'OTRO')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  body_md text not null check (char_length(body_md) <= 60000),
  made_by text not null check (made_by in ('OWNER', 'CLAUDE', 'BOT')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (project_id, user_id) references public.tasks_projects (id, user_id) on delete cascade
);

-- Una sola ficha técnica por proyecto: dos serían un empate que alguien
-- tendría que deshacer cada vez.
create unique index if not exists tasks_project_docs_one_ficha_idx
  on public.tasks_project_docs (project_id) where kind = 'FICHA';

create index if not exists tasks_project_docs_project_idx
  on public.tasks_project_docs (user_id, project_id);

-- Las versiones anteriores, para «volver a la anterior». Las escribe un
-- disparador al cambiar el texto; se guardan las veinte últimas.
create table if not exists public.tasks_project_doc_versions (
  doc_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  version integer not null,
  body_md text not null check (char_length(body_md) <= 60000),
  made_by text not null check (made_by in ('OWNER', 'CLAUDE', 'BOT')),
  created_at timestamptz not null default now(),
  primary key (doc_id, version),
  foreign key (doc_id, user_id) references public.tasks_project_docs (id, user_id) on delete cascade
);

-- ------------------------------------------ fuentes: documentos y enlaces

-- El HECHO, nunca el contenido: de una llamada, título, fecha y duración; el
-- audio y la transcripción se quedan en la Mac. En E1 sólo se usan enlaces y
-- documentos; las llamadas, reuniones y chats llegarán con el bot.
create table if not exists public.tasks_project_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null,
  kind text not null check (kind in ('CHAT', 'GRUPO', 'LLAMADA', 'REUNION', 'DOCUMENTO', 'ENLACE', 'ARCHIVO_MAC')),
  label text not null check (char_length(trim(label)) between 1 and 120),
  ref text check (ref is null or char_length(ref) <= 200),
  lives text not null check (lives in ('NUBE', 'MAC')),
  person_ids uuid[] not null default '{}',
  at timestamptz,
  duration_sec integer check (duration_sec is null or duration_sec >= 0),
  -- Una llamada sugerida nacerá en false: «¿Era de aquí?».
  confirmed boolean not null default true,
  origin text not null default 'A_MANO'
    check (origin in ('A_MANO', 'NOTION', 'WHATSAPP', 'VOZ', 'CLAUDE', 'ANALISIS', 'REUNION', 'LLAMADA', 'IMPORTAR')),
  ext_source text,
  ext_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Un enlace es una dirección web y nada más: ni `javascript:` ni `data:`,
  -- que pintados como enlace se ejecutarían al tocarlos.
  check (kind <> 'ENLACE' or (ref is not null and ref ~* '^https?://[^[:space:]]+$')),
  unique (user_id, ext_source, ext_id),
  foreign key (project_id, user_id) references public.tasks_projects (id, user_id) on delete cascade
);

create index if not exists tasks_project_sources_project_idx
  on public.tasks_project_sources (user_id, project_id, created_at desc);

-- ------------------------------------------------------------ disparadores

-- La versión sube sola en cada cambio. No se fía de lo que mande el cliente:
-- la pisa siempre con la anterior más uno.
create or replace function public.subir_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

comment on function public.subir_version() is
  'Disparador: version = la anterior + 1 en cada UPDATE. Base de los conflictos entre la aplicación y el bot.';

-- Antes de cambiar el texto de un documento, guarda el que había. Se queda con
-- las veinte versiones más recientes. Corre con los permisos de quien edita
-- (security invoker), así que las RLS de la tabla de versiones se aplican igual.
create or replace function public.guardar_version_del_documento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body_md is distinct from old.body_md then
    insert into public.tasks_project_doc_versions (doc_id, user_id, version, body_md, made_by, created_at)
    values (old.id, old.user_id, old.version, old.body_md, old.made_by, old.updated_at)
    on conflict (doc_id, version) do nothing;

    delete from public.tasks_project_doc_versions v
     where v.doc_id = old.id
       and v.version <= old.version - 20;
  end if;
  return new;
end;
$$;

comment on function public.guardar_version_del_documento() is
  'Disparador de tasks_project_docs: guarda el texto anterior en tasks_project_doc_versions (las 20 últimas).';

-- Una función nace ejecutable por PUBLIC y Supabase añade encima anon y
-- authenticated: hay que cerrarla a los dos (ver permisos-sql.test.ts). El
-- disparador sigue saltando: el permiso se comprueba al crearlo, no al saltar.
revoke all on function public.subir_version() from public, anon, authenticated;
revoke all on function public.guardar_version_del_documento() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'tasks_projects', 'tasks_items', 'core_people', 'tasks_project_members',
    'tasks_streams', 'tasks_milestones', 'tasks_project_log', 'tasks_project_docs',
    'tasks_project_sources'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_subir_version', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.subir_version()',
      t || '_subir_version', t
    );
  end loop;

  -- `updated_at` lo pone la base en las tablas nuevas. En `tasks_items` no: ahí
  -- lo escribe la aplicación (y la importación de Notion conserva el suyo), y
  -- cambiarle el comportamiento no es de esta migración.
  foreach t in array array[
    'tasks_projects', 'core_people', 'tasks_project_members', 'tasks_streams',
    'tasks_milestones', 'tasks_project_log', 'tasks_project_docs', 'tasks_project_sources'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'set_' || t || '_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'set_' || t || '_updated_at', t
    );
  end loop;
end $$;

drop trigger if exists tasks_project_docs_guardar_version on public.tasks_project_docs;
create trigger tasks_project_docs_guardar_version
  before update on public.tasks_project_docs
  for each row execute function public.guardar_version_del_documento();

-- --------------------------------------------------------------------- RLS

alter table public.core_people                enable row level security;
alter table public.tasks_project_members      enable row level security;
alter table public.tasks_streams              enable row level security;
alter table public.tasks_milestones           enable row level security;
alter table public.tasks_project_log          enable row level security;
alter table public.tasks_project_docs         enable row level security;
alter table public.tasks_project_doc_versions enable row level security;
alter table public.tasks_project_sources      enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'core_people', 'tasks_project_members', 'tasks_streams', 'tasks_milestones',
    'tasks_project_log', 'tasks_project_docs', 'tasks_project_doc_versions',
    'tasks_project_sources'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_own_rows', t);
    execute format(
      'create policy %I on public.%I for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      t || '_own_rows', t
    );
  end loop;
end $$;

comment on table public.core_people is
  'Personas que entran en algo tuyo (proyectos, tareas). Nunca la agenda de WhatsApp ni teléfonos enteros.';
comment on table public.tasks_project_members is
  'Quién está en cada proyecto, su papel, de qué lado y qué hace.';
comment on table public.tasks_streams is
  'Frentes de un proyecto: los temas en que se parte el trabajo, con su responsable.';
comment on table public.tasks_milestones is
  'Hoja de ruta: etapas (ETAPA) y, dentro, hitos (HITO) con fecha y estado.';
comment on table public.tasks_project_log is
  'Bitácora de un proyecto: notas, avances, decisiones, bloqueos y cambios de estado.';
comment on table public.tasks_project_docs is
  'Documentos de un proyecto (la ficha técnica) en Markdown. Las versiones anteriores, en tasks_project_doc_versions.';
comment on table public.tasks_project_sources is
  'De dónde se alimenta un proyecto. Sólo el hecho (título, fecha, enlace), nunca el contenido de un chat o una llamada.';
