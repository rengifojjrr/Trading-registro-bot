/*
  Las RLS y las claves de los proyectos de verdad
  (20261006120000_proyectos_de_verdad.sql), contra un Postgres de verdad.

  Lo corre `scripts/probar-migraciones-local.sh` después de aplicar todas las
  migraciones. Dos usuarios inventados, A y B, y el anónimo. Todo dentro de una
  transacción que se deshace al final: no deja nada.

  Lo que se comprueba:
  1. Cada uno ve sólo lo suyo, en todas las tablas nuevas.
  2. Nadie puede colgar algo suyo de algo ajeno (claves compuestas), aunque
     conozca el id.
  3. El anónimo no ve ni escribe nada.
  4. La versión la sube la base; el disparador salta aunque la función esté
     cerrada a `authenticated`.
  5. La ficha guarda la versión anterior al cambiar de texto.
  6. Un enlace sólo puede ser http(s).
  7. Las tareas nuevas nacen 'A_MANO'; el campo admite nulo (las de antes).
  8. Una sola fila «Yo» por usuario y una sola ficha por proyecto.
*/

\set ON_ERROR_STOP 1
\set QUIET 1

begin;

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@prueba.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@prueba.test');

-- ------------------------------------------------------------------ A crea

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true); end $$;

insert into public.tasks_projects (id, user_id, name, slug, status, objective)
values ('a0000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Proyecto de prueba', 'proyecto-de-prueba', 'EN_MARCHA', 'Un objetivo inventado');

insert into public.core_people (id, user_id, name, is_owner) values
  ('a0000000-0000-4000-8000-0000000000b0', 'aaaaaaaa-0000-4000-8000-000000000001', 'Yo', true),
  ('a0000000-0000-4000-8000-0000000000b1', 'aaaaaaaa-0000-4000-8000-000000000001', 'Persona Inventada', false);

insert into public.tasks_project_members (user_id, project_id, person_id, role, does_md, side)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1',
        'a0000000-0000-4000-8000-0000000000b1', 'Socia', 'Los permisos', 'NOSOTROS');

insert into public.tasks_streams (id, user_id, project_id, name, lead_person_id)
values ('a0000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-0000000000a1', 'Permisos', 'a0000000-0000-4000-8000-0000000000b1');

insert into public.tasks_milestones (id, user_id, project_id, kind, title, starts_on, due_on) values
  ('a0000000-0000-4000-8000-0000000000d1', 'aaaaaaaa-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-0000000000a1', 'ETAPA', 'Etapa uno', '2026-10-01', '2026-10-31');
insert into public.tasks_milestones (id, user_id, project_id, kind, stage_id, title, due_on) values
  ('a0000000-0000-4000-8000-0000000000d2', 'aaaaaaaa-0000-4000-8000-000000000001',
   'a0000000-0000-4000-8000-0000000000a1', 'HITO', 'a0000000-0000-4000-8000-0000000000d1', 'Un hito', '2026-10-15');

insert into public.tasks_items (id, user_id, project_id, title, assignee_id, stream_id, milestone_id)
values ('a0000000-0000-4000-8000-0000000000e1', 'aaaaaaaa-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-0000000000a1', 'Una tarea inventada',
        'a0000000-0000-4000-8000-0000000000b1', 'a0000000-0000-4000-8000-0000000000c1',
        'a0000000-0000-4000-8000-0000000000d2');

insert into public.tasks_items (id, user_id, project_id, title, parent_id)
values ('a0000000-0000-4000-8000-0000000000e2', 'aaaaaaaa-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-0000000000a1', 'Una subtarea', 'a0000000-0000-4000-8000-0000000000e1');

insert into public.tasks_project_log (user_id, project_id, kind, title)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1', 'DECISION', 'Algo decidido');

insert into public.tasks_project_docs (id, user_id, project_id, kind, title, body_md, made_by)
values ('a0000000-0000-4000-8000-0000000000f1', 'aaaaaaaa-0000-4000-8000-000000000001',
        'a0000000-0000-4000-8000-0000000000a1', 'FICHA', 'Ficha técnica', 'Versión uno', 'CLAUDE');

insert into public.tasks_project_sources (user_id, project_id, kind, label, ref, lives)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1',
        'ENLACE', 'Un enlace', 'https://ejemplo.test/doc', 'NUBE');

