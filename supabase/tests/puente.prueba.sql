/*
  El puente con el bot (20261006200000_el_puente_con_el_bot.sql), contra un
  Postgres de verdad.

  Lo corre `scripts/probar-migraciones-local.sh` después de aplicar todas las
  migraciones. Dos usuarios inventados, A y B, el anónimo y el rol de servicio.
  Todo dentro de una transacción que se deshace al final.

  Lo que se comprueba:
  1. Las tablas del puente no se ven ni con la sesión del dueño ni sin sesión
     (dos cerraduras): llaves, nonces, operaciones y feed. El latido sí lo lee
     su dueño, y sólo leerlo.
  2. El feed lo llenan los disparadores: crear, cambiar (con la versión nueva)
     y borrar una tarea o un proyecto; nunca el contenido.
  3. `por` sólo lo pone el rol de servicio con la cabecera del puente: una
     sesión normal no se hace pasar por el bot.
  4. Un nonce vale una vez, y sólo lo gasta el rol de servicio.
  5. Las propuestas: cada uno las suyas, y no se cuelgan de un proyecto ajeno.
  6. Vigilar las tablas otra vez no duplica disparadores; resembrar apunta
     cada fila que hay.
  7. Los recordatorios (que llegan después): su disparador del feed está
     puesto, y «hecho» / «en 1 h» desde WhatsApp (las gemelas del rol de
     servicio) cierran o posponen el disparo y el recordatorio, sólo los
     suyos y sólo con el rol de servicio.
*/

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000e4', 'a-puente@prueba.test'),
  ('bbbbbbbb-0000-4000-8000-0000000000e4', 'b-puente@prueba.test');

-- ------------------------------------------- 1. dos cerraduras y el latido

do $$
declare
  t text;
begin
  foreach t in array array['puente_llaves', 'puente_nonces', 'puente_ops', 'puente_cambios'] loop
    if has_table_privilege('authenticated', 'public.' || t, 'select') then
      raise exception 'FALLO: authenticated puede leer %', t;
    end if;
    if has_table_privilege('anon', 'public.' || t, 'select') then
      raise exception 'FALLO: anon puede leer %', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'insert') then
      raise exception 'FALLO: authenticated puede escribir en %', t;
    end if;
  end loop;
  if not has_table_privilege('authenticated', 'public.puente_clientes', 'select') then
    raise exception 'FALLO: el dueño no puede leer su latido';
  end if;
  if has_table_privilege('authenticated', 'public.puente_clientes', 'insert')
     or has_table_privilege('authenticated', 'public.puente_clientes', 'update') then
    raise exception 'FALLO: el dueño puede escribir el latido (sólo lo escribe el puente)';
  end if;
  if has_table_privilege('anon', 'public.puente_clientes', 'select') then
    raise exception 'FALLO: anon puede leer el latido';
  end if;
  if has_function_privilege('authenticated', 'public.puente_usar_nonce(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.puente_usar_nonce(uuid, text)', 'execute') then
    raise exception 'FALLO: puente_usar_nonce abierta fuera del rol de servicio';
  end if;
  if not has_function_privilege('service_role', 'public.puente_usar_nonce(uuid, text)', 'execute') then
    raise exception 'FALLO: el rol de servicio no puede gastar nonces';
  end if;
  if has_function_privilege('authenticated', 'public.puente_vigilar_tablas(boolean)', 'execute') then
    raise exception 'FALLO: puente_vigilar_tablas abierta a authenticated';
  end if;
end $$;

-- Los latidos los escribe el puente (como postgres aquí).
insert into public.puente_clientes (user_id, cliente, visto_en, wa_conectado) values
  ('aaaaaaaa-0000-4000-8000-0000000000e4', 'mac-1', now(), true),
  ('bbbbbbbb-0000-4000-8000-0000000000e4', 'mac-1', now(), false);

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e4","role":"authenticated"}', true); end $$;

do $$
begin
  if (select count(*) from public.puente_clientes) <> 1 then
    raise exception 'FALLO: A ve latidos que no son suyos';
  end if;
  if not (select wa_conectado from public.puente_clientes) then
    raise exception 'FALLO: A no ve el suyo';
  end if;
end $$;

-- ---------------------------------------------- 2. el feed lo llenan ellos

insert into public.tasks_projects (id, user_id, name, slug)
values ('a0000000-0000-4000-8000-0000000e4001', 'aaaaaaaa-0000-4000-8000-0000000000e4', 'Proyecto del puente', 'proyecto-del-puente');
insert into public.tasks_items (id, user_id, project_id, title)
values ('a0000000-0000-4000-8000-0000000e4002', 'aaaaaaaa-0000-4000-8000-0000000000e4',
        'a0000000-0000-4000-8000-0000000e4001', 'Una tarea inventada');
