-- Los seis módulos de Vida, además del contrato de métricas del núcleo.
--
-- Sobre el prefijo: lo natural sería un esquema de Postgres por módulo
-- (sleep.entries, habits.entries…), pero Supabase sólo expone `public` a
-- PostgREST salvo que se añadan los esquemas a mano en la configuración del
-- proyecto. Como el objetivo es que esto funcione sin depender de un ajuste
-- del panel, cada módulo usa su prefijo dentro de public. La separación de
-- verdad vive donde importa: en las carpetas de src/modules y en la regla
-- de lint que impide que un módulo importe de otro. Extraer un módulo sigue
-- siendo mecánico -- te llevas sus tablas por prefijo.
--
-- Todo lo de aquí modela las plantillas reales de Notion, incluidas sus
-- opciones. Donde Notion guardaba algo que no se puede medir, aquí se
-- guarda medible y el comentario dice por qué.

-- ---------------------------------------------------------------- núcleo

-- El único punto de contacto entre módulos.
--
-- Cada módulo publica aquí un puñado de números por día. El panel de vida
-- lee sólo esta tabla, nunca las entrañas de un módulo, así que quitar un
-- módulo no rompe nada: deja de publicar y desaparece una tarjeta.
create table if not exists public.core_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  metric_date date not null,
  -- Coincide con el id del módulo en src/core/registry.ts.
  module text not null check (char_length(module) between 1 and 40),
  metric_key text not null check (char_length(metric_key) between 1 and 40),
  value numeric not null,
  unit text,
  updated_at timestamptz not null default now(),
  unique (user_id, metric_date, module, metric_key)
);

create index if not exists core_daily_metrics_lookup_idx
  on public.core_daily_metrics (user_id, metric_date desc, module);

-- ----------------------------------------------------------------- sueño

-- Guarda marcas de tiempo completas, no horas sueltas.
--
-- En Notion «A qué hora dormí» y «Hora de despertar» son listas de opciones
-- fijas y «Cuánto tiempo dormí» es texto («8 horas», «-4 horas»). Con eso no
-- se puede promediar ni saber cuánto dormiste de verdad. Con dos timestamps
-- la duración es aritmética, y cruzar la medianoche deja de ser un caso
-- especial.
create table if not exists public.sleep_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- La noche a la que pertenece el registro: dormirse a las 2am del día 5
  -- sigue siendo la noche del 4.
  sleep_date date not null,
  slept_at timestamptz,
  woke_at timestamptz,
  duration_minutes integer generated always as (
    case
      when slept_at is null or woke_at is null then null
      else greatest(0, (extract(epoch from (woke_at - slept_at)) / 60)::int)
    end
  ) stored,
  score numeric(4, 1) check (score is null or (score >= 0 and score <= 10)),
  -- Opciones tal cual están hoy en Notion. Array y no enum: cambiar la lista
  -- no debe exigir una migración.
  mood_on_waking text[] not null default '{}',   -- Apurado, Con hambre, Alegre, Cansado, Con sueño, Agradecido, Amargado, Con energía, Relajado, Dolor de espalda
  woke_how text[] not null default '{}',         -- Solo, Con alarma, Desperté durante la noche, Pesadilla, Me despertaron, La alarma sonó y no me desperté
  before_bed text[] not null default '{}',       -- Bañarme, Cepillarme los dientes, Trabajar hasta tarde, Hacer trading, Ver redes sociales, Escribir, Ejercicio, Ver serie, Leer, Trasnochar, Jugar, Grabar, Llamada
  -- El sueño narrado. Es la razón por la que este módulo existe además de
  -- para contar horas.
  dream text,
  notes text,
  place text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (woke_at is null or slept_at is null or woke_at > slept_at),
  unique (user_id, sleep_date)
);

create index if not exists sleep_entries_date_idx
  on public.sleep_entries (user_id, sleep_date desc);

-- --------------------------------------------------------------- hábitos

-- Un hábito es una fila, no una columna.
--
-- En Notion cada hábito es una columna de la tabla diaria, así que añadir
-- uno obliga a cambiar el esquema y el histórico nunca lo tiene. Ya pasó: el
-- rollup mensual todavía calcula 📵 y 🔞, que ya no existen en la tabla de
-- 2026. Aquí un hábito se puede crear, archivar y retomar sin tocar nada.
create table if not exists public.habits_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  emoji text,
  sort_order integer not null default 0,
  -- Archivar en vez de borrar: las rachas de los meses en que sí lo hiciste
  -- siguen siendo ciertas.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.habits_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits_definitions (id) on delete cascade,
  entry_date date not null,
  done boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, habit_id, entry_date)
);

