-- Los navegadores suscritos a recibir avisos.
--
-- Una fila por dispositivo, no por persona: el mismo usuario tiene el teléfono
-- y el portátil, y un aviso tiene que llegar a los dos.
--
-- El `endpoint` es la clave natural --lo genera el servicio de push del
-- navegador y es único--, así que es también la primaria: sin eso, volver a
-- dar permiso en el mismo teléfono crearía una fila más y cada aviso se
-- mandaría dos veces al mismo sitio.
--
-- `p256dh` y `auth` son las claves que haría falta para cifrar el cuerpo del
-- aviso. Aquí se mandan avisos **sin** cuerpo --el service worker pide el
-- contenido al despertar, y así enseña lo que hay ahora y no lo que había
-- cuando se mandó--, pero se guardan igualmente: son parte de la suscripción,
-- el navegador las da juntas, y tirarlas obligaría a volver a pedir permiso el
-- día que se quiera mandar contenido.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own"
  on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table public.push_subscriptions is
  'Un navegador suscrito a avisos. Clave por endpoint para no duplicar envíos al mismo dispositivo.';