update public.tasks_items set title = 'Una tarea inventada, cambiada'
 where id = 'a0000000-0000-4000-8000-0000000e4002';
delete from public.tasks_items where id = 'a0000000-0000-4000-8000-0000000e4002';

-- El dueño tampoco puede leer el feed directamente.
do $$
begin
  begin
    perform count(*) from public.puente_cambios;
    raise exception 'FALLO: authenticated leyó puente_cambios';
  exception
    when insufficient_privilege then null;
  end;
end $$;

reset role;

do $$
declare
  ops text;
  versiones text;
  por_alguno int;
begin
  select string_agg(op, ',' order by seq), string_agg(coalesce(version::text, '-'), ',' order by seq)
    into ops, versiones
    from public.puente_cambios
   where entidad = 'tarea' and entidad_id = 'a0000000-0000-4000-8000-0000000e4002';
  if ops is distinct from 'upsert,upsert,delete' then
    raise exception 'FALLO: el feed de la tarea es %, no upsert,upsert,delete', ops;
  end if;
  if versiones is distinct from '1,2,-' then
    raise exception 'FALLO: las versiones del feed son %, no 1,2,-', versiones;
  end if;
  if not exists (select 1 from public.puente_cambios
                  where entidad = 'proyecto' and entidad_id = 'a0000000-0000-4000-8000-0000000e4001'
                    and user_id = 'aaaaaaaa-0000-4000-8000-0000000000e4') then
    raise exception 'FALLO: crear un proyecto no llegó al feed';
  end if;
  select count(*) into por_alguno from public.puente_cambios
   where user_id = 'aaaaaaaa-0000-4000-8000-0000000000e4' and por is not null;
  if por_alguno <> 0 then
    raise exception 'FALLO: cambios de la aplicación marcados como del puente';
  end if;
end $$;

-- ------------------------------ 3. `por`: sólo el rol de servicio con cabecera

-- Una sesión normal que manda la cabecera no se hace pasar por el bot.
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e4","role":"authenticated"}', true);
  perform set_config('request.headers', '{"x-puente-cliente":"mac-1"}', true);
end $$;
insert into public.tasks_items (id, user_id, title)
values ('a0000000-0000-4000-8000-0000000e4003', 'aaaaaaaa-0000-4000-8000-0000000000e4', 'Fingida');
reset role;

set local role service_role;
do $$ begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  perform set_config('request.headers', '{"x-puente-cliente":"mac-1"}', true);
end $$;
insert into public.tasks_items (id, user_id, title)
values ('a0000000-0000-4000-8000-0000000e4004', 'aaaaaaaa-0000-4000-8000-0000000000e4', 'Del bot');
do $$ begin
  perform set_config('request.headers', '{"x-puente-cliente":"otro-cliente"}', true);
end $$;
insert into public.tasks_items (id, user_id, title)
values ('a0000000-0000-4000-8000-0000000e4005', 'aaaaaaaa-0000-4000-8000-0000000000e4', 'Cliente inventado');
reset role;

do $$
begin
  if (select por from public.puente_cambios where entidad_id = 'a0000000-0000-4000-8000-0000000e4003') is not null then
    raise exception 'FALLO: una sesión normal se hizo pasar por el bot';
  end if;
  if (select por from public.puente_cambios where entidad_id = 'a0000000-0000-4000-8000-0000000e4004') is distinct from 'mac-1' then
    raise exception 'FALLO: el cambio del puente no quedó a su nombre';
  end if;
  if (select por from public.puente_cambios where entidad_id = 'a0000000-0000-4000-8000-0000000e4005') is not null then
    raise exception 'FALLO: un cliente que no existe quedó apuntado';
  end if;
end $$;

-- ----------------------------------------------------- 4. un nonce, una vez

insert into public.puente_llaves (id, user_id, cliente, sal, huella)
values ('a0000000-0000-4000-8000-0000000e4010', 'aaaaaaaa-0000-4000-8000-0000000000e4', 'mac-1',
        repeat('ab', 24), repeat('0', 64));

set local role service_role;
do $$
begin
  if not public.puente_usar_nonce('a0000000-0000-4000-8000-0000000e4010', 'nonce-de-prueba-0001') then
    raise exception 'FALLO: un nonce nuevo no valió';
  end if;
  if public.puente_usar_nonce('a0000000-0000-4000-8000-0000000e4010', 'nonce-de-prueba-0001') then
    raise exception 'FALLO: un nonce repetido valió';
  end if;
  if not public.puente_usar_nonce('a0000000-0000-4000-8000-0000000e4010', 'nonce-de-prueba-0002') then
    raise exception 'FALLO: otro nonce no valió';
  end if;
