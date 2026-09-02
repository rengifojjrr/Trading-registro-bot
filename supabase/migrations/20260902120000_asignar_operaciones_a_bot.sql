-- Asignar operaciones a un bot sin abrir la tabla de operaciones a la edición.
--
-- `trades` sólo tiene política de lectura para el usuario: la escribe el motor
-- de reconstrucción con la clave de servicio, y una política de UPDATE
-- general permitiría retocar a mano un P&L desde el navegador. Lo único que
-- el usuario tiene que poder cambiar es `bot_id`, así que se expone eso y
-- sólo eso: una función con `security definer` que comprueba que las
-- operaciones y el bot son suyos y toca una columna.
--
-- Devuelve cuántas filas cambió, para que la pantalla pueda decir «dos
-- asignadas» en vez de suponerlo.

create or replace function public.assign_trades_to_bot(p_trade_ids uuid[], p_bot_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;

  if p_bot_id is not null and not exists (
    select 1 from public.bots b where b.id = p_bot_id and b.user_id = auth.uid()
  ) then
    raise exception 'Ese bot no existe';
  end if;

  update public.trades t
     set bot_id = p_bot_id
   where t.id = any(p_trade_ids)
     and t.user_id = auth.uid();

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.assign_trades_to_bot(uuid[], uuid) from public;
grant execute on function public.assign_trades_to_bot(uuid[], uuid) to authenticated;

comment on function public.assign_trades_to_bot(uuid[], uuid) is
  'Cambia bot_id de las operaciones del usuario que llama, y nada más. Devuelve cuántas cambió.';
