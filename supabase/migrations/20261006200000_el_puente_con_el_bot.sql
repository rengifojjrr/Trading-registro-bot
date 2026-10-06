/*
  El puente con el bot de WhatsApp (E4 del diseño «un solo cerebro»).

  El bot vive en una Mac que se duerme. La regla que lo ordena todo: **el bot
  siempre llama a la aplicación; la aplicación nunca llama al bot.** No se abre
  ningún puerto de la Mac ni se depende de su túnel. Cada lado guarda su cola y
  se pone al día al volver.

  El bot entra por `/api/puente/v1/…` (rutas de Vercel) con una firma HMAC por
  cliente: `mac-1` (el bot en la Mac), `vps-1` (el bot en un servidor, más
  adelante) y `claude-1` (Claude Code en la Mac, para cargar archivos de
  proyecto). Esta migración pone lo que esas rutas necesitan en la base.

  ## Todo es aditivo

  Tablas nuevas, funciones nuevas y disparadores nuevos. Ni un `drop` de algo
  que existiera, ni un `update` de filas que ya hay. La aplicación de hoy no
  lee ninguna de estas tablas y sigue igual.

  ## Las llaves no están aquí

  `puente_llaves` no guarda ningún secreto, ni siquiera su huella sola basta:
  la llave de cada cliente se **deriva** con la clave de servicio de Supabase,
  que sólo vive en las variables de Vercel. Aquí queda la sal (con la que se
  vuelve a derivar) y la huella SHA-256 de la llave (para comprobar que la
  derivación sigue saliendo igual). Con una copia de esta tabla no se firma
  nada. Se crean, se rotan (dos vivas a la vez por cliente) y se revocan una
  a una desde Ajustes, con la sesión del dueño y su segundo factor.

  Las cinco tablas del puente tienen RLS **y** se les quitan los permisos de
  tabla a `anon` y `authenticated` («dos cerraduras», como
  `paper_cron_secret`): sólo el rol de servicio, desde las rutas del puente,
  las toca. La única que el dueño lee con su sesión es `puente_clientes` (el
  latido: cuándo habló el bot por última vez, si WhatsApp está conectado y la
  dirección de su panel), y sólo leerla.

  ## El feed de cambios

  `puente_cambios` es la lista, en orden, de lo que cambió en las tablas que
  el bot puede ver. La llenan disparadores (`puente_anotar_cambio`), no la
  aplicación: así ningún camino de escritura se puede olvidar de avisar. El
  bot pide «lo que haya después del número N» y recibe la foto de cada fila
  con sólo las columnas de su lista (`src/lib/puente/tablas.ts`).

  Si un cambio lo hizo el propio puente, la fila lo dice (`por`): la ruta
  manda la cabecera `x-puente-cliente` y el disparador la cree sólo si quien
  escribe es el rol de servicio. Una sesión normal no puede hacerse pasar por
  el bot.

  `puente_vigilar_tablas()` pone los disparadores en las tablas de la lista
  que existan. Los recordatorios (`core_reminders`) llegan con otra migración:
  si se aplica después de ésta, basta con volver a llamarla.

  ## Propuestas: «Para revisar»

  `core_inbox` es lo que el bot saca de mensajes, reuniones y llamadas y
  espera tu «sí»: un título corto y ya tapado (sin teléfonos ni citas), de
  dónde salió (una referencia opaca que sólo abre el panel de la Mac) y su
  estado. Nada entra en tus tareas sin que lo aceptes.
*/

-- ------------------------------------------------------------------ llaves

create table if not exists public.puente_llaves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente text not null check (cliente in ('mac-1', 'vps-1', 'claude-1')),
  -- Con la sal y la clave de servicio se vuelve a derivar la llave.
  sal text not null check (sal ~ '^[0-9a-f]{32,64}$'),
  -- SHA-256 de la llave entera: comprueba que la derivación sigue igual.
  huella text not null check (huella ~ '^[0-9a-f]{64}$'),
  etiqueta text check (etiqueta is null or char_length(etiqueta) <= 60),
  creada_en timestamptz not null default now(),
  usada_en timestamptz,
  revocada_en timestamptz
);

create index if not exists puente_llaves_vivas_idx
  on public.puente_llaves (cliente) where revocada_en is null;

create index if not exists puente_llaves_user_idx
  on public.puente_llaves (user_id, cliente);

-- ------------------------------------------------- nonces (contra repetir)