end $$;
reset role;

-- Los de hace más de 15 minutos se olvidan al gastar otro.
update public.puente_nonces set visto_en = now() - interval '20 minutes' where nonce = 'nonce-de-prueba-0001';
set local role service_role;
do $$
begin
  perform public.puente_usar_nonce('a0000000-0000-4000-8000-0000000e4010', 'nonce-de-prueba-0003');
end $$;
reset role;
do $$
begin
  if exists (select 1 from public.puente_nonces where nonce = 'nonce-de-prueba-0001') then
    raise exception 'FALLO: un nonce viejo no se olvidó';
  end if;
end $$;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e4","role":"authenticated"}', true); end $$;
do $$
begin
  begin
    perform public.puente_usar_nonce('a0000000-0000-4000-8000-0000000e4010', 'nonce-de-prueba-0099');
    raise exception 'FALLO: authenticated gastó un nonce';
  exception
    when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ------------------------------------------------------ 5. las propuestas

insert into public.tasks_projects (id, user_id, name)
values ('b0000000-0000-4000-8000-0000000e4001', 'bbbbbbbb-0000-4000-8000-0000000000e4', 'Proyecto de B');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e4","role":"authenticated"}', true); end $$;

insert into public.core_inbox (id, user_id, kind, project_id, title, confidence)
values ('a0000000-0000-4000-8000-0000000e4020', 'aaaaaaaa-0000-4000-8000-0000000000e4', 'TAREA',
        'a0000000-0000-4000-8000-0000000e4001', 'Mandar los papeles', 'FIRME');

do $$
begin
  begin
    insert into public.core_inbox (user_id, kind, project_id, title)
    values ('aaaaaaaa-0000-4000-8000-0000000000e4', 'TAREA', 'b0000000-0000-4000-8000-0000000e4001', 'Colgada de B');
    raise exception 'FALLO: una propuesta de A colgó de un proyecto de B';
  exception
    when foreign_key_violation then null;
  end;
  begin
    insert into public.core_inbox (user_id, kind, title, status)
    values ('aaaaaaaa-0000-4000-8000-0000000000e4', 'TAREA', 'Aceptada sin fecha', 'ACEPTADA');
    raise exception 'FALLO: una propuesta aceptada sin fecha de decisión';
  exception
    when check_violation then null;
  end;
end $$;

update public.core_inbox set status = 'ACEPTADA', decided_at = now(), decided_via = 'WEB'
 where id = 'a0000000-0000-4000-8000-0000000e4020';

do $$
begin
  if (select version from public.core_inbox where id = 'a0000000-0000-4000-8000-0000000e4020') <> 2 then
    raise exception 'FALLO: la versión de la propuesta no subió';
  end if;
end $$;

do $$ begin perform set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-0000000000e4","role":"authenticated"}', true); end $$;
do $$
begin
  if (select count(*) from public.core_inbox) <> 0 then
    raise exception 'FALLO: B ve propuestas de A';
  end if;
end $$;
reset role;

set local role anon;
do $$ begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;
do $$
begin
  if (select count(*) from public.core_inbox) <> 0 then
    raise exception 'FALLO: el anónimo ve propuestas';
  end if;
end $$;
reset role;

do $$
begin
  if not exists (select 1 from public.puente_cambios where entidad = 'propuesta'
                  and entidad_id = 'a0000000-0000-4000-8000-0000000e4020') then
    raise exception 'FALLO: las propuestas no llegan al feed';
  end if;
end $$;

-- ---------------------------------------------- 6. vigilar otra vez y resembrar

do $$
declare
  antes int;
  despues int;
  disparadores int;
  filas int;
begin
  if public.puente_vigilar_tablas() <> 0 then
    raise exception 'FALLO: vigilar otra vez volvió a poner disparadores';
  end if;
  select count(*) into disparadores from pg_trigger where tgname = 'tasks_items_puente';
  if disparadores <> 1 then
    raise exception 'FALLO: % disparadores del feed en tasks_items', disparadores;
  end if;
  select count(*) into antes from public.puente_cambios;
  perform public.puente_vigilar_tablas(true);
  select count(*) into despues from public.puente_cambios;
  select (select count(*) from public.tasks_projects) + (select count(*) from public.tasks_items)
       + (select count(*) from public.core_people) + (select count(*) from public.tasks_project_members)
       + (select count(*) from public.tasks_streams) + (select count(*) from public.tasks_milestones)
       + (select count(*) from public.tasks_project_log) + (select count(*) from public.tasks_project_docs)
       + (select count(*) from public.tasks_project_sources) + (select count(*) from public.core_inbox)
       + (select count(*) from public.core_reminders)
    into filas;
  if despues - antes <> filas then
    raise exception 'FALLO: resembrar apuntó % filas y hay %', despues - antes, filas;
  end if;
