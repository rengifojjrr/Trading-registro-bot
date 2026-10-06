/*
  El segundo factor, también en la base.

  Hasta aquí el código de seis cifras sólo lo pedía la aplicación: el guardián
  de rutas y `requireUser` exigen una sesión `aal2` cuando la cuenta tiene un
  factor verificado. Pero la aplicación no es la única puerta. La dirección de
  Supabase y su clave publicable están en el JavaScript del navegador (para eso
  son públicas) y el repo es público: con la contraseña sola se saca un token
  `aal1` y se habla directamente con la API de la base (PostgREST, Storage,
  Realtime), sin pasar nunca por el guardián. Ahí el código no se pedía.

  Justo lo que el segundo factor tiene que frenar es una contraseña robada, y
  justo ahora suben los proyectos, las personas y lo que hace cada una.

  ## La regla, en la base

  `public.sesion_cumple_mfa()` dice si la sesión que pregunta puede ver datos:

  - si la cuenta no tiene ningún factor verificado, sí (como hasta hoy: nadie
    se queda fuera por no haberlo activado);
  - si lo tiene, sólo con el token en `aal2`.

  Es `security definer` porque `authenticated` no puede leer
  `auth.mfa_factors` (comprobado en la base real: `postgres` sí,
  `authenticated` no). Lee sólo la fila del que pregunta y devuelve un sí o un
  no; `search_path` vacío y todo con su esquema.

  Cada tabla de `public` con RLS gana una política **restrictiva** para
  `authenticated` que exige esa función. Restrictiva quiere decir que se suma
  con «y» a las que ya hay: no abre nada que estuviera cerrado, sólo cierra lo
  de una sesión `aal1` de una cuenta con factor. `(select …)` alrededor, para
  que se evalúe una vez por consulta y no una vez por fila.

  `storage.objects` igual: los tres cubos son privados (capturas, respaldos y
  adjuntos de la vida).

  `assign_trades_to_bot` es la única función `security definer` que
  `authenticated` puede llamar, y las RLS no la alcanzan (corre como dueña de
  la tabla). Se vuelve a escribir igual con la misma comprobación delante.

  Lo que no toca: `anon` (no tiene políticas que le abran nada), la clave de
  servicio (se salta las RLS: los crons y el simulador siguen igual) y los
  trabajos de `pg_cron` (corren como dueños de las tablas).

  ## Las que vengan

  El bucle de abajo cubre las tablas que existen hoy. Una tabla nueva tiene que
  traer su política; lo vigila `supabase/tests/segundo-factor.prueba.sql`, que
  falla si alguna tabla de `public` con RLS no la tiene.
*/

create or replace function public.sesion_cumple_mfa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1
          from auth.mfa_factors f
         where f.user_id = (select auth.uid())
           and f.status = 'verified'
      );
$$;

revoke all on function public.sesion_cumple_mfa() from public, anon;
grant execute on function public.sesion_cumple_mfa() to authenticated;

comment on function public.sesion_cumple_mfa() is
  'Sí si la cuenta del que pregunta no tiene factor verificado o si su token está en aal2. La usan las políticas restrictivas *_segundo_factor.';

-- ------------------------------------------- cada tabla de public con RLS

do $$
declare
  t record;
  nombre text;
begin
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relrowsecurity
     order by c.relname
  loop
    nombre := left(t.relname, 46) || '_segundo_factor';
    execute format('drop policy if exists %I on public.%I', nombre, t.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using ((select public.sesion_cumple_mfa())) with check ((select public.sesion_cumple_mfa()))',
      nombre, t.relname
    );
  end loop;
end $$;

-- ------------------------------------------------------------- Storage

drop policy if exists "storage_objects_segundo_factor" on storage.objects;
create policy "storage_objects_segundo_factor" on storage.objects
  as restrictive
  for all
  to authenticated
  using ((select public.sesion_cumple_mfa()))
  with check ((select public.sesion_cumple_mfa()));

-- ---------------------------------- la única función que se salta las RLS

create or replace function public.assign_trades_to_bot(p_trade_ids uuid[], p_bot_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if (select auth.uid()) is null then
    raise exception 'No autenticado';
  end if;

  if not (select public.sesion_cumple_mfa()) then
    raise exception 'Falta el código del segundo factor';
  end if;

  if p_bot_id is not null and not exists (
    select 1 from public.bots b where b.id = p_bot_id and b.user_id = (select auth.uid())
  ) then
    raise exception 'Ese bot no existe';
  end if;

  update public.trades t
     set bot_id = p_bot_id
   where t.id = any(p_trade_ids)
     and t.user_id = (select auth.uid());

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.assign_trades_to_bot(uuid[], uuid) from public, anon;
grant execute on function public.assign_trades_to_bot(uuid[], uuid) to authenticated;
