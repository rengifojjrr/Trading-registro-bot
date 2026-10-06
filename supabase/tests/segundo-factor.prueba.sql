/*
  El segundo factor en la base (20261006130000_el_segundo_factor_tambien_en_la_base.sql),
  contra un Postgres de verdad.

  Lo corre `scripts/probar-migraciones-local.sh` después de aplicar todas las
  migraciones. Un usuario inventado, A. Todo dentro de una transacción que se
  deshace al final.

  Lo que se comprueba:
  1. Toda tabla de `public` con RLS (y `storage.objects`) tiene la política
     restrictiva del segundo factor, para `authenticated` y para todo. Una tabla
     nueva sin ella hace fallar esta prueba.
  2. Sin factor, una sesión `aal1` ve y escribe lo suyo como siempre.
  3. Un factor a medio inscribir no cuenta.
  4. Con un factor verificado, una sesión `aal1` no ve ni escribe nada (tablas,
     Storage y la función que se salta las RLS); en `aal2`, todo vuelve.
  5. El anónimo no puede llamar a la función.
*/

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

-- ------------------------------------------- 1. todas las tablas la tienen

do $$
declare
  faltan text;
begin
  select string_agg(c.relname, ', ' order by c.relname) into faltan
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p')
     and c.relrowsecurity
     and not exists (
       select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.permissive = 'RESTRICTIVE'
          and p.cmd = 'ALL'
          and p.roles @> array['authenticated']::name[]
          and p.qual like '%sesion_cumple_mfa%'
          and p.with_check like '%sesion_cumple_mfa%'
     );
  if faltan is not null then
    raise exception 'FALLO: tablas con RLS sin la política del segundo factor: %', faltan;
  end if;

  if not exists (
    select 1 from pg_policies p
     where p.schemaname = 'storage' and p.tablename = 'objects'
       and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL'
       and p.qual like '%sesion_cumple_mfa%'
  ) then
    raise exception 'FALLO: storage.objects sin la política del segundo factor';
  end if;

  -- Que haya algo que vigilar: si el filtro de arriba dejara de encontrar
  -- tablas, la comprobación pasaría sobre una lista vacía.
  if (select count(*) from pg_policies where policyname like '%\_segundo\_factor') < 50 then
    raise exception 'FALLO: hay menos políticas del segundo factor de las que debería';
  end if;

  if has_function_privilege('anon', 'public.sesion_cumple_mfa()', 'execute') then
    raise exception 'FALLO: el anónimo puede llamar a sesion_cumple_mfa()';
  end if;
  if not has_function_privilege('authenticated', 'public.sesion_cumple_mfa()', 'execute') then
    raise exception 'FALLO: authenticated no puede evaluar la política';
  end if;
end $$;

-- ------------------------------------------------------------- datos de A

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-0000000000f2', 'a2@prueba.test');

insert into public.tasks_projects (id, user_id, name)
values ('a0000000-0000-4000-8000-0000000002a1', 'aaaaaaaa-0000-4000-8000-0000000000f2', 'Proyecto con factor');
insert into public.core_people (id, user_id, name)
values ('a0000000-0000-4000-8000-0000000002b1', 'aaaaaaaa-0000-4000-8000-0000000000f2', 'Persona Inventada');

insert into storage.objects (bucket_id, name)
values ('vida-adjuntos', 'aaaaaaaa-0000-4000-8000-0000000000f2/nota.pdf');
-- En Supabase `authenticated` puede leer la tabla (las RLS deciden qué filas);
-- en el Storage de cartón hay que dárselo. Se deshace con el resto.
grant select, insert on storage.objects to authenticated;

-- ------------------------------------------ 2. sin factor, todo como hoy

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f2","role":"authenticated","aal":"aal1"}', true); end $$;

do $$
begin
  if (select count(*) from public.tasks_projects) <> 1 then
    raise exception 'FALLO: sin factor, A no ve su proyecto';
  end if;
  if (select count(*) from storage.objects) <> 1 then
    raise exception 'FALLO: sin factor, A no ve su adjunto';
  end if;
  insert into public.tasks_project_log (user_id, project_id, kind, title)
  values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'a0000000-0000-4000-8000-0000000002a1', 'NOTA', 'Sin factor');
  if (select public.assign_trades_to_bot('{}'::uuid[], null)) <> 0 then
    raise exception 'FALLO: sin factor, asignar operaciones no responde';
  end if;
