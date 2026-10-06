/*
  Los recordatorios que suenan (20261007120000_recordatorios_que_suenan.sql),
  contra un Postgres de verdad.

  Lo corre `scripts/probar-migraciones-local.sh` después de aplicar todas las
  migraciones. Dos usuarios inventados, A y B, y el anónimo. Todo dentro de una
  transacción que se deshace al final: no deja nada.

  Lo que se comprueba:
  1. La regla (recordatorio_siguiente) en la zona del dueño, con horario de
     verano, y que no depende de la zona de la sesión (UTC, Tokio): todos los
     días, entre semana, los lunes, el 1 / el 31 / el último de cada mes, cada
     N días, una vez, «desde» y «hasta», y la noche (22:00–07:00).
  2. La vista previa y el calendario salen de la misma función.
  3. Al guardar, la base pone `next_fire_at`; la aplicación no puede
     escribirlo; una zona que no existe no se guarda.
  4. El reloj: apunta el disparo una vez, crea su aviso (con su destino), avanza
     la regla, no suena lo que diste por hecho antes, apunta sin sonar lo que
     llega tarde, y lo pospuesto vuelve a sonar (a las 07:00 si cae de noche).
  5. El reclamo del push marca los disparos y no los da dos veces.
  6. Cada uno ve sólo lo suyo; el anónimo, nada; el secreto del reloj y las
     claves de los avisos, nadie desde fuera.
*/

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

create function pg_temp.igual(got text, esperado text, que text) returns void
language plpgsql as $$
begin
  if got is distinct from esperado then
    raise exception 'FALLO (%): sale «%», se esperaba «%»', que, got, esperado;
  end if;
end $$;