do $$
begin
  -- 7. Las tareas nuevas nacen 'A_MANO'.
  if (select origin from public.tasks_items where id = 'a0000000-0000-4000-8000-0000000000e1') <> 'A_MANO' then
    raise exception 'FALLO: una tarea nueva no nace A_MANO';
  end if;

  -- 4. La versión la sube la base, aunque el cliente mande otra.
  update public.tasks_projects set objective = 'Otro objetivo', version = 99
   where id = 'a0000000-0000-4000-8000-0000000000a1';
  if (select version from public.tasks_projects where id = 'a0000000-0000-4000-8000-0000000000a1') <> 2 then
    raise exception 'FALLO: la versión del proyecto no subió a 2';
  end if;

  update public.tasks_items set title = 'Renombrada' where id = 'a0000000-0000-4000-8000-0000000000e1';
  if (select version from public.tasks_items where id = 'a0000000-0000-4000-8000-0000000000e1') <> 2 then
    raise exception 'FALLO: la versión de la tarea no subió';
  end if;

  -- 5. La ficha guarda la versión anterior.
  update public.tasks_project_docs set body_md = 'Versión dos', made_by = 'OWNER'
   where id = 'a0000000-0000-4000-8000-0000000000f1';
  if (select count(*) from public.tasks_project_doc_versions
       where doc_id = 'a0000000-0000-4000-8000-0000000000f1' and body_md = 'Versión uno' and version = 1) <> 1 then
    raise exception 'FALLO: la ficha no guardó la versión anterior';
  end if;

  -- Cambiar sólo el título no crea versión.
  update public.tasks_project_docs set title = 'Ficha' where id = 'a0000000-0000-4000-8000-0000000000f1';
  if (select count(*) from public.tasks_project_doc_versions where doc_id = 'a0000000-0000-4000-8000-0000000000f1') <> 1 then
    raise exception 'FALLO: cambiar el título creó una versión';
  end if;

  -- 6. Un enlace sólo es http(s).
  begin
    insert into public.tasks_project_sources (user_id, project_id, kind, label, ref, lives)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1',
            'ENLACE', 'Malo', 'javascript:alert(1)', 'NUBE');
    raise exception 'FALLO: se guardó un enlace javascript:';
  exception when check_violation then null;
  end;

  begin
    insert into public.tasks_project_sources (user_id, project_id, kind, label, lives)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1',
            'ENLACE', 'Sin dirección', 'NUBE');
    raise exception 'FALLO: se guardó un enlace sin dirección';
  exception when check_violation then null;
  end;

  -- 8. Una sola fila «Yo».
  begin
    insert into public.core_people (user_id, name, is_owner)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'Otro yo', true);
    raise exception 'FALLO: dos filas «Yo» para el mismo usuario';
  exception when unique_violation then null;
  end;

  -- 8. Una sola ficha por proyecto.
  begin
    insert into public.tasks_project_docs (user_id, project_id, kind, title, body_md, made_by)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000a1',
            'FICHA', 'Otra ficha', '…', 'OWNER');
    raise exception 'FALLO: dos fichas en el mismo proyecto';
  exception when unique_violation then null;
  end;

  -- Un hito no puede ser su propia etapa, y una etapa no cuelga de otra.
  begin
    update public.tasks_milestones set stage_id = 'a0000000-0000-4000-8000-0000000000d2'
     where id = 'a0000000-0000-4000-8000-0000000000d2';
    raise exception 'FALLO: un hito colgado de sí mismo';
  exception when check_violation then null;
  end;
end $$;

-- ------------------------------------------------- B no ve nada de A

do $$ begin perform set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-000000000002","role":"authenticated"}', true); end $$;

do $$
declare
  t text;
  n bigint;
