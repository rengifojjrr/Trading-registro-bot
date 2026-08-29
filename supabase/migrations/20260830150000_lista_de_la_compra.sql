-- La lista de la compra deja de ser de sólo lectura.
--
-- Dos tablas y no una columna en cada sitio, porque son dos cosas distintas:
--
-- `shopping_extras` es lo que **no** viene de ninguna comida --papel, café,
-- jabón--. Sin esto, para la mitad de la compra hacía falta llevar además otra
-- lista, y dos listas es lo mismo que ninguna.
--
-- `shopping_checked` es lo que ya está en el carro. Se guarda en el servidor y
-- no sólo en el navegador porque el caso normal es mirarlo en el móvil dentro
-- de la tienda después de haberlo planificado en el ordenador.
--
-- La clave de lo marcado es el **nombre normalizado**, no un identificador de
-- fila: la lista se recalcula de las comidas planificadas cada vez que se
-- abre, así que las filas no sobreviven de una carga a la siguiente y el
-- nombre sí. Es también lo que hace que marcar «tomates» siga marcado si
-- mañana la comida que los pedía cambia de cantidad.

create table if not exists public.shopping_extras (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity numeric,
  unit text,
  created_at timestamptz not null default now(),

  constraint shopping_extras_name_not_blank check (length(trim(name)) > 0)
);

create index if not exists shopping_extras_user_idx on public.shopping_extras (user_id);

create table if not exists public.shopping_checked (
  user_id uuid not null references auth.users(id) on delete cascade,
  /* El nombre ya normalizado: sin acentos, sin mayúsculas, sin plural. */
  item_key text not null,
  checked_at timestamptz not null default now(),

  primary key (user_id, item_key)
);

alter table public.shopping_extras enable row level security;
alter table public.shopping_checked enable row level security;

drop policy if exists "shopping_extras_own" on public.shopping_extras;
create policy "shopping_extras_own" on public.shopping_extras
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shopping_checked_own" on public.shopping_checked;
create policy "shopping_checked_own" on public.shopping_checked
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on table public.shopping_extras is
  'Lo que hay que comprar y no viene de ninguna comida planificada.';
comment on column public.shopping_checked.item_key is
  'Nombre normalizado. La lista se recalcula en cada carga, así que las filas no sobreviven y el nombre sí.';