end $$;

-- ------------------------------------- 3. un factor sin verificar no cuenta

reset role;
insert into auth.mfa_factors (user_id, friendly_name, status)
values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'A medias', 'unverified');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f2","role":"authenticated","aal":"aal1"}', true); end $$;

do $$
begin
  if (select count(*) from public.tasks_projects) <> 1 then
    raise exception 'FALLO: un factor sin verificar ya pide el código';
  end if;
end $$;

-- ----------------------------- 4. con factor verificado, aal1 no ve nada

reset role;
insert into auth.mfa_factors (user_id, friendly_name, status)
values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'Teléfono', 'verified');

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f2","role":"authenticated","aal":"aal1"}', true); end $$;

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['tasks_projects', 'core_people', 'tasks_project_log'] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then
      raise exception 'FALLO: con factor y aal1, A ve % fila(s) de %', n, t;
    end if;
  end loop;

  if (select count(*) from storage.objects) <> 0 then
    raise exception 'FALLO: con factor y aal1, A ve sus adjuntos';
  end if;

  begin
    insert into public.core_people (user_id, name)
    values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'Colada sin código');
    raise exception 'FALLO: con factor y aal1, A escribió una persona';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into storage.objects (bucket_id, name)
    values ('vida-adjuntos', 'aaaaaaaa-0000-4000-8000-0000000000f2/otra.pdf');
    raise exception 'FALLO: con factor y aal1, A subió un adjunto';
  exception when insufficient_privilege then null;
  end;

  update public.tasks_projects set name = 'Pisado sin código'
   where id = 'a0000000-0000-4000-8000-0000000002a1';
  delete from public.core_people where id = 'a0000000-0000-4000-8000-0000000002b1';

  begin
    perform public.assign_trades_to_bot('{}'::uuid[], null);
    raise exception 'FALLO: con factor y aal1, A pudo asignar operaciones';
  exception when raise_exception then
    if sqlerrm not like '%segundo factor%' then
      raise;
    end if;
  end;
end $$;

-- Un token sin el campo `aal` cuenta como aal1.
do $$ begin perform set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f2","role":"authenticated"}', true); end $$;

do $$
begin
  if (select count(*) from public.tasks_projects) <> 0 then
    raise exception 'FALLO: un token sin aal deja ver con factor';
  end if;
end $$;

-- ------------------------------------------------------ 4. y en aal2, todo

do $$ begin perform set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-0000-4000-8000-0000000000f2","role":"authenticated","aal":"aal2"}', true); end $$;

do $$
begin
  if (select count(*) from public.tasks_projects) <> 1 then
    raise exception 'FALLO: en aal2, A no ve su proyecto';
  end if;
  if (select name from public.tasks_projects) <> 'Proyecto con factor' then
    raise exception 'FALLO: la sesión aal1 le cambió el nombre al proyecto';
  end if;
  if (select count(*) from public.core_people) <> 1 then
    raise exception 'FALLO: la sesión aal1 borró una persona';
  end if;
  if (select count(*) from public.tasks_project_log) <> 1 then
    raise exception 'FALLO: en aal2, A no ve su bitácora';
  end if;
  if (select count(*) from storage.objects) <> 1 then
    raise exception 'FALLO: en aal2, A no ve su adjunto';
  end if;
  insert into public.core_people (user_id, name)
  values ('aaaaaaaa-0000-4000-8000-0000000000f2', 'Con código');
  if (select public.assign_trades_to_bot('{}'::uuid[], null)) <> 0 then
    raise exception 'FALLO: en aal2, asignar operaciones no responde';
  end if;
end $$;

-- -------------------------------- 5. el anónimo no evalúa nada de esto

set local role anon;
do $$ begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;

do $$
begin
  begin
    perform public.sesion_cumple_mfa();
    raise exception 'FALLO: el anónimo llamó a sesion_cumple_mfa()';
  exception when insufficient_privilege then null;
  end;
end $$;

rollback;
