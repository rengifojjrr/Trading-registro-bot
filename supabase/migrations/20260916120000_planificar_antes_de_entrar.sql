-- Planificar una operación **antes** de abrirla.
--
-- Todo lo que el diario sabe hoy se escribe después de cerrar, y eso deja
-- fuera justo la mitad que decide si operas bien: lo que pensabas *antes* de
-- entrar. Preguntarlo al cerrar no vale, porque para entonces ya sabes cómo
-- acabó y la memoria reescribe el plan para que encaje con el resultado. Un
-- plan sólo significa algo si existe antes de que haya resultado.
--
-- De ahí que sea una tabla aparte y no más columnas del diario:
--
-- 1. **Existe sin operación.** Se planifica y puede que no se entre nunca, y
--    eso también es un dato -- de hecho es de los buenos: los planes que no
--    ejecutaste y habrían salido bien, y los que te saltaste.
-- 2. **Se escribe en otro momento.** El diario se escribe al cerrar; esto, al
--    mirar el gráfico antes de abrir.
-- 3. **La une una persona, no una regla.** Que una operación sea la que
--    planificaste no se puede deducir del producto y la hora: puedes planear
--    un largo y acabar entrando corto, o entrar dos veces. Lo contesta quien
--    operó, en la encuesta del cierre.

create table if not exists public.trade_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- El plan. Todo opcional a propósito: se contesta pregunta a pregunta y
  -- abandonarlo a medias tiene que dejar guardado lo que ya dijiste.
  product_id text,
  direction text check (direction in ('LONG', 'SHORT')),
  /** Qué has visto. La razón para entrar, en tus palabras. */
  idea text,
  entry_price numeric,
  stop_price numeric,
  target_price numeric,
  risk_amount numeric,
  /** Cómo llegas, con el vocabulario de siempre (separado por comas). */
  emotional_state text,
  /** La foto del gráfico, en el bucket `trade-screenshots`. */
  screenshot_path text,

  -- Cuándo dejó de estar esperando porque tú lo descartaste. Descartar no lo
  -- borra: un plan que decidiste no ejecutar es historia, y borrarla dejaría
  -- las cuentas de «cuántos planes cumplo» mintiendo por arriba.
  discarded_at timestamptz
);

alter table public.trade_plans enable row level security;

create policy "trade_plans_all_own" on public.trade_plans
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create index if not exists trade_plans_user_idx on public.trade_plans (user_id, created_at desc);

comment on table public.trade_plans is
  'Lo que pensabas antes de entrar. Existe sin operación: planificar y no entrar también es un dato.';
comment on column public.trade_plans.discarded_at is
  'Cuándo lo descartaste tú. No se borra: un plan no ejecutado es historia.';

-- El enlace vive en el diario y no en el plan, y sólo aquí.
--
-- Podría estar en los dos lados -- `trade_plans.matched_trade_id` y esto --,
-- y sería una copia de la misma verdad en dos sitios que tarde o temprano
-- discrepan. Está en el diario porque es donde vive todo lo que una persona
-- contesta sobre una operación.
--
-- `plan_followed` distingue las tres respuestas, que son tres y no dos:
--   null  -- todavía no se ha preguntado
--   true  -- sí, esta operación es la que estaba planificada
--   false -- no, ésta es otra (y el plan sigue esperando)
--
-- Guardar también el `plan_id` cuando la respuesta es «no» es lo que impide
-- volver a preguntar por el mismo plan en la misma operación. Sin eso, la
-- encuesta preguntaría lo mismo cada vez que se reabre.
alter table public.journal_entries
  add column if not exists plan_id uuid references public.trade_plans (id) on delete set null;

alter table public.journal_entries
  add column if not exists plan_followed boolean;

create index if not exists journal_entries_plan_idx on public.journal_entries (plan_id);

comment on column public.journal_entries.plan_id is
  'El plan que se ofreció para esta operación, se confirmara o no.';
comment on column public.journal_entries.plan_followed is
  'Si esta operación es la que ese plan planificaba. Null = todavía no se ha preguntado.';