-- La regla en hora de Nueva York, con el «después de» también en hora local.
create function pg_temp.sig(
  freq text, hora text, dias smallint[], dia_mes smallint, cada smallint,
  desde date, hasta date, noche boolean, despues text
) returns text
language sql as $$
  select to_char(
    public.recordatorio_siguiente(freq, hora::time, dias, dia_mes, cada, desde, hasta,
      'America/New_York', noche, despues::timestamp at time zone 'America/New_York')
    at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI')
$$;

-- Lo mismo pero en UTC, para ver el instante de verdad (horario de verano).
create function pg_temp.sig_utc(freq text, hora text, noche boolean, despues text) returns text
language sql as $$
  select to_char(
    public.recordatorio_siguiente(freq, hora::time, '{}', null, null, null, null,
      'America/New_York', noche, despues::timestamp at time zone 'America/New_York')
    at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
$$;

-- ------------------------------------------- 1. la regla, en dos zonas de sesión

do $$
declare
  zona text;
begin
  foreach zona in array array['UTC', 'Asia/Tokyo', 'America/Los_Angeles'] loop
    perform set_config('timezone', zona, true);

    -- Todos los días a las 8.
    perform pg_temp.igual(pg_temp.sig('DIARIO', '08:00', '{}', null, null, null, null, true, '2026-10-07 13:20'), '2026-10-08 08:00', 'diario, ya pasó hoy ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '08:00', '{}', null, null, null, null, true, '2026-10-07 07:59'), '2026-10-07 08:00', 'diario, todavía hoy ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '08:00', '{}', null, null, null, null, true, '2026-10-07 08:00'), '2026-10-08 08:00', 'diario, justo a la hora: la siguiente ' || zona);

    -- Horario de verano: las 8 son las 8 antes y después del cambio.
    perform pg_temp.igual(pg_temp.sig_utc('DIARIO', '08:00', true, '2026-03-07 09:00'), '2026-03-08 12:00', 'verano: 8 EDT = 12 UTC ' || zona);
    perform pg_temp.igual(pg_temp.sig_utc('DIARIO', '08:00', true, '2026-03-06 09:00'), '2026-03-07 13:00', 'antes del cambio: 8 EST = 13 UTC ' || zona);
    perform pg_temp.igual(pg_temp.sig_utc('DIARIO', '08:00', true, '2026-10-31 09:00'), '2026-11-01 13:00', 'fin del verano: 8 EST ' || zona);
    perform pg_temp.igual(pg_temp.sig_utc('DIARIO', '08:00', true, '2026-10-30 09:00'), '2026-10-31 12:00', 'último día de verano ' || zona);
    -- Una hora que no existe (02:30 el día que se adelanta) suena a las 03:30.
    perform pg_temp.igual(pg_temp.sig_utc('DIARIO', '02:30', false, '2026-03-07 09:00'), '2026-03-08 07:30', 'hora que no existe ' || zona);
    -- Una que existe dos veces (01:30 el día que se atrasa) suena una sola vez.
    perform pg_temp.igual(pg_temp.sig_utc('DIARIO', '01:30', false, '2026-10-31 09:00'), '2026-11-01 06:30', 'hora doble: una vez ' || zona);
    perform pg_temp.igual(pg_temp.sig_utc('DIARIO', '01:30', false, '2026-11-01 01:31'), '2026-11-02 06:30', 'hora doble: al día siguiente ' || zona);

    -- Entre semana: del viernes al lunes.
    perform pg_temp.igual(pg_temp.sig('LABORABLES', '08:00', '{}', null, null, null, null, true, '2026-10-09 10:00'), '2026-10-12 08:00', 'entre semana: viernes → lunes ' || zona);
    perform pg_temp.igual(pg_temp.sig('LABORABLES', '08:00', '{}', null, null, null, null, true, '2026-10-10 10:00'), '2026-10-12 08:00', 'entre semana: sábado → lunes ' || zona);
    perform pg_temp.igual(pg_temp.sig('LABORABLES', '08:00', '{}', null, null, null, null, true, '2026-10-12 07:00'), '2026-10-12 08:00', 'entre semana: lunes temprano ' || zona);

    -- Los lunes; lunes y jueves; fines de semana.
    perform pg_temp.igual(pg_temp.sig('SEMANAL', '09:00', '{1}', null, null, null, null, true, '2026-10-07 13:00'), '2026-10-12 09:00', 'los lunes ' || zona);
    perform pg_temp.igual(pg_temp.sig('SEMANAL', '09:00', '{1,4}', null, null, null, null, true, '2026-10-07 13:00'), '2026-10-08 09:00', 'lunes y jueves ' || zona);
    perform pg_temp.igual(pg_temp.sig('SEMANAL', '10:00', '{6,7}', null, null, null, null, true, '2026-10-07 13:00'), '2026-10-10 10:00', 'fin de semana ' || zona);
    perform pg_temp.igual(pg_temp.sig('SEMANAL', '10:00', '{7}', null, null, null, null, true, '2026-10-11 10:00'), '2026-10-18 10:00', 'domingo a la hora: el siguiente ' || zona);

    -- Cada mes: el 1, el 15, el 31 (en un mes de 30, el 30), el último.
    perform pg_temp.igual(pg_temp.sig('MENSUAL', '09:00', '{}', 1::smallint, null, null, null, true, '2026-10-07 13:00'), '2026-11-01 09:00', 'el 1 de cada mes ' || zona);
    perform pg_temp.igual(pg_temp.sig('MENSUAL', '09:00', '{}', 15::smallint, null, null, null, true, '2026-10-07 13:00'), '2026-10-15 09:00', 'el 15 ' || zona);
    perform pg_temp.igual(pg_temp.sig('MENSUAL', '09:00', '{}', 31::smallint, null, null, null, true, '2026-10-31 10:00'), '2026-11-30 09:00', 'el 31 en noviembre: el 30 ' || zona);
    perform pg_temp.igual(pg_temp.sig('MENSUAL', '09:00', '{}', 31::smallint, null, null, null, true, '2027-01-31 10:00'), '2027-02-28 09:00', 'el 31 en febrero: el 28 ' || zona);
    perform pg_temp.igual(pg_temp.sig('MENSUAL', '09:00', '{}', 30::smallint, null, null, null, true, '2028-01-31 10:00'), '2028-02-29 09:00', 'el 30 en un febrero bisiesto: el 29 ' || zona);
    perform pg_temp.igual(pg_temp.sig('MENSUAL', '18:00', '{}', -1::smallint, null, null, null, true, '2026-10-07 13:00'), '2026-10-31 18:00', 'el último del mes ' || zona);
    perform pg_temp.igual(pg_temp.sig('MENSUAL', '18:00', '{}', -1::smallint, null, null, null, true, '2026-10-31 18:00'), '2026-11-30 18:00', 'el último, ya pasado ' || zona);

    -- Cada 3 días desde el 7: 7, 10, 13…
    perform pg_temp.igual(pg_temp.sig('CADA_N_DIAS', '08:00', '{}', null, 3::smallint, '2026-10-07', null, true, '2026-10-07 13:00'), '2026-10-10 08:00', 'cada 3 días ' || zona);
    perform pg_temp.igual(pg_temp.sig('CADA_N_DIAS', '08:00', '{}', null, 3::smallint, '2026-10-07', null, true, '2026-10-01 13:00'), '2026-10-07 08:00', 'cada 3 días, antes de empezar ' || zona);
    perform pg_temp.igual(pg_temp.sig('CADA_N_DIAS', '08:00', '{}', null, 14::smallint, '2026-10-07', null, true, '2026-10-08 13:00'), '2026-10-21 08:00', 'cada 2 semanas ' || zona);

    -- Una vez.
    perform pg_temp.igual(pg_temp.sig('UNA_VEZ', '10:00', '{}', null, null, '2026-10-15', null, true, '2026-10-07 13:00'), '2026-10-15 10:00', 'una vez el 15 ' || zona);
    perform pg_temp.igual(pg_temp.sig('UNA_VEZ', '10:00', '{}', null, null, '2026-10-15', null, true, '2026-10-15 10:00'), null, 'una vez, ya pasó ' || zona);

    -- Desde y hasta.
    perform pg_temp.igual(pg_temp.sig('DIARIO', '08:00', '{}', null, null, '2026-10-20', null, true, '2026-10-07 13:00'), '2026-10-20 08:00', 'desde el 20 ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '08:00', '{}', null, null, null, '2026-10-08', true, '2026-10-08 09:00'), null, 'hasta el 8 ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '08:00', '{}', null, null, null, '2026-10-08', true, '2026-10-07 09:00'), '2026-10-08 08:00', 'el último día de «hasta» suena ' || zona);

    -- La noche: con quiet, a las 07:00; sin quiet (hora puesta por él), a su hora.
    perform pg_temp.igual(pg_temp.sig('DIARIO', '23:00', '{}', null, null, null, null, true, '2026-10-07 13:00'), '2026-10-08 07:00', 'noche: 23:00 → 07:00 del día siguiente ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '23:00', '{}', null, null, null, null, false, '2026-10-07 13:00'), '2026-10-07 23:00', 'noche: la puso él ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '06:00', '{}', null, null, null, null, true, '2026-10-07 13:00'), '2026-10-08 07:00', 'noche: 06:00 → 07:00 ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '23:00', '{}', null, null, null, null, true, '2026-10-08 06:59'), '2026-10-08 07:00', 'noche: lo de anoche suena a las 07:00 ' || zona);
    perform pg_temp.igual(pg_temp.sig('UNA_VEZ', '22:30', '{}', null, null, '2026-10-15', null, true, '2026-10-07 13:00'), '2026-10-16 07:00', 'una vez de noche → 07:00 ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '07:00', '{}', null, null, null, null, true, '2026-10-07 13:00'), '2026-10-08 07:00', 'las 07:00 ya no son noche ' || zona);
    perform pg_temp.igual(pg_temp.sig('DIARIO', '21:59', '{}', null, null, null, null, true, '2026-10-07 13:00'), '2026-10-07 21:59', 'las 21:59 todavía no son noche ' || zona);
  end loop;
end $$;

-- La noche al posponer: 21:30 + 1 h = 22:30 → 07:00 del día siguiente.
do $$
begin
  perform pg_temp.igual(
    to_char(public.recordatorio_fuera_de_noche('2026-10-07 22:30'::timestamp at time zone 'America/New_York', 'America/New_York')
            at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI'),
    '2026-10-08 07:00', 'posponer a la noche');
  perform pg_temp.igual(
    to_char(public.recordatorio_fuera_de_noche('2026-10-08 03:00'::timestamp at time zone 'America/New_York', 'America/New_York')
            at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI'),
    '2026-10-08 07:00', 'posponer a la madrugada');
  perform pg_temp.igual(
    to_char(public.recordatorio_fuera_de_noche('2026-10-08 12:00'::timestamp at time zone 'America/New_York', 'America/New_York')
            at time zone 'America/New_York', 'YYYY-MM-DD HH24:MI'),
    '2026-10-08 12:00', 'de día no se toca');
end $$;

-- --------------------------------------------- 2. vista previa = la misma regla

do $$
declare
  v timestamptz[];
  prev timestamptz := now();
  i integer;
begin
  select array_agg(t order by t) into v
    from public.recordatorio_vista_previa('LABORABLES', '08:00', '{}', null, null, null, null, 'America/New_York', true, 5) t;
  if cardinality(v) <> 5 then
    raise exception 'FALLO: la vista previa no trae 5 (%)', cardinality(v);
  end if;
  for i in 1..5 loop
    if v[i] <> public.recordatorio_siguiente('LABORABLES', '08:00', '{}', null, null, null, null, 'America/New_York', true, prev) then
      raise exception 'FALLO: la vista previa no coincide con la regla en la vez %', i;
    end if;
    prev := v[i];
  end loop;

  select array_agg(t) into v
    from public.recordatorio_vista_previa('UNA_VEZ', '10:00', '{}', null, null, (now() + interval '3 days')::date, null, 'America/New_York', true, 5) t;
  if cardinality(v) <> 1 then
    raise exception 'FALLO: una vez son una vez (%)', cardinality(v);
  end if;

  begin
    perform public.recordatorio_vista_previa('DIARIO', '08:00', '{}', null, null, null, null, 'Marte/Olimpo', true, 5);
    raise exception 'FALLO: una zona que no existe no puede dar vista previa';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ------------------------------------------------- 3. guardar: next_fire_at

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@prueba.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@prueba.test');

-- «Tu día» se creó para quien ya existía al migrar; estos dos son nuevos.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true); end $$;

insert into public.tasks_projects (id, user_id, name)
values ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Proyecto inventado');

insert into public.core_reminders (id, user_id, text, freq, at_time, tz, entity_kind, entity_id)
values ('a0000000-0000-4000-8000-000000000101', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Mirar el precio inventado', 'DIARIO', '08:00', 'America/New_York', 'PROYECTO', 'a0000000-0000-4000-8000-0000000000a1');

do $$
declare
  v record;
begin
  select next_fire_at, version into v from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000101';
  if v.next_fire_at is null
     or v.next_fire_at <> public.recordatorio_siguiente('DIARIO', '08:00', '{}', null, null, null, null, 'America/New_York', true, now()) then
    raise exception 'FALLO: al crear, next_fire_at no lo puso la regla';
  end if;

  -- La aplicación no puede escribir cuándo suena.
  update public.core_reminders set next_fire_at = now() - interval '1 day' where id = 'a0000000-0000-4000-8000-000000000101';
  if (select next_fire_at from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000101') <> v.next_fire_at then
    raise exception 'FALLO: authenticated pudo escribir next_fire_at';
  end if;

  -- Cambiar la hora lo recalcula.
  update public.core_reminders set at_time = '21:00' where id = 'a0000000-0000-4000-8000-000000000101';
  if (select next_fire_at from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000101')
     <> public.recordatorio_siguiente('DIARIO', '21:00', '{}', null, null, null, null, 'America/New_York', true, now()) then
    raise exception 'FALLO: al cambiar la hora no se recalculó';
  end if;
  update public.core_reminders set at_time = '08:00' where id = 'a0000000-0000-4000-8000-000000000101';

  -- Una zona que no existe no se guarda.
  begin
    insert into public.core_reminders (user_id, text, freq, at_time, tz)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'DIARIO', '08:00', 'Marte/Olimpo');
    raise exception 'FALLO: se guardó una zona que no existe';
  exception when invalid_parameter_value then null;
  end;

  -- Las reglas mal formadas no se guardan.
  begin
    insert into public.core_reminders (user_id, text, freq, at_time) values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'SEMANAL', '08:00');
    raise exception 'FALLO: semanal sin días';
  exception when check_violation then null;
  end;
  begin
    insert into public.core_reminders (user_id, text, freq, at_time, days) values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'SEMANAL', '08:00', '{8}');
    raise exception 'FALLO: un día 8';
  exception when check_violation then null;
  end;
  begin
    insert into public.core_reminders (user_id, freq, at_time) values ('aaaaaaaa-0000-4000-8000-000000000001', 'DIARIO', '08:00');
    raise exception 'FALLO: un recordatorio de texto sin texto';
  exception when check_violation then null;
  end;
  begin
    insert into public.core_reminders (user_id, kind, freq, at_time) values ('aaaaaaaa-0000-4000-8000-000000000001', 'QUE_FALTA', 'DIARIO', '08:00');
    raise exception 'FALLO: «qué falta» sin proyecto';
  exception when check_violation then null;
  end;
  begin
    insert into public.core_reminders (user_id, text, freq, at_time, channels) values ('aaaaaaaa-0000-4000-8000-000000000001', 'x', 'DIARIO', '08:00', '{SMS}');
    raise exception 'FALLO: un canal que no existe';
  exception when check_violation then null;
  end;
end $$;

-- Un «qué falta» vivo y uno sólo por WhatsApp (no se reclama para push).
insert into public.core_reminders (id, user_id, kind, freq, at_time, days, entity_kind, entity_id)
values ('a0000000-0000-4000-8000-000000000102', 'aaaaaaaa-0000-4000-8000-000000000001',
        'QUE_FALTA', 'SEMANAL', '09:00', '{1}', 'PROYECTO', 'a0000000-0000-4000-8000-0000000000a1');
insert into public.core_reminders (id, user_id, text, freq, at_time, channels)
values ('a0000000-0000-4000-8000-000000000103', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Sólo por WhatsApp', 'DIARIO', '10:00', '{WHATSAPP}');

-- ----------------------------------------------------------- 6. lo de cada uno

do $$ begin perform set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true); end $$;

do $$
begin
  if exists (select 1 from public.core_reminders where user_id <> 'bbbbbbbb-0000-4000-8000-000000000002') then
    raise exception 'FALLO: B ve recordatorios de A';
  end if;
  if exists (select 1 from public.recordatorios_entre(now(), now() + interval '30 days')) then
    raise exception 'FALLO: el calendario de B trae los de A';
  end if;
  -- Ni colgar un disparo de un recordatorio ajeno, conociendo su id.
  begin
    insert into public.core_reminder_fires (reminder_id, user_id, fire_at)
    values ('a0000000-0000-4000-8000-000000000101', 'bbbbbbbb-0000-4000-8000-000000000002', now());
    raise exception 'FALLO: B colgó un disparo de un recordatorio de A';
  exception when foreign_key_violation then null;
  end;
  -- Ni darlo por hecho ni posponerlo.
  if public.recordatorio_hecho('a0000000-0000-4000-8000-000000000101', now(), 'APP') then
    raise exception 'FALLO: B dio por hecho un recordatorio de A';
  end if;
  if public.recordatorio_posponer('a0000000-0000-4000-8000-000000000101', now(), 60) is not null then
    raise exception 'FALLO: B pospuso un recordatorio de A';
  end if;
  -- Ni el reloj, ni el aviso, ni el reclamo.
  begin
    perform public.recordatorios_tick();
    raise exception 'FALLO: authenticated puede correr el reloj';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.recordatorios_reclamar_push();
    raise exception 'FALLO: authenticated puede reclamar pushes';
  exception when insufficient_privilege then null;
  end;
  -- Ni el secreto del reloj, ni las claves de los avisos.
  begin
    perform * from public.core_reloj;
    raise exception 'FALLO: authenticated lee el secreto del reloj';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.core_push_keys;
    raise exception 'FALLO: authenticated lee las claves de los avisos';
  exception when insufficient_privilege then null;
  end;
end $$;

-- El anónimo, nada.
reset role;
set local role anon;
do $$ begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;
do $$
begin
  begin
    perform * from public.core_reminders;
    if found then raise exception 'FALLO: el anónimo ve recordatorios'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.recordatorio_vista_previa('DIARIO', '08:00', '{}', null, null, null, null, 'UTC', true, 5);
    raise exception 'FALLO: el anónimo puede usar la vista previa';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.recordatorio_hecho('a0000000-0000-4000-8000-000000000101', now(), 'APP');
    raise exception 'FALLO: el anónimo puede dar por hecho';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- A ve su calendario.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true); end $$;
do $$
declare
  n integer;
begin
  select count(*) into n from public.recordatorios_entre(now(), now() + interval '7 days')
   where reminder_id = 'a0000000-0000-4000-8000-000000000101';
  if n not between 7 and 8 then
    raise exception 'FALLO: en 7 días un diario suena 7 u 8 veces, no %', n;
  end if;
  select count(*) into n from public.recordatorios_entre(now(), now() + interval '400 days');
  if n > 3 * 100 then
    raise exception 'FALLO: el calendario no se corta (% filas)', n;
  end if;
end $$;

-- «Hecho» antes de que suene: así no suena.
do $$
declare
  v_next timestamptz;
begin
  select next_fire_at into v_next from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000101';
  if not public.recordatorio_hecho('a0000000-0000-4000-8000-000000000101', v_next, 'APP') then
    raise exception 'FALLO: A no pudo dar por hecho el suyo';
  end if;
end $$;
reset role;

-- --------------------------------------------------------------- 4. el reloj

-- El reloj corre como dueño de las tablas (pg_cron). Se adelantan los relojes
-- a mano para no esperar.
do $$
declare
  v_next timestamptz;
  v_hecho timestamptz;
  n integer;
  a record;
begin
  -- r1: lo diste por hecho para su próxima vez → al llegar no suena.
  select next_fire_at into v_hecho from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000101';
  update public.core_reminders set next_fire_at = v_hecho where id = 'a0000000-0000-4000-8000-000000000101';
  -- Que «llegue» ya: se mueve el disparo hecho y el next a hace un minuto.
  update public.core_reminder_fires set fire_at = date_trunc('minute', now()) - interval '1 minute'
   where reminder_id = 'a0000000-0000-4000-8000-000000000101';
  update public.core_reminders set next_fire_at = date_trunc('minute', now()) - interval '1 minute'
   where id = 'a0000000-0000-4000-8000-000000000101';

  -- r2: le toca ahora.
  update public.core_reminders set next_fire_at = date_trunc('minute', now()) - interval '1 minute'
   where id = 'a0000000-0000-4000-8000-000000000102';
  -- r3: llega tres horas tarde.
  update public.core_reminders set next_fire_at = date_trunc('minute', now()) - interval '3 hours'
   where id = 'a0000000-0000-4000-8000-000000000103';

  n := public.recordatorios_tick();
  if n <> 1 then
    raise exception 'FALLO: el reloj debía hacer sonar 1 (el de ahora), hizo %', n;
  end if;

  -- r1 no suena (estaba hecho), pero su regla avanza.
  if exists (select 1 from public.notifications where related_entity_id = 'a0000000-0000-4000-8000-000000000101') then
    raise exception 'FALLO: sonó uno que diste por hecho';
  end if;
  select next_fire_at into v_next from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000101';
  if v_next is null or v_next <= now() then
    raise exception 'FALLO: la regla de r1 no avanzó';
  end if;

  -- r2 suena: disparo, aviso con su destino y su clave.
  select * into a from public.notifications where related_entity_id = 'a0000000-0000-4000-8000-000000000102';
  if a is null then
    raise exception 'FALLO: r2 no dejó aviso en la campana';
  end if;
  perform pg_temp.igual(a.type, 'RECORDATORIO', 'tipo del aviso');
  perform pg_temp.igual(a.severity, 'INFO', 'severidad del aviso');
  perform pg_temp.igual(a.href, '/tareas/recordatorios?r=a0000000-0000-4000-8000-000000000102', 'destino del aviso');
  perform pg_temp.igual(a.message, 'Qué falta en Proyecto inventado', 'mensaje vivo');
  perform pg_temp.igual(a.dedup_key,
    'rem:a0000000-0000-4000-8000-000000000102:' || floor(extract(epoch from date_trunc('minute', now()) - interval '1 minute'))::bigint,
    'clave del aviso');
  if not exists (select 1 from public.core_reminder_fires
                  where reminder_id = 'a0000000-0000-4000-8000-000000000102' and not missed and pushed_at is null) then
    raise exception 'FALLO: r2 no apuntó su disparo';
  end if;
  if (select next_fire_at from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000102') <= now() then
    raise exception 'FALLO: la regla de r2 no avanzó';
  end if;

  -- r3 llegó tarde: se apunta sin sonar.
  if not exists (select 1 from public.core_reminder_fires where reminder_id = 'a0000000-0000-4000-8000-000000000103' and missed) then
    raise exception 'FALLO: lo que llega tarde no se apuntó como perdido';
  end if;
  if exists (select 1 from public.notifications where related_entity_id = 'a0000000-0000-4000-8000-000000000103') then
    raise exception 'FALLO: sonó uno que llegó tres horas tarde';
  end if;

  -- Otra vuelta del reloj en el mismo minuto: nada nuevo.
  if public.recordatorios_tick() <> 0 then
    raise exception 'FALLO: el reloj volvió a sonar lo mismo';
  end if;
  if (select count(*) from public.notifications where related_entity_id = 'a0000000-0000-4000-8000-000000000102') <> 1 then
    raise exception 'FALLO: dos avisos del mismo disparo';
  end if;

  -- 5. El reclamo del push: r2 sí, r3 no (perdido y sólo WhatsApp), una sola vez.
  select count(*) into n from public.recordatorios_reclamar_push();
  if n <> 1 then
    raise exception 'FALLO: el reclamo debía dar 1 usuario, dio %', n;
  end if;
  if exists (select 1 from public.recordatorios_reclamar_push()) then
    raise exception 'FALLO: el reclamo dio el mismo push dos veces';
  end if;
end $$;

-- Posponer desde el teléfono: vuelve a sonar.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true); end $$;
do $$
declare
  v_fire timestamptz := date_trunc('minute', now()) - interval '1 minute';
  v_to timestamptz;
begin
  v_to := public.recordatorio_posponer('a0000000-0000-4000-8000-000000000102', v_fire, 60);
  if v_to is null then
    raise exception 'FALLO: no se pudo posponer';
  end if;
  if v_to < now() + interval '59 minutes' then
    raise exception 'FALLO: pospuesto a menos de una hora';
  end if;
  if public.recordatorio_fuera_de_noche(v_to, 'America/New_York') <> v_to then
    raise exception 'FALLO: pospuesto a la noche';
  end if;
  if (select snooze_until from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000102') <> v_to then
    raise exception 'FALLO: el recordatorio no guarda cuándo vuelve';
  end if;
  if exists (select 1 from public.notifications where related_entity_id = 'a0000000-0000-4000-8000-000000000102' and resolved_at is null) then
    raise exception 'FALLO: el aviso del disparo pospuesto sigue abierto';
  end if;
end $$;
reset role;

do $$
declare
  n integer;
begin
  -- Llega la hora de lo pospuesto.
  update public.core_reminders set snooze_until = date_trunc('minute', now()) - interval '2 minutes'
   where id = 'a0000000-0000-4000-8000-000000000102';
  n := public.recordatorios_tick();
  if n <> 1 then
    raise exception 'FALLO: lo pospuesto no volvió a sonar (%)', n;
  end if;
  if (select snooze_until from public.core_reminders where id = 'a0000000-0000-4000-8000-000000000102') is not null then
    raise exception 'FALLO: lo pospuesto se queda pospuesto';
  end if;
  if (select count(*) from public.notifications where related_entity_id = 'a0000000-0000-4000-8000-000000000102' and resolved_at is null) <> 1 then
    raise exception 'FALLO: lo pospuesto no dejó su aviso nuevo';
  end if;
end $$;

-- «Hecho» desde el teléfono cierra el disparo y su aviso.
set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true); end $$;
do $$
declare
  v_fire timestamptz := date_trunc('minute', now()) - interval '2 minutes';
begin
  if not public.recordatorio_hecho('a0000000-0000-4000-8000-000000000102', v_fire, 'PUSH') then
    raise exception 'FALLO: no se pudo dar por hecho';
  end if;
  if (select done_via from public.core_reminder_fires where reminder_id = 'a0000000-0000-4000-8000-000000000102' and fire_at = v_fire) <> 'PUSH' then
    raise exception 'FALLO: el disparo no quedó hecho desde el push';
  end if;
  if exists (select 1 from public.notifications where related_entity_id = 'a0000000-0000-4000-8000-000000000102' and resolved_at is null) then
    raise exception 'FALLO: el aviso sigue abierto tras «Hecho»';
  end if;
  if public.recordatorio_hecho('a0000000-0000-4000-8000-000000000102', v_fire, 'SMS') then
    raise exception 'FALLO: una vía que no existe';
  end if;
end $$;
reset role;

-- «Tu día» se creó al migrar para quien ya existía (aquí: nadie). Uno nuevo
-- no lo trae solo: lo comprueba que la migración no falle sin usuarios.

rollback;
