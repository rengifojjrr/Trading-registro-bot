/*
  Recordatorios que suenan aunque la Mac duerma (E2 del diseño «un solo cerebro»).

  «Recuérdame todos los días a las 8 revisar el precio del crudo» tiene que
  sonar en el teléfono a las 8, con la Mac cerrada y sin que nadie abra la
  aplicación. Por eso el reloj vive aquí, en la base, como el del simulador:
  `pg_cron` llama cada minuto a `recordatorios_tick()`, que apunta el disparo,
  crea el aviso de la campana y, por `pg_net`, le pide a la aplicación que
  mande el push (vacío: el teléfono pide el texto con su sesión).

  ## Una sola implementación de «cuándo»

  Cuándo suena un recordatorio lo calcula `recordatorio_siguiente()` y nadie
  más: el disparador que pone `next_fire_at` al guardar, el reloj que lo avanza
  al sonar, la vista previa de «las 5 próximas veces» de la pantalla y el
  calendario llaman a la misma función. Así la vista previa no puede prometer
  una hora y el reloj sonar a otra. El lector de frases de la aplicación (y el
  del bot) sólo traducen palabras a la regla; nunca calculan fechas de disparo.

  La regla se calcula en la zona del dueño (`tz`, la de sus ajustes al crearlo)
  y con su horario de verano: `(fecha + hora) at time zone tz`. Una hora que no
  existe (las 02:30 del día que se adelanta el reloj) suena a las 03:30; una que
  existe dos veces (las 01:30 del día que se atrasa) suena una sola vez, la
  segunda (Postgres la toma en hora estándar).

  ## Noche

  Con `quiet` (por defecto), nada suena entre las 22:00 y las 07:00: se mueve a
  las 07:00. La aplicación guarda `quiet = false` cuando la hora la pusiste tú
  y cae de noche («recuérdame a las 23:00…»): ésa sí suena. Lo mismo al
  posponer: «en 1 h» a las 21:30 suena a las 07:00 si el recordatorio respeta
  la noche.

  ## Todo es aditivo

  - `notifications` gana el tipo `RECORDATORIO` (la lista se amplía como en
    20260902160000) y la columna `href` (a dónde lleva el aviso, siempre una
    ruta de la propia aplicación).
  - Tablas nuevas: `core_reminders`, `core_reminder_fires` y `core_reloj`.
  - «Tu día» a las 07:30 para cada cuenta que ya existe (se apaga con un toque).

  ## El secreto del reloj

  `core_reloj` guarda el secreto con el que el reloj se identifica ante
  `/api/recordatorios/disparar` y la dirección del despliegue, con las dos
  cerraduras de `paper_cron_secret` (RLS sin políticas y sin permiso de tabla
  para `anon` ni `authenticated`). La dirección se copia del trabajo del
  simulador si existe; si no, hay que ponerla a mano (docs/RECORDATORIOS.md).
  Sin dirección los recordatorios siguen apareciendo en la campana y en «Hoy»;
  sólo no hay push.
*/

-- --------------------------------------------- avisos: tipo nuevo y destino

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check check (type in (
    'SYNC_FAILURE',
    'DISCREPANCY',
    'UNCLASSIFIED_FILL',
    'MISSING_CONTRACT_SPEC',
    'CALC_UNVERIFIED',
    'NOTION_ERROR',
    'RISK_LIMIT',
    'JOURNAL_PENDING',
    'LIQUIDATION',
    'RECORDATORIO'
  ));

-- A dónde lleva el aviso. Sólo una ruta de la aplicación: empieza por una
-- barra y no por dos (`//otro.sitio` sería salir a otra web).
alter table public.notifications
  add column if not exists href text
    check (href is null or (char_length(href) <= 300 and href ~ '^/([^/\\].*)?$'));

-- --------------------------------------------------------- recordatorios