begin
  -- 1. Nada de A a la vista, en ninguna tabla nueva ni en las que crecieron.
  foreach t in array array[
    'tasks_projects', 'tasks_items', 'core_people', 'tasks_project_members', 'tasks_streams',
    'tasks_milestones', 'tasks_project_log', 'tasks_project_docs', 'tasks_project_doc_versions',
    'tasks_project_sources'
  ] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then
      raise exception 'FALLO: B ve % fila(s) de A en %', n, t;
    end if;
  end loop;

  -- Cambiar o borrar lo de A no toca nada.
  update public.tasks_projects set objective = 'Pisado por B' where id = 'a0000000-0000-4000-8000-0000000000a1';
  delete from public.core_people where id = 'a0000000-0000-4000-8000-0000000000b1';

  -- B tampoco puede escribir filas a nombre de A.
  begin
    insert into public.core_people (user_id, name)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'Colada');
    raise exception 'FALLO: B escribió una persona a nombre de A';
  exception when insufficient_privilege then null;
  end;

  -- B crea lo suyo.
  insert into public.tasks_projects (id, user_id, name)
  values ('b0000000-0000-4000-8000-0000000000a1', 'bbbbbbbb-0000-4000-8000-000000000002', 'Proyecto de B');
  insert into public.core_people (id, user_id, name)
  values ('b0000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000002', 'Persona de B');

  -- 2. Y no puede colgarlo de lo de A aunque sepa los ids.
  begin
    insert into public.tasks_project_members (user_id, project_id, person_id)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1',
            'b0000000-0000-4000-8000-0000000000b1');
    raise exception 'FALLO: B metió a alguien en un proyecto de A';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.tasks_project_members (user_id, project_id, person_id)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-0000000000a1',
            'a0000000-0000-4000-8000-0000000000b1');
    raise exception 'FALLO: B metió en lo suyo a una persona de A';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.tasks_items (user_id, title, assignee_id)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'Tarea de B', 'a0000000-0000-4000-8000-0000000000b1');
    raise exception 'FALLO: B asignó una tarea a una persona de A';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.tasks_items (user_id, title, milestone_id)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'Tarea de B', 'a0000000-0000-4000-8000-0000000000d2');
    raise exception 'FALLO: B colgó una tarea de un hito de A';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.tasks_items (user_id, title, parent_id)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'Subtarea de B', 'a0000000-0000-4000-8000-0000000000e1');
    raise exception 'FALLO: B colgó una subtarea de una tarea de A';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.tasks_project_log (user_id, project_id, kind, title)
    values ('bbbbbbbb-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-0000000000a1', 'NOTA', 'Intruso');
    raise exception 'FALLO: B escribió en la bitácora de A';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.tasks_project_doc_versions (doc_id, user_id, version, body_md, made_by)
    values ('a0000000-0000-4000-8000-0000000000f1', 'bbbbbbbb-0000-4000-8000-000000000002', 50, 'x', 'OWNER');
    raise exception 'FALLO: B coló una versión en la ficha de A';
  exception when foreign_key_violation then null;
  end;
end $$;

-- --------------------------------------------- el anónimo, nada de nada

set local role anon;
do $$ begin perform set_config('request.jwt.claims', '{"role":"anon"}', true); end $$;

do $$
declare
  t text;
  n bigint;
begin
  -- 3. Ni una fila.
  foreach t in array array[
    'tasks_projects', 'tasks_items', 'core_people', 'tasks_project_members', 'tasks_streams',
    'tasks_milestones', 'tasks_project_log', 'tasks_project_docs', 'tasks_project_doc_versions',
    'tasks_project_sources'
  ] loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then
      raise exception 'FALLO: el anónimo ve % fila(s) en %', n, t;
    end if;
  end loop;

  begin
    insert into public.core_people (user_id, name) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Anónima');
    raise exception 'FALLO: el anónimo escribió una persona';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------- A sigue teniendo lo suyo intacto

set local role authenticated;
do $$ begin perform set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-000000000001","role":"authenticated"}', true); end $$;

do $$
begin
  if (select objective from public.tasks_projects where id = 'a0000000-0000-4000-8000-0000000000a1') <> 'Otro objetivo' then
    raise exception 'FALLO: B le cambió el objetivo a A';
  end if;
  if not exists (select 1 from public.core_people where id = 'a0000000-0000-4000-8000-0000000000b1') then
    raise exception 'FALLO: B le borró una persona a A';
  end if;
  if (select count(*) from public.tasks_projects) <> 1 then
    raise exception 'FALLO: A ve proyectos que no son suyos';
  end if;

  -- Borrar la persona deja la tarea sin asignar, no la borra.
  delete from public.core_people where id = 'a0000000-0000-4000-8000-0000000000b1';
  if (select assignee_id from public.tasks_items where id = 'a0000000-0000-4000-8000-0000000000e1') is not null then
    raise exception 'FALLO: borrar la persona no dejó la tarea sin asignar';
  end if;
  if (select lead_person_id from public.tasks_streams where id = 'a0000000-0000-4000-8000-0000000000c1') is not null then
    raise exception 'FALLO: borrar la persona no dejó el frente sin responsable';
  end if;
  if (select count(*) from public.tasks_project_members) <> 0 then
    raise exception 'FALLO: borrar la persona no la sacó del proyecto';
  end if;

  -- Borrar el hito deja la tarea sin hito; borrar la tarea madre suelta la
  -- subtarea (la papelera no archiva hijas: una cascada las perdería).
  delete from public.tasks_milestones where id = 'a0000000-0000-4000-8000-0000000000d2';
  if (select milestone_id from public.tasks_items where id = 'a0000000-0000-4000-8000-0000000000e1') is not null then
    raise exception 'FALLO: borrar el hito no soltó la tarea';
  end if;
  delete from public.tasks_items where id = 'a0000000-0000-4000-8000-0000000000e1';
  if not exists (select 1 from public.tasks_items where id = 'a0000000-0000-4000-8000-0000000000e2' and parent_id is null) then
    raise exception 'FALLO: la subtarea se perdió con su tarea en vez de quedarse suelta';
  end if;
end $$;

rollback;
