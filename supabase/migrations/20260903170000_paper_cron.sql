-- El reloj del simulador vive en la base de datos.
--
-- El ciclo del simulador estaba programado en GitHub Actions cada cinco
-- minutos, y GitHub lo ejecutó a las 12:30 y a las 16:39: cuatro horas entre
-- ciclos. No es un fallo suyo -- las tareas programadas son de mejor esfuerzo
-- y en horas de carga se retrasan cuanto haga falta --, pero para un bot de
-- velas de cinco minutos es no tener bot. Y aun cuando GitHub cumpliera,
-- necesitaba dos secretos configurados a mano en su interfaz que nunca se
-- configuraron: el paso del ciclo salió omitido en todas las ejecuciones.
--
-- Postgres tiene su propio programador, `pg_cron`, que corre dentro de la
-- base y no espera a ninguna cola ajena, y `pg_net` para llamar por HTTP al
-- despliegue. Con los dos, el reloj queda donde ya están los datos y no
-- depende de que nadie pegue secretos en otro sitio.
--
-- El secreto con el que el reloj se identifica ante la ruta se guarda AQUÍ,
-- en una tabla sin políticas: con RLS activado y ninguna política, ni el rol
-- anónimo ni el autenticado pueden leerla, y sólo llegan a ella el rol de
-- servicio (con el que la ruta lo comprueba) y el propio `postgres` (con el
-- que corre pg_cron). No va en una variable de entorno porque las variables
-- de entorno del despliegue no se pueden escribir desde aquí, y el objetivo
-- es que todo esto se levante sin tocar ninguna otra consola.
--
-- El trabajo de pg_cron en sí NO se crea en esta migración. Lleva la URL del
-- despliegue, que es de cada entorno y no del esquema; se crea aparte con
-- `cron.schedule(...)` y está documentado en docs/SIMULADOR.md.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.paper_cron_secret (
  /* Una sola fila, y la restricción lo garantiza: dos secretos serían dos
     formas de entrar y ninguna manera de saber cuál está en uso. */
  id integer primary key default 1,
  secret text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,

  constraint paper_cron_secret_una_fila check (id = 1),
  constraint paper_cron_secret_no_vacio check (length(secret) >= 32)
);

/* RLS activado y sin políticas a propósito: nadie que entre por PostgREST con
   el rol anónimo o el autenticado puede ver esta fila. Ver la cabecera. */
alter table public.paper_cron_secret enable row level security;

/* 32 bytes aleatorios en hexadecimal. `gen_random_bytes` es de pgcrypto, que
   ya está instalada. Si la fila existe no se toca: rotar el secreto es una
   decisión, no un efecto de volver a correr la migración. */
insert into public.paper_cron_secret (id, secret)
values (1, encode(gen_random_bytes(32), 'hex'))
on conflict (id) do nothing;

comment on table public.paper_cron_secret is
  'El secreto con el que el reloj de pg_cron se identifica ante /api/paper/tick. Una fila, sin políticas: sólo el rol de servicio y postgres la leen.';