create index if not exists habits_entries_date_idx
  on public.habits_entries (user_id, entry_date desc);

-- -------------------------------------------------------------- lecturas

-- Separa el libro de la sesión de lectura.
--
-- En Notion cada fila mezcla las dos cosas, y encima los campos se cruzaron:
-- «Cuánto tiempo leí» guarda géneros y «Cuántas hojas» tiene como única
-- opción «40 minutos». Aquí los minutos son minutos y las páginas, páginas.
create table if not exists public.reading_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  author text,
  -- Crecimiento personal, Fantasía, Metafísica, Marketing, Espiritual
  genres text[] not null default '{}',
  total_pages integer check (total_pages is null or total_pages > 0),
  status text not null default 'LEYENDO'
    check (status in ('POR_LEER', 'LEYENDO', 'TERMINADO', 'ABANDONADO')),
  created_at timestamptz not null default now(),
  unique (user_id, title)
);

create table if not exists public.reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  book_id uuid references public.reading_books (id) on delete set null,
  session_date date not null,
  started_at time,
  minutes integer check (minutes is null or minutes >= 0),
  pages integer check (pages is null or pages >= 0),
  score numeric(4, 1) check (score is null or (score >= 0 and score <= 10)),
  summary text,
  created_at timestamptz not null default now()
);

create index if not exists reading_sessions_date_idx
  on public.reading_sessions (user_id, session_date desc);

-- ---------------------------------------------------------------- tareas

create table if not exists public.tasks_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  color text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.tasks_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.tasks_projects (id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 300),
  status text not null default 'NO_INICIADA'
    check (status in ('NO_INICIADA', 'EN_CURSO', 'HECHA')),
  priority text not null default 'MEDIA'
    check (priority in ('ALTA', 'MEDIA', 'BAJA')),
  due_date date,
  -- Quehaceres domésticos, Viaje, Familia, Trabajo, Ocio, Deporte, Estudio, Otro
  categories text[] not null default '{}',
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_items_open_idx
  on public.tasks_items (user_id, status, due_date);

-- --------------------------------------------------------------- comidas

create table if not exists public.meals_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_date date not null,
  meal_type text not null check (meal_type in ('DESAYUNO', 'ALMUERZO', 'CENA')),
  name text not null check (char_length(trim(name)) between 1 and 200),
  notes text,
  cook text,
  created_at timestamptz not null default now()
);

create index if not exists meals_entries_date_idx
  on public.meals_entries (user_id, meal_date desc);

-- Ingredientes como filas, no como un párrafo.
--
-- En Notion los ingredientes son texto libre, así que no hay forma de sacar
-- una lista de la compra. Esta es la única ganancia real de traerse el
-- planificador, y depende entera de esta tabla.
create table if not exists public.meals_ingredients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  meal_id uuid not null references public.meals_entries (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  quantity numeric,
  unit text,
  sort_order integer not null default 0
);

create index if not exists meals_ingredients_meal_idx
  on public.meals_ingredients (meal_id);

-- -------------------------------------------------------------- contenido

-- El único módulo sin plantilla previa.
--
-- Hoy en Notion sólo existe la casilla «Trabajar en las redes» dentro de
-- Hábitos, que registra si trabajaste, no qué publicaste. Esto es lo
-- segundo.
create table if not exists public.content_pieces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  platforms text[] not null default '{}',   -- Instagram, TikTok, YouTube, X, LinkedIn
  status text not null default 'IDEA'
    check (status in ('IDEA', 'GRABADO', 'EDITADO', 'PROGRAMADO', 'PUBLICADO')),
  planned_date date,
  published_at timestamptz,
  url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists content_pieces_status_idx
  on public.content_pieces (user_id, status, planned_date);

-- ------------------------------------------------------------------- RLS

alter table public.core_daily_metrics  enable row level security;
alter table public.sleep_entries       enable row level security;
alter table public.habits_definitions  enable row level security;
alter table public.habits_entries      enable row level security;
alter table public.reading_books       enable row level security;
alter table public.reading_sessions    enable row level security;
alter table public.tasks_projects      enable row level security;
alter table public.tasks_items         enable row level security;
alter table public.meals_entries       enable row level security;
alter table public.meals_ingredients   enable row level security;
alter table public.content_pieces      enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'core_daily_metrics', 'sleep_entries', 'habits_definitions', 'habits_entries',
    'reading_books', 'reading_sessions', 'tasks_projects', 'tasks_items',
    'meals_entries', 'meals_ingredients', 'content_pieces'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_own_rows', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_own_rows', t
    );
  end loop;
end $$;