end $$;

-- ------------------------------------------------ 7. los recordatorios y el puente

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'core_reminders_puente'
                  and tgrelid = 'public.core_reminders'::regclass) then
    raise exception 'FALLO: core_reminders no tiene el disparador del feed';
  end if;
  if not has_function_privilege('service_role', 'public.recordatorio_hecho_puente(uuid, uuid, timestamptz)', 'execute')
     or not has_function_privilege('service_role', 'public.recordatorio_posponer_puente(uuid, uuid, timestamptz, timestamptz)', 'execute') then
    raise exception 'FALLO: el rol de servicio no puede dar por hecho ni posponer';
  end if;
  if has_function_privilege('authenticated', 'public.recordatorio_hecho_puente(uuid, uuid, timestamptz)', 'execute')
     or has_function_privilege('anon', 'public.recordatorio_posponer_puente(uuid, uuid, timestamptz, timestamptz)', 'execute') then
    raise exception 'FALLO: una sesión puede usar las gemelas del puente';
  end if;
end $$;

insert into public.core_reminders (id, user_id, text, freq, at_time, tz, quiet)
values ('a0000000-0000-4000-8000-0000000e4030', 'aaaaaaaa-0000-4000-8000-0000000000e4',
        'Revisar algo inventado', 'DIARIO', '08:00', 'America/New_York', false);

do $$
begin
  if not exists (select 1 from public.puente_cambios where entidad = 'recordatorio'
                  and entidad_id = 'a0000000-0000-4000-8000-0000000e4030') then
    raise exception 'FALLO: los recordatorios no llegan al feed';
  end if;
end $$;

set local role service_role;
do $$
declare
  v_to timestamptz;
  disparo constant timestamptz := date_trunc('minute', now());
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  -- De otro: no existe.
  if public.recordatorio_posponer_puente('bbbbbbbb-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000e4030', disparo, now() + interval '1 hour') is not null
     or public.recordatorio_hecho_puente('bbbbbbbb-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000e4030', disparo) then
    raise exception 'FALLO: el puente tocó el recordatorio de otro';
  end if;
  -- «en 1 h»: vuelve a sonar a esa hora (lo que mira el reloj).
  v_to := public.recordatorio_posponer_puente('aaaaaaaa-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000e4030', disparo, now() + interval '1 hour');
  if v_to is null or (select snooze_until from public.core_reminders where id = 'a0000000-0000-4000-8000-0000000e4030') is distinct from v_to then
    raise exception 'FALLO: posponer desde WhatsApp no deja el recordatorio para esa hora';
  end if;
  -- Una hora pasada no suena «antes»: como pronto, dentro de un minuto.
  if public.recordatorio_posponer_puente('aaaaaaaa-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000e4030', disparo, now() - interval '1 day') < now() then
    raise exception 'FALLO: posponer a una hora pasada';
  end if;
  -- «hecho»: cierra el disparo y ya no vuelve a sonar por ese aplazamiento.
  if not public.recordatorio_hecho_puente('aaaaaaaa-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000e4030', disparo) then
    raise exception 'FALLO: hecho desde WhatsApp no se aplicó';
  end if;
  if (select done_via from public.core_reminder_fires where reminder_id = 'a0000000-0000-4000-8000-0000000e4030' and fire_at = disparo) <> 'WHATSAPP'
     or (select snooze_until from public.core_reminders where id = 'a0000000-0000-4000-8000-0000000e4030') is not null then
    raise exception 'FALLO: hecho desde WhatsApp no cerró el disparo ni el aplazamiento';
  end if;
end $$;
reset role;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-0000000000e4","role":"authenticated"}', true); end $$;
do $$
begin
  begin
    perform public.recordatorio_hecho_puente('aaaaaaaa-0000-4000-8000-0000000000e4', 'a0000000-0000-4000-8000-0000000e4030', now());
    raise exception 'FALLO: una sesión normal usó la gemela del puente';
  exception
    when insufficient_privilege then null;
  end;
end $$;
reset role;

rollback;