create table if not exists public.core_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Vacío sólo en los «vivos», que se arman al sonar.
  text text check (text is null or char_length(text) <= 200),
  kind text not null default 'TEXTO'
    check (kind in ('TEXTO', 'QUE_FALTA', 'COMO_VA', 'TU_DIA')),
  -- A qué va atado: un proyecto, una tarea o una persona. Opcional.
  entity_kind public.entity_kind,
  entity_id uuid,
  freq text not null
    check (freq in ('UNA_VEZ', 'DIARIO', 'LABORABLES', 'SEMANAL', 'MENSUAL', 'CADA_N_DIAS')),
  every_n smallint check (every_n is null or every_n between 1 and 365),
  at_time time not null,
  -- 1 = lunes … 7 = domingo.
  days smallint[] not null default '{}',
  -- -1 = el último día del mes. Un 31 en un mes de 30 suena el 30.
  monthday smallint check (monthday is null or (monthday between -1 and 31 and monthday <> 0)),
  -- UNA_VEZ: el día. CADA_N_DIAS: el día desde el que se cuenta. Los demás:
  -- desde cuándo (opcional).
  on_date date,
  until_date date,
  tz text not null default 'America/New_York' check (char_length(tz) between 1 and 64),
  channels text[] not null default '{PUSH,WHATSAPP}',
  -- En la pantalla bloqueada sólo «Tienes un recordatorio».
  lock_private boolean not null default false,
  -- 22:00–07:00 no suena (se mueve a las 07:00) salvo que la hora la pusieras tú.
  quiet boolean not null default true,
  active boolean not null default true,
  -- «En 1 h»: cuándo vuelve a sonar.
  snooze_until timestamptz,
  -- Lo calcula la base (recordatorio_siguiente). Nunca lo escribe la aplicación.
  next_fire_at timestamptz,
  last_fired_at timestamptz,
  origin text not null default 'A_MANO'
    check (origin in ('A_MANO', 'WHATSAPP', 'VOZ', 'CLAUDE', 'IMPORTAR', 'SISTEMA')),
  field_src jsonb not null default '{}'::jsonb,
  ext_source text,
  ext_id text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'TEXTO' or (text is not null and char_length(trim(text)) >= 1)),
  check (kind not in ('QUE_FALTA', 'COMO_VA') or (entity_kind = 'PROYECTO' and entity_id is not null)),
  check ((entity_kind is null) = (entity_id is null)),
  check (entity_kind is null or entity_kind in ('PROYECTO', 'TAREA', 'PERSONA')),
  check (freq <> 'UNA_VEZ' or on_date is not null),
  check (freq <> 'SEMANAL' or cardinality(days) between 1 and 7),
  check (days <@ '{1,2,3,4,5,6,7}'::smallint[]),
  check (freq <> 'MENSUAL' or monthday is not null),
  check (freq <> 'CADA_N_DIAS' or (every_n is not null and on_date is not null)),
  check (until_date is null or on_date is null or until_date >= on_date),
  check (cardinality(channels) between 1 and 2 and channels <@ '{PUSH,WHATSAPP}'::text[]),
  unique (id, user_id),
  unique (user_id, ext_source, ext_id)
);

create index if not exists core_reminders_user_idx
  on public.core_reminders (user_id, active, next_fire_at);

-- Lo que mira el reloj cada minuto: sólo los encendidos con algo por sonar.
create index if not exists core_reminders_due_idx
  on public.core_reminders (next_fire_at) where active and next_fire_at is not null;

create index if not exists core_reminders_snooze_idx
  on public.core_reminders (snooze_until) where active and snooze_until is not null;

create index if not exists core_reminders_entity_idx
  on public.core_reminders (user_id, entity_kind, entity_id) where entity_id is not null;

-- Cada vez que sonó (o que lo diste por hecho antes de que sonara). La clave
-- (recordatorio, instante) hace imposible que el mismo disparo suene dos veces.
create table if not exists public.core_reminder_fires (
  reminder_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  fire_at timestamptz not null,
  -- El reloj llegó tarde (más de 2 h: la base estuvo parada): se apunta sin
  -- sonar, para que no suene a destiempo.
  missed boolean not null default false,
  pushed_at timestamptz,
  wa_copied_at timestamptz,
  done_at timestamptz,
  done_via text check (done_via is null or done_via in ('PUSH', 'APP', 'WHATSAPP', 'VOZ')),
  snoozed_to timestamptz,
  created_at timestamptz not null default now(),
  primary key (reminder_id, fire_at),
  foreign key (reminder_id, user_id) references public.core_reminders (id, user_id) on delete cascade
);

