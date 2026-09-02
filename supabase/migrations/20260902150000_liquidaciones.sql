-- Las liquidaciones de Coinbase, y dos redes que fallaban en silencio.
--
-- El 1 de septiembre de 2026 Coinbase cerró por su cuenta 28 contratos de
-- BIP-20DEC30-CDE con una orden de tipo `LIQUIDATION` (`is_liquidation =
-- true`). Sus fills llegaron por el endpoint de fills como cualquier otro y la
-- reconstrucción los restó de la posición -- pero nada en la aplicación decía
-- que ese cierre lo había hecho Coinbase y no tú.
--
-- 1. `trades.liquidated_qty`: cuántos contratos de salida de esta operación
--    ejecutó una orden de liquidación. Lo rellena `refresh_trade_liquidations`
--    después de cada reconstrucción; `persist_reconstruction` no toca esta
--    columna, así que sobrevive al recálculo igual que `bot_id`.
--
-- 2. `position_snapshots.raw_payload` era obligatoria y sin valor por
--    defecto, y la instantánea de posición se guardaba sin ella: la inserción
--    fallaba en cada sincronización y se tragaba el error. La comprobación de
--    «los contratos abiertos son los que dice Coinbase» llevaba semanas sin
--    dejar rastro. Con un valor por defecto no vuelve a pasar aunque alguien
--    olvide la columna.
--
-- 3. `raw_orders.order_type` nunca se rellenaba; el tipo estaba sólo dentro
--    de `raw_payload`. Se rellena lo que hay y a partir de ahora lo escribe la
--    sincronización, porque «LIQUIDATION» es un valor que hay que poder
--    consultar sin abrir el JSON.

alter table public.trades
  add column if not exists liquidated_qty numeric not null default 0;

comment on column public.trades.liquidated_qty is
  'Contratos de salida ejecutados por una orden de liquidación de Coinbase (order_type = LIQUIDATION). 0 si Coinbase no intervino.';

alter table public.position_snapshots
  alter column raw_payload set default '{}'::jsonb;

update public.raw_orders
   set order_type = raw_payload->>'order_type'
 where order_type is null
   and (raw_payload->>'order_type') is not null;

create or replace function public.refresh_trade_liquidations(p_user_id uuid, p_product_id text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  with liquidado as (
    select tf.trade_id, sum(tf.allocated_size) as qty
      from public.trade_fills tf
      join public.raw_fills rf on rf.entry_id = tf.raw_fill_id
      join public.raw_orders ro on ro.order_id = rf.order_id
     where tf.role = 'EXIT'
       and (ro.order_type = 'LIQUIDATION' or ro.raw_payload->>'is_liquidation' = 'true')
       and rf.user_id = p_user_id
       and rf.product_id = p_product_id
     group by tf.trade_id
  )
  update public.trades t
     set liquidated_qty = coalesce(l.qty, 0)
    from (select id from public.trades where user_id = p_user_id and product_id = p_product_id) s
    left join liquidado l on l.trade_id = s.id
   where t.id = s.id
     and t.liquidated_qty is distinct from coalesce(l.qty, 0);

  get diagnostics n = row_count;
  return n;
end
$$;

revoke all on function public.refresh_trade_liquidations(uuid, text) from public;
grant execute on function public.refresh_trade_liquidations(uuid, text) to service_role;

comment on function public.refresh_trade_liquidations(uuid, text) is
  'Recalcula trades.liquidated_qty para un producto de un usuario a partir de sus fills de salida ejecutados por órdenes LIQUIDATION. Devuelve cuántas operaciones cambiaron.';

-- Lo que ya estaba: las liquidaciones anteriores a esta migración.
select public.refresh_trade_liquidations(s.user_id, s.product_id)
  from (select distinct user_id, product_id from public.trades) s;