-- Una petición firmada vale una sola vez: su nonce se guarda 15 minutos (la
-- ventana de la hora es de ±5). Una copia capturada de una petición buena no
-- se puede volver a mandar.
create table if not exists public.puente_nonces (
  llave_id uuid not null references public.puente_llaves (id) on delete cascade,
  nonce text not null check (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  visto_en timestamptz not null default now(),
  primary key (llave_id, nonce)
);

create index if not exists puente_nonces_visto_idx
  on public.puente_nonces (visto_en);

-- ----------------------------------------------------- clientes (latido)

create table if not exists public.puente_clientes (
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente text not null check (cliente in ('mac-1', 'vps-1', 'claude-1')),
  -- Cualquier petición firmada que llegue.
  visto_en timestamptz,
  -- El último «agente_estado» (lo manda el bot, no Claude).
  estado_en timestamptz,
  boot_id text check (boot_id is null or boot_id ~ '^[0-9a-f-]{8,64}$'),
  boot_anterior text check (boot_anterior is null or boot_anterior ~ '^[0-9a-f-]{8,64}$'),
  boot_cambio_en timestamptz,
  -- Dos procesos hablando con la misma llave a la vez (la Mac y el servidor
  -- durante la mudanza): el arranque va y vuelve en pocos minutos.
  dos_motores_en timestamptz,
  version text check (version is null or char_length(version) <= 40),
  -- La dirección del panel de la Mac, para los enlaces «Abrir en el panel».
  -- Sólo https y sólo el origen con una ruta simple: nada de usuario,
  -- consulta ni fragmento.
  panel_url text check (
    panel_url is null
    or (char_length(panel_url) <= 200
        and panel_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$')
  ),
  wa_conectado boolean,
  donde text check (donde is null or donde in ('MAC', 'SERVIDOR')),
  primary key (user_id, cliente)
);

-- ------------------------------------------- operaciones ya aplicadas

-- Cada operación nace con su id en el bot (UUIDv7) y viaja siempre igual. Un
-- reenvío (la red se cortó antes de la respuesta) devuelve lo mismo que la
-- primera vez sin volver a aplicarla.
create table if not exists public.puente_ops (
  op_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  cliente text not null check (cliente in ('mac-1', 'vps-1', 'claude-1')),
  kind text not null check (kind ~ '^[a-z_]{3,40}$'),
  aplicada_en timestamptz not null default now(),
  resultado jsonb not null check (jsonb_typeof(resultado) = 'object')
);

create index if not exists puente_ops_aplicada_idx
  on public.puente_ops (aplicada_en);

-- --------------------------------------------------------- feed de cambios

create table if not exists public.puente_cambios (
  seq bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  entidad text not null check (entidad in (
    'proyecto', 'tarea', 'persona', 'miembro', 'frente', 'hito', 'bitacora',
    'doc', 'fuente', 'propuesta', 'recordatorio'
  )),
  entidad_id uuid not null,
  op text not null check (op in ('upsert', 'delete')),
  version integer,
  -- Quién lo cambió por el puente; nulo = la aplicación (o cualquier otra vía).
  por text check (por is null or por in ('mac-1', 'vps-1', 'claude-1')),
  cambiado_en timestamptz not null default now()
);

create index if not exists puente_cambios_user_seq_idx
  on public.puente_cambios (user_id, seq);

-- ------------------------------------------------- propuestas (para revisar)

create table if not exists public.core_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in (
    'TAREA', 'AVANCE', 'DECISION', 'HITO', 'PERSONA', 'MIEMBRO', 'FUENTE', 'COMO_VA', 'CIERRE', 'ORDEN'
  )),
  project_id uuid,
  alt_project_ids uuid[] not null default '{}' check (cardinality(alt_project_ids) <= 5),
  -- Corto y YA tapado por el bot: sin teléfonos, sin citas.
  title text not null check (char_length(trim(title)) between 1 and 200),
  -- Lo que hace falta para aceptarla de un toque (responsable, fecha…). Nunca
  -- el texto de un mensaje.
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4000),
  confidence text not null default 'DUDOSA' check (confidence in ('FIRME', 'DUDOSA')),
  why text check (why is null or char_length(why) <= 120),
  source_kind text check (source_kind is null or source_kind in ('LLAMADA', 'REUNION', 'MENSAJE', 'DICTADO', 'DOCUMENTO', 'CLAUDE')),
  source_ref text check (source_ref is null or char_length(source_ref) <= 80),
  source_label text check (source_label is null or char_length(source_label) <= 120),
  source_at timestamptz,
  status text not null default 'ABIERTA' check (status in ('ABIERTA', 'ACEPTADA', 'DESCARTADA', 'CADUCADA')),
  decided_at timestamptz,
  decided_via text check (decided_via is null or decided_via in ('WEB', 'WHATSAPP', 'VOZ', 'CLAUDE')),
  dismiss_reason text check (dismiss_reason is null or dismiss_reason in ('NO_ES_TAREA', 'OTRO_PROYECTO', 'YA_HECHA', 'OTRO')),
  result_kind text check (result_kind is null or result_kind ~ '^[a-z_]{3,20}$'),
  result_id uuid,
  expires_at timestamptz not null default (now() + interval '30 days'),
  ext_source text check (ext_source is null or char_length(ext_source) <= 20),
  ext_id text check (ext_id is null or char_length(ext_id) <= 120),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'ABIERTA' or decided_at is not null or status = 'CADUCADA'),
  unique (id, user_id),
  unique (user_id, ext_source, ext_id),
  foreign key (project_id, user_id) references public.tasks_projects (id, user_id)
    on delete set null (project_id)
);