create index if not exists core_reminder_fires_user_idx
  on public.core_reminder_fires (user_id, fire_at desc);

create index if not exists core_reminder_fires_push_idx
  on public.core_reminder_fires (fire_at) where pushed_at is null and not missed;

-- ------------------------------------------------- el secreto del reloj

create table if not exists public.core_reloj (
  -- Una sola fila.
  id integer primary key default 1,
  secret text not null,
  -- https://el-despliegue: a dónde llama el reloj. Nula = sin push.
  base_url text check (base_url is null or base_url ~ '^https://[^/[:space:]]+$'),
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  constraint core_reloj_una_fila check (id = 1),
  constraint core_reloj_no_vacio check (length(secret) >= 32)
);

alter table public.core_reloj enable row level security;
revoke all on table public.core_reloj from anon, authenticated;

insert into public.core_reloj (id, secret)
values (1, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

comment on table public.core_reloj is
  'El secreto con el que el reloj de recordatorios (pg_cron) se identifica ante /api/recordatorios/disparar, y a dónde llama. Una fila, sin políticas ni permisos: sólo el rol de servicio y postgres.';

-- ------------------------------------------------------------- funciones

-- La noche, de 22:00 a 07:00 en la zona del recordatorio: lo que cae dentro se
-- mueve a las 07:00 (del día siguiente si es antes de medianoche).
create or replace function public.recordatorio_fuera_de_noche(p_t timestamptz, p_tz text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_t at time zone p_tz;
begin
  if v_local::time >= time '22:00' then
    return ((v_local::date + 1) + time '07:00') at time zone p_tz;
  elsif v_local::time < time '07:00' then
    return (v_local::date + time '07:00') at time zone p_tz;
  end if;
  return p_t;
end;
$$;

comment on function public.recordatorio_fuera_de_noche(timestamptz, text) is
  'Si el instante cae entre las 22:00 y las 07:00 de esa zona, las 07:00 siguientes; si no, el mismo instante.';

-- La próxima vez que suena, estrictamente después de `p_after`. Nula si ya no
-- vuelve a sonar (una vez que ya pasó, o pasado `until`).
create or replace function public.recordatorio_siguiente(
  p_freq text,
  p_at_time time,
  p_days smallint[],
  p_monthday smallint,
  p_every_n smallint,
  p_on_date date,
  p_until_date date,
  p_tz text,
  p_quiet boolean,
  p_after timestamptz
)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_day date;
  v_last date;
  v_match boolean;
  v_cand timestamptz;
  i integer;
begin
  if p_freq is null or p_at_time is null or p_tz is null or p_after is null then
    return null;
  end if;

  if p_freq = 'UNA_VEZ' then
    if p_on_date is null then
      return null;
    end if;
    v_cand := (p_on_date + p_at_time) at time zone p_tz;
    if p_quiet then
      v_cand := public.recordatorio_fuera_de_noche(v_cand, p_tz);
    end if;
    return case when v_cand > p_after then v_cand end;
  end if;

  -- Un día antes: lo de anoche a las 23:00 que la noche mueve a hoy a las 07:00.
  v_day := (p_after at time zone p_tz)::date - 1;

  for i in 0..800 loop
    if p_until_date is not null and v_day > p_until_date then
      return null;
    end if;

    v_match := case p_freq
      when 'DIARIO' then true
      when 'LABORABLES' then extract(isodow from v_day) between 1 and 5
      when 'SEMANAL' then extract(isodow from v_day)::smallint = any (coalesce(p_days, '{}'))
      when 'MENSUAL' then false
      when 'CADA_N_DIAS' then
        p_on_date is not null and coalesce(p_every_n, 0) > 0
        and v_day >= p_on_date and (v_day - p_on_date) % p_every_n = 0
      else false
    end;

    if p_freq = 'MENSUAL' and p_monthday is not null then
      v_last := (date_trunc('month', v_day) + interval '1 month' - interval '1 day')::date;
      v_match := case
        when p_monthday = -1 then v_day = v_last
        else extract(day from v_day) = least(p_monthday, extract(day from v_last))
      end;
    end if;

    -- «Desde»: antes de su primer día no suena.
    if v_match and p_freq <> 'CADA_N_DIAS' and p_on_date is not null and v_day < p_on_date then
      v_match := false;
    end if;

    if v_match then
      v_cand := (v_day + p_at_time) at time zone p_tz;
      if p_quiet then
        v_cand := public.recordatorio_fuera_de_noche(v_cand, p_tz);
      end if;
      if v_cand > p_after then
        return v_cand;
      end if;
    end if;

    v_day := v_day + 1;
  end loop;

  return null;
end;
$$;

comment on function public.recordatorio_siguiente(text, time, smallint[], smallint, smallint, date, date, text, boolean, timestamptz) is
  'La próxima vez que suena una regla de recordatorio, estrictamente después de p_after, en su zona y con su horario de verano. La ÚNICA implementación: la usan el disparador, el reloj, la vista previa y el calendario.';

-- «Las 5 próximas veces» de una regla que todavía no se ha guardado.
create or replace function public.recordatorio_vista_previa(
  p_freq text,
  p_at_time time,
  p_days smallint[],
  p_monthday smallint,
  p_every_n smallint,
  p_on_date date,
  p_until_date date,
  p_tz text,
  p_quiet boolean,
  p_n integer default 5
)
returns setof timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v_t timestamptz := now();
  i integer;
begin
  -- Que la zona exista: un error claro en vez de una lista vacía.
  perform now() at time zone p_tz;
  for i in 1..least(greatest(coalesce(p_n, 5), 1), 20) loop
    v_t := public.recordatorio_siguiente(
      p_freq, p_at_time, p_days, p_monthday, p_every_n, p_on_date, p_until_date, p_tz, p_quiet, v_t
    );
    exit when v_t is null;
    return next v_t;
  end loop;
end;
$$;

comment on function public.recordatorio_vista_previa(text, time, smallint[], smallint, smallint, date, date, text, boolean, integer) is
  'Las próximas veces (hasta 20) que sonaría una regla, calculadas con recordatorio_siguiente. Para la vista previa del formulario.';

-- Cuándo suenan tus recordatorios entre dos instantes (para el calendario).
-- Con los permisos de quien pregunta: las RLS dejan ver sólo los suyos.
create or replace function public.recordatorios_entre(p_desde timestamptz, p_hasta timestamptz)
returns table (reminder_id uuid, fire_at timestamptz)
language plpgsql
stable
set search_path = ''
as $$
declare
  r record;
  v_t timestamptz;
  v_hasta timestamptz := least(p_hasta, p_desde + interval '62 days');
  n integer;
begin
  for r in
    select c.id, c.freq, c.at_time, c.days, c.monthday, c.every_n, c.on_date, c.until_date, c.tz, c.quiet
      from public.core_reminders c
     where c.user_id = (select auth.uid())
       and c.active
  loop
    v_t := public.recordatorio_siguiente(
      r.freq, r.at_time, r.days, r.monthday, r.every_n, r.on_date, r.until_date, r.tz, r.quiet,
      p_desde - interval '1 microsecond'
    );
    n := 0;
    while v_t is not null and v_t < v_hasta and n < 100 loop
      reminder_id := r.id;
      fire_at := v_t;
      return next;
      n := n + 1;
      v_t := public.recordatorio_siguiente(
        r.freq, r.at_time, r.days, r.monthday, r.every_n, r.on_date, r.until_date, r.tz, r.quiet, v_t
      );
    end loop;
  end loop;
end;
$$;

comment on function public.recordatorios_entre(timestamptz, timestamptz) is
  'Las veces que sonarán los recordatorios encendidos de quien pregunta entre dos instantes (como mucho 62 días). Para el calendario.';

-- Antes de guardar: la zona existe y `next_fire_at` lo pone la base.
create or replace function public.recordatorio_preparar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Una zona que no existe da error aquí y no un recordatorio que nunca suena.
  perform now() at time zone new.tz;

  -- Desde la aplicación (o la API) no se escribe a mano cuándo suena: sólo la
  -- base. El reloj, que corre como dueño de la tabla, sí lo avanza.
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') then
    new.next_fire_at := old.next_fire_at;
    new.last_fired_at := old.last_fired_at;
  end if;

  if tg_op = 'INSERT'
     or new.freq is distinct from old.freq
     or new.at_time is distinct from old.at_time
     or new.days is distinct from old.days
     or new.monthday is distinct from old.monthday
     or new.every_n is distinct from old.every_n
     or new.on_date is distinct from old.on_date
     or new.until_date is distinct from old.until_date
     or new.tz is distinct from old.tz
     or new.quiet is distinct from old.quiet
     or (new.active and not old.active)
  then
    new.next_fire_at := public.recordatorio_siguiente(
      new.freq, new.at_time, new.days, new.monthday, new.every_n, new.on_date, new.until_date,
      new.tz, new.quiet, now()
    );
  end if;

  return new;
end;
$$;

comment on function public.recordatorio_preparar() is
  'Disparador de core_reminders: comprueba la zona y calcula next_fire_at con recordatorio_siguiente al crear o al cambiar la regla.';

-- «Hecho»: cierra ese disparo (aunque todavía no haya sonado: así no suena).
create or replace function public.recordatorio_hecho(p_reminder uuid, p_fire_at timestamptz, p_via text)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_snooze timestamptz;
begin
  if v_user is null or p_via not in ('PUSH', 'APP', 'WHATSAPP', 'VOZ') then
    return false;
  end if;

  select r.snooze_until into v_snooze
    from public.core_reminders r
   where r.id = p_reminder and r.user_id = v_user;
  if not found then
    return false;
  end if;

  insert into public.core_reminder_fires as f (reminder_id, user_id, fire_at, done_at, done_via)
  values (p_reminder, v_user, p_fire_at, now(), p_via)
  on conflict (reminder_id, fire_at) do update
    set done_at = coalesce(f.done_at, excluded.done_at),
        done_via = coalesce(f.done_via, excluded.done_via);

  -- Si lo habías pospuesto desde este disparo, ya no vuelve a sonar.
  if v_snooze is not null and exists (
    select 1 from public.core_reminder_fires f
     where f.reminder_id = p_reminder and f.fire_at = p_fire_at and f.snoozed_to = v_snooze
  ) then
    update public.core_reminders set snooze_until = null where id = p_reminder and user_id = v_user;
  end if;

  update public.notifications n
     set is_read = true, resolved_at = now()
   where n.user_id = v_user
     and n.dedup_key = 'rem:' || p_reminder || ':' || floor(extract(epoch from p_fire_at))::bigint
     and n.resolved_at is null;

  return true;
end;
$$;

comment on function public.recordatorio_hecho(uuid, timestamptz, text) is
  'Da por hecho un disparo (o uno que todavía no ha sonado, para que no suene) y apaga su aviso. Con los permisos de quien llama.';

-- «En 1 h»: vuelve a sonar dentro de N minutos (a las 07:00 si cae de noche y
-- el recordatorio respeta la noche). Devuelve cuándo.
create or replace function public.recordatorio_posponer(p_reminder uuid, p_fire_at timestamptz, p_minutos integer)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  r record;
  v_to timestamptz;
begin
  if v_user is null then
    return null;
  end if;

  select c.tz, c.quiet into r
    from public.core_reminders c
   where c.id = p_reminder and c.user_id = v_user;
  if not found then
    return null;
  end if;

  v_to := date_trunc('minute', now() + make_interval(mins => least(greatest(coalesce(p_minutos, 60), 1), 10080)));
  if r.quiet then
    v_to := public.recordatorio_fuera_de_noche(v_to, r.tz);
  end if;

  insert into public.core_reminder_fires as f (reminder_id, user_id, fire_at, snoozed_to)
  values (p_reminder, v_user, p_fire_at, v_to)
  on conflict (reminder_id, fire_at) do update
    set snoozed_to = excluded.snoozed_to
    where f.done_at is null;

  update public.core_reminders set snooze_until = v_to where id = p_reminder and user_id = v_user;

  update public.notifications n
     set is_read = true, resolved_at = now()
   where n.user_id = v_user
     and n.dedup_key = 'rem:' || p_reminder || ':' || floor(extract(epoch from p_fire_at))::bigint
     and n.resolved_at is null;

  return v_to;
end;
$$;

comment on function public.recordatorio_posponer(uuid, timestamptz, integer) is
  'Pospone un disparo N minutos (respetando la noche si el recordatorio lo pide) y apaga su aviso. Con los permisos de quien llama.';

-- El reloj. Lo llama pg_cron cada minuto, como dueño de las tablas.
create or replace function public.recordatorios_tick()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.core_reminders%rowtype;
  v_at timestamptz;
  v_tarde boolean;
  v_nuevo boolean;
  v_n integer := 0;
  v_url text;
  v_secret text;
begin
  -- 1. Lo pospuesto que vuelve a sonar.
  for r in
    select * from public.core_reminders
     where active and snooze_until is not null and snooze_until <= now()
     order by snooze_until
     limit 500
     for update skip locked
  loop
    v_at := r.snooze_until;
    insert into public.core_reminder_fires (reminder_id, user_id, fire_at)
    values (r.id, r.user_id, v_at)
    on conflict (reminder_id, fire_at) do nothing;
    v_nuevo := found;
    update public.core_reminders set snooze_until = null where id = r.id;
    if v_nuevo then
      perform public.recordatorio_aviso(r, v_at);
      v_n := v_n + 1;
    end if;
  end loop;

  -- 2. Lo que toca ahora.
  for r in
    select * from public.core_reminders
     where active and next_fire_at is not null and next_fire_at <= now()
     order by next_fire_at
     limit 500
     for update skip locked
  loop
    v_at := r.next_fire_at;
    -- Más de dos horas tarde (la base estuvo parada): se apunta, no suena.
    v_tarde := now() - v_at > interval '2 hours';
    insert into public.core_reminder_fires (reminder_id, user_id, fire_at, missed)
    values (r.id, r.user_id, v_at, v_tarde)
    on conflict (reminder_id, fire_at) do nothing;
    v_nuevo := found;

    update public.core_reminders
       set next_fire_at = public.recordatorio_siguiente(
             r.freq, r.at_time, r.days, r.monthday, r.every_n, r.on_date, r.until_date, r.tz, r.quiet,
             greatest(v_at, now())
           ),
           last_fired_at = v_at
     where id = r.id;

    -- Si ya estaba (lo diste por hecho antes de que sonara), no suena.
    if v_nuevo and not v_tarde then
      perform public.recordatorio_aviso(r, v_at);
      v_n := v_n + 1;
    end if;
  end loop;

  -- 3. Que la aplicación mande el push. Sólo si sonó algo y hay a dónde llamar.
  if v_n > 0 and exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net') then
    select c.base_url, c.secret into v_url, v_secret from public.core_reloj c where c.id = 1;
    if v_url is not null then
      begin
        execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
          using v_url || '/api/recordatorios/disparar',
                '{}'::jsonb,
                jsonb_build_object('content-type', 'application/json', 'x-reloj-secret', v_secret),
                20000;
      exception when others then
        -- Un fallo al pedir el push no puede deshacer los disparos: siguen en
        -- la campana y en «Hoy».
        raise warning 'recordatorios_tick: no se pudo pedir el push (%)', sqlerrm;
      end;
    end if;
  end if;

  -- 4. Una vez por hora, el historial de este trabajo de más de dos días: son
  --    1440 filas al día que, en el plan gratuito, llenarían la base.
  if extract(minute from now()) = 7 and exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    begin
      execute $q$
        delete from cron.job_run_details
         where jobid in (select jobid from cron.job where jobname = 'recordatorios-cada-minuto')
           and end_time < now() - interval '2 days'
      $q$;
    exception when others then
      raise warning 'recordatorios_tick: no se pudo limpiar el historial (%)', sqlerrm;
    end;
  end if;

  return v_n;
end;
$$;

comment on function public.recordatorios_tick() is
  'El reloj de los recordatorios: apunta los disparos que tocan, crea su aviso en la campana, avanza next_fire_at y pide el push a la aplicación. Lo llama pg_cron cada minuto.';

-- El aviso de la campana de un disparo. Lo usa el reloj.
create or replace function public.recordatorio_aviso(r public.core_reminders, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_titulo text;
  v_msg text;
begin
  if r.entity_kind = 'PROYECTO' then
    select p.name into v_nombre from public.tasks_projects p where p.id = r.entity_id and p.user_id = r.user_id;
  elsif r.entity_kind = 'TAREA' then
    select t.title into v_nombre from public.tasks_items t where t.id = r.entity_id and t.user_id = r.user_id;
  elsif r.entity_kind = 'PERSONA' then
    select pe.name into v_nombre from public.core_people pe where pe.id = r.entity_id and pe.user_id = r.user_id;
  end if;

  if r.kind = 'QUE_FALTA' then
    v_titulo := 'Qué falta';
    v_msg := 'Qué falta en ' || coalesce(v_nombre, 'el proyecto');
  elsif r.kind = 'COMO_VA' then
    v_titulo := 'Cómo va';
    v_msg := 'Cómo va ' || coalesce(v_nombre, 'el proyecto');
  elsif r.kind = 'TU_DIA' then
    v_titulo := 'Tu día';
    v_msg := 'Lo de hoy, de un vistazo.';
  else
    v_titulo := 'Recordatorio';
    v_msg := coalesce(nullif(trim(r.text), ''), 'Tienes un recordatorio')
             || coalesce(' · ' || v_nombre, '');
  end if;

  insert into public.notifications
    (user_id, type, severity, title, message, related_entity_type, related_entity_id, dedup_key, href)
  values (
    r.user_id, 'RECORDATORIO', 'INFO', v_titulo, left(v_msg, 300), 'RECORDATORIO', r.id::text,
    'rem:' || r.id || ':' || floor(extract(epoch from p_at))::bigint,
    '/tareas/recordatorios?r=' || r.id
  )
  on conflict do nothing;
end;
$$;

comment on function public.recordatorio_aviso(public.core_reminders, timestamptz) is
  'Crea el aviso de la campana (tipo RECORDATORIO, dedup rem:<id>:<epoch>) de un disparo. Sólo la usa recordatorios_tick.';

-- Los usuarios a los que hay que mandar push ahora, marcando sus disparos como
-- avisados en el mismo paso (dos llamadas a la vez no mandan dos pushes).
create or replace function public.recordatorios_reclamar_push()
returns table (user_id uuid, n integer)
language sql
security definer
set search_path = ''
as $$
  with reclamados as (
    update public.core_reminder_fires f
       set pushed_at = now()
      from public.core_reminders r
     where r.id = f.reminder_id
       and f.pushed_at is null
       and not f.missed
       and f.done_at is null
       and f.fire_at > now() - interval '2 hours'
       and f.fire_at <= now() + interval '1 minute'
       and 'PUSH' = any (r.channels)
    returning f.user_id
  )
  select reclamados.user_id, count(*)::integer from reclamados group by reclamados.user_id;
$$;

comment on function public.recordatorios_reclamar_push() is
  'Marca como avisados los disparos recientes sin push y devuelve a quién hay que mandarlo. Sólo el rol de servicio (la ruta /api/recordatorios/disparar).';

-- Cerradas al anónimo y a PUBLIC (permisos-sql.test.ts). Las de calcular y las
-- de «hecho» / «posponer» las usa la aplicación con la sesión del dueño; el
-- reloj, el aviso y el reclamo, nadie desde fuera.
revoke all on function public.recordatorio_fuera_de_noche(timestamptz, text) from public, anon;
revoke all on function public.recordatorio_siguiente(text, time, smallint[], smallint, smallint, date, date, text, boolean, timestamptz) from public, anon;
revoke all on function public.recordatorio_vista_previa(text, time, smallint[], smallint, smallint, date, date, text, boolean, integer) from public, anon;
revoke all on function public.recordatorios_entre(timestamptz, timestamptz) from public, anon;
revoke all on function public.recordatorio_preparar() from public, anon, authenticated;
revoke all on function public.recordatorio_hecho(uuid, timestamptz, text) from public, anon;
revoke all on function public.recordatorio_posponer(uuid, timestamptz, integer) from public, anon;
revoke all on function public.recordatorios_tick() from public, anon, authenticated;
revoke all on function public.recordatorio_aviso(public.core_reminders, timestamptz) from public, anon, authenticated;
revoke all on function public.recordatorios_reclamar_push() from public, anon, authenticated;

grant execute on function public.recordatorio_fuera_de_noche(timestamptz, text) to authenticated;
grant execute on function public.recordatorio_siguiente(text, time, smallint[], smallint, smallint, date, date, text, boolean, timestamptz) to authenticated;
grant execute on function public.recordatorio_vista_previa(text, time, smallint[], smallint, smallint, date, date, text, boolean, integer) to authenticated;
grant execute on function public.recordatorios_entre(timestamptz, timestamptz) to authenticated;
grant execute on function public.recordatorio_hecho(uuid, timestamptz, text) to authenticated;
grant execute on function public.recordatorio_posponer(uuid, timestamptz, integer) to authenticated;
grant execute on function public.recordatorios_reclamar_push() to service_role;

-- ---------------------------------------------------------- disparadores

drop trigger if exists core_reminders_preparar on public.core_reminders;
create trigger core_reminders_preparar
  before insert or update on public.core_reminders
  for each row execute function public.recordatorio_preparar();

drop trigger if exists core_reminders_subir_version on public.core_reminders;
create trigger core_reminders_subir_version
  before update on public.core_reminders
  for each row execute function public.subir_version();

drop trigger if exists set_core_reminders_updated_at on public.core_reminders;
create trigger set_core_reminders_updated_at
  before update on public.core_reminders
  for each row execute function public.set_updated_at();

-- --------------------------------------------------------------------- RLS

alter table public.core_reminders enable row level security;
alter table public.core_reminder_fires enable row level security;

drop policy if exists core_reminders_own_rows on public.core_reminders;
create policy core_reminders_own_rows on public.core_reminders
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists core_reminder_fires_own_rows on public.core_reminder_fires;
create policy core_reminder_fires_own_rows on public.core_reminder_fires
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- El segundo factor, como en todas (20261006130000): con un factor verificado,
-- una sesión aal1 no ve ni toca nada. También en la del secreto, aunque no
-- tenga políticas que abran nada (lo exige segundo-factor.prueba.sql).
do $$
declare
  t text;
begin
  foreach t in array array['core_reminders', 'core_reminder_fires', 'core_reloj'] loop
    execute format('drop policy if exists %I on public.%I', t || '_segundo_factor', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using ((select public.sesion_cumple_mfa())) with check ((select public.sesion_cumple_mfa()))',
      t || '_segundo_factor', t
    );
  end loop;
end $$;

comment on table public.core_reminders is
  'Recordatorios: texto (o «vivo»), regla de repetición en la zona del dueño y a qué van atados. next_fire_at lo calcula la base.';
comment on table public.core_reminder_fires is
  'Cada vez que sonó un recordatorio (o que se dio por hecho antes): hecho, pospuesto, avisado por push o copiado a WhatsApp.';

-- --------------------------------------------- «Tu día» a las 07:30 para todos

insert into public.core_reminders (user_id, kind, freq, at_time, tz, origin, ext_source, ext_id)
select u.id, 'TU_DIA', 'DIARIO', time '07:30',
       coalesce(nullif(s.timezone, ''), 'America/New_York'), 'SISTEMA', 'sistema', 'tu-dia'
  from auth.users u
  left join public.app_settings s on s.user_id = u.id
on conflict (user_id, ext_source, ext_id) do nothing;

-- ------------------------------------------------------------- el reloj

-- A dónde llamar: la misma dirección del simulador, si su trabajo existe. En un
-- Postgres sin pg_cron (las pruebas) no hace nada.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    update public.core_reloj
       set base_url = (
         select substring(j.command from '(https://[^/''"[:space:]]+)/api/paper/tick')
           from cron.job j
          where j.jobname = 'simulador-de-bots-cada-5-min'
          limit 1
       )
     where id = 1 and base_url is null;

    perform cron.schedule('recordatorios-cada-minuto', '* * * * *', 'select public.recordatorios_tick()');
  end if;
end $$;