create index if not exists core_inbox_abiertas_idx
  on public.core_inbox (user_id, status, created_at desc);

drop trigger if exists core_inbox_subir_version on public.core_inbox;
create trigger core_inbox_subir_version
  before update on public.core_inbox
  for each row execute function public.subir_version();

drop trigger if exists set_core_inbox_updated_at on public.core_inbox;
create trigger set_core_inbox_updated_at
  before update on public.core_inbox
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------- funciones

-- Gasta un nonce: true la primera vez, false si ya se usó (una repetición).
-- De paso olvida los de hace más de 15 minutos. La llama la ruta del puente
-- con el rol de servicio; nadie más.
create or replace function public.puente_usar_nonce(p_llave uuid, p_nonce text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.puente_nonces where visto_en < now() - interval '15 minutes';
  insert into public.puente_nonces (llave_id, nonce) values (p_llave, p_nonce);
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

comment on function public.puente_usar_nonce(uuid, text) is
  'Puente: gasta un nonce (true la primera vez, false si se repite) y olvida los de hace más de 15 min.';

-- Apunta en el feed cada cambio de una tabla vigilada. `tg_argv[0]` es el
-- nombre de la entidad. `security definer`: quien cambia una tarea desde la
-- aplicación no tiene permiso sobre `puente_cambios`, y no debe tenerlo.
create or replace function public.puente_anotar_cambio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila jsonb;
  por text := null;
  rol text := null;
begin
  if tg_op = 'DELETE' then
    fila := to_jsonb(old);
  else
    fila := to_jsonb(new);
  end if;

  begin
    rol := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    if rol = 'service_role' then
      por := nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-puente-cliente';
    end if;
  exception
    when others then
      por := null;
  end;
  if por is not null and por not in ('mac-1', 'vps-1', 'claude-1') then
    por := null;
  end if;

  insert into public.puente_cambios (user_id, entidad, entidad_id, op, version, por)
  values (
    (fila ->> 'user_id')::uuid,
    tg_argv[0],
    (fila ->> 'id')::uuid,
    case when tg_op = 'DELETE' then 'delete' else 'upsert' end,
    case when tg_op = 'DELETE' then null else (fila ->> 'version')::integer end,
    por
  );
  return null;
end;
$$;

comment on function public.puente_anotar_cambio() is
  'Disparador del puente: apunta en puente_cambios qué fila cambió (sin su contenido).';

-- Pone el disparador del feed en cada tabla de la lista que exista y que aún
-- no lo tenga, y apunta en el feed cada fila que ya había (así el bot, al
-- empezar desde cero, recibe también lo de antes). Se puede volver a llamar:
-- lo que ya vigila lo deja como está. Con `resembrar`, vuelve a apuntar todas
-- las filas de todas (tras restaurar una copia, que no lleva el feed).
-- Devuelve cuántas tablas empezó a vigilar o resembró.
create or replace function public.puente_vigilar_tablas(resembrar boolean default false)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  par text[];
  n integer := 0;
  nueva boolean;
begin
  foreach par slice 1 in array array[
    ['tasks_projects', 'proyecto'],
    ['tasks_items', 'tarea'],
    ['core_people', 'persona'],
    ['tasks_project_members', 'miembro'],
    ['tasks_streams', 'frente'],
    ['tasks_milestones', 'hito'],
    ['tasks_project_log', 'bitacora'],
    ['tasks_project_docs', 'doc'],
    ['tasks_project_sources', 'fuente'],
    ['core_inbox', 'propuesta'],
    ['core_reminders', 'recordatorio']
  ] loop
    if to_regclass('public.' || par[1]) is null then
      continue;
    end if;
    nueva := not exists (
      select 1 from pg_trigger
       where tgname = par[1] || '_puente'
         and tgrelid = to_regclass('public.' || par[1])
    );
    if nueva then
      execute format(
        'create trigger %I after insert or update or delete on public.%I '
        'for each row execute function public.puente_anotar_cambio(%L)',
        par[1] || '_puente', par[1], par[2]
      );
    end if;
    if nueva or resembrar then
      execute format(
        'insert into public.puente_cambios (user_id, entidad, entidad_id, op, version) '
        'select user_id, %L, id, ''upsert'', version from public.%I',
        par[2], par[1]
      );
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

comment on function public.puente_vigilar_tablas(boolean) is
  'Pone el disparador del feed del puente en las tablas de su lista que existan (y apunta lo que ya había). Volver a llamarla tras crear core_reminders; con true, tras restaurar una copia.';

-- Cerradas a los dos (ver permisos-sql.test.ts). La del nonce la llama la ruta
-- con el rol de servicio.
revoke all on function public.puente_usar_nonce(uuid, text) from public, anon, authenticated;
grant execute on function public.puente_usar_nonce(uuid, text) to service_role;
revoke all on function public.puente_anotar_cambio() from public, anon, authenticated;
revoke all on function public.puente_vigilar_tablas(boolean) from public, anon, authenticated;

select public.puente_vigilar_tablas();

-- --------------------------------------------------------------------- RLS

alter table public.puente_llaves   enable row level security;
alter table public.puente_nonces   enable row level security;
alter table public.puente_clientes enable row level security;
alter table public.puente_ops      enable row level security;
alter table public.puente_cambios  enable row level security;
alter table public.core_inbox      enable row level security;

-- Segunda cerradura: sin permiso de tabla. Una RLS apagada por descuido deja
-- «permission denied» en vez de las filas.
revoke all on table public.puente_llaves from anon, authenticated;
revoke all on table public.puente_nonces from anon, authenticated;
revoke all on table public.puente_ops from anon, authenticated;
revoke all on table public.puente_cambios from anon, authenticated;
revoke all on sequence public.puente_cambios_seq_seq from anon, authenticated;

-- El latido lo lee el dueño (la tarjeta de WhatsApp en Hoy); sólo leerlo.
revoke all on table public.puente_clientes from anon, authenticated;
grant select on table public.puente_clientes to authenticated;

drop policy if exists puente_clientes_own_rows on public.puente_clientes;
create policy puente_clientes_own_rows on public.puente_clientes
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Las propuestas, como todo lo tuyo: las ves y las decides tú.
drop policy if exists core_inbox_own_rows on public.core_inbox;
create policy core_inbox_own_rows on public.core_inbox
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- El segundo factor, en cada tabla nueva (ver 20261006130000 y
-- supabase/tests/segundo-factor.prueba.sql).
do $$
declare
  t text;
begin
  foreach t in array array[
    'puente_llaves', 'puente_nonces', 'puente_clientes', 'puente_ops', 'puente_cambios', 'core_inbox'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_segundo_factor', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using ((select public.sesion_cumple_mfa())) with check ((select public.sesion_cumple_mfa()))',
      t || '_segundo_factor', t
    );
  end loop;
end $$;

comment on table public.puente_llaves is
  'Llaves del puente con el bot: sal y huella. La llave se deriva con la clave de servicio (sólo en Vercel); aquí no hay secreto.';
comment on table public.puente_nonces is
  'Nonces de las peticiones firmadas del puente, 15 minutos: una petición capturada no se puede repetir.';
comment on table public.puente_clientes is
  'Latido de cada cliente del puente (mac-1, vps-1, claude-1): última vez, arranque, panel, WhatsApp conectado.';
comment on table public.puente_ops is
  'Operaciones del puente ya aplicadas, con su resultado: un reenvío devuelve lo mismo sin aplicar dos veces.';
comment on table public.puente_cambios is
  'Feed del puente: qué fila cambió y cuándo, en orden (seq). La llenan disparadores; nunca el contenido.';
comment on table public.core_inbox is
  'Para revisar: lo que el bot propone (título corto y tapado, de dónde salió) hasta que lo aceptas o descartas.';
