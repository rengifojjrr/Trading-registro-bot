-- El precio de lo que sigue abierto, por lotes FIFO, como lo cuenta Coinbase.
--
-- La aplicación calculaba el P&L flotante de una posición abierta sobre el
-- WAP de **todas** las entradas de la operación. Coinbase no: cada salida
-- cierra el lote más antiguo, y el «precio de entrada» de la posición es el
-- de los lotes que quedan. Las dos cosas coinciden hasta que vuelves a
-- comprar después de un cierre parcial; a partir de ahí se separan, y el 2 de
-- septiembre de 2026 eso fue ver +15 aquí y −18 en Coinbase sobre los mismos
-- 22 contratos. Confirmado contra `/cfm/positions`: `avg_entry_price`
-- (77.284,77) y `daily_realized_pnl` (104,25) salen exactamente de FIFO.
--
-- `open_lots_wap` guarda ese precio; lo calcula el motor de reconstrucción y
-- lo escribe `persist_reconstruction`, que se redefine aquí para aceptarlo.
-- El P&L realizado de una operación abierta pasa a repartirse por FIFO
-- también (misma suma total, otro reparto); el de las cerradas no cambia.
-- Ver docs/PNL_METHODOLOGY.md, «Operación abierta».

alter table public.trades
  add column if not exists open_lots_wap numeric;

comment on column public.trades.open_lots_wap is
  'Precio medio de los contratos que siguen abiertos, cerrando siempre el lote más antiguo primero (FIFO): el precio de entrada que Coinbase enseña para la posición. Null cuando no queda nada abierto.';

create or replace function public.persist_reconstruction(
  p_user_id uuid,
  p_account_id uuid,
  p_product_id text,
  p_orphaned_opening_fill_ids text[],
  p_trades jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trade jsonb;
  v_alloc jsonb;
  v_trade_id uuid;
  v_inserted boolean;
  v_created int := 0;
  v_updated int := 0;
  v_closed int := 0;
  v_touched uuid[] := '{}';
  v_scope uuid[];
begin
  -- 1 · Las huérfanas primero. Si algo fallara después, la transacción entera
  --     se deshace; pero el orden deja además el código legible en el mismo
  --     sentido en que se razona el problema.
  if array_length(p_orphaned_opening_fill_ids, 1) is not null then
    update public.trades
       set orphaned_at = now()
     where user_id = p_user_id
       and opening_fill_id = any (p_orphaned_opening_fill_ids)
       and orphaned_at is null;
  end if;

  -- 2 · Fuera los enlaces de todo el ámbito, no los de cada operación.
  select array_agg(id) into v_scope
    from public.trades
   where account_id = p_account_id
     and product_id = p_product_id;

  if v_scope is not null then
    delete from public.trade_fills where trade_id = any (v_scope);
  end if;

  -- 3 · Cada operación, por su fill de apertura, que es la clave estable que
  --     hace que `trades.id` sobreviva a un recálculo.
  for v_trade in select * from jsonb_array_elements(p_trades)
  loop
    insert into public.trades (
      user_id, account_id, product_id, opening_fill_id, direction, status,
      opened_at, closed_at, max_size, total_entry_qty, total_exit_qty,
      entry_wap, exit_wap, open_lots_wap, contract_multiplier, notional_value,
      entry_commissions, exit_commissions, gross_pnl, net_pnl, return_pct,
      entries_count, exits_count, reconstruction_version, session_computed,
      source, orphaned_at
    )
    values (
      p_user_id,
      p_account_id,
      v_trade ->> 'product_id',
      v_trade ->> 'opening_fill_id',
      v_trade ->> 'direction',
      v_trade ->> 'status',
      (v_trade ->> 'opened_at')::timestamptz,
      nullif(v_trade ->> 'closed_at', '')::timestamptz,
      (v_trade ->> 'max_size')::numeric,
      (v_trade ->> 'total_entry_qty')::numeric,
      (v_trade ->> 'total_exit_qty')::numeric,
      nullif(v_trade ->> 'entry_wap', '')::numeric,
      nullif(v_trade ->> 'exit_wap', '')::numeric,
      nullif(v_trade ->> 'open_lots_wap', '')::numeric,
      (v_trade ->> 'contract_multiplier')::numeric,
      nullif(v_trade ->> 'notional_value', '')::numeric,
      (v_trade ->> 'entry_commissions')::numeric,
      (v_trade ->> 'exit_commissions')::numeric,
      nullif(v_trade ->> 'gross_pnl', '')::numeric,
      nullif(v_trade ->> 'net_pnl', '')::numeric,
      nullif(v_trade ->> 'return_pct', '')::numeric,
      (v_trade ->> 'entries_count')::int,
      (v_trade ->> 'exits_count')::int,
      (v_trade ->> 'reconstruction_version')::int,
      v_trade ->> 'session_computed',
      v_trade ->> 'source',
      null
    )
    on conflict (account_id, product_id, opening_fill_id) do update set
      direction = excluded.direction,
      status = excluded.status,
      opened_at = excluded.opened_at,
      closed_at = excluded.closed_at,
      max_size = excluded.max_size,
      total_entry_qty = excluded.total_entry_qty,
      total_exit_qty = excluded.total_exit_qty,
      entry_wap = excluded.entry_wap,
      exit_wap = excluded.exit_wap,
      open_lots_wap = excluded.open_lots_wap,
      contract_multiplier = excluded.contract_multiplier,
      notional_value = excluded.notional_value,
      entry_commissions = excluded.entry_commissions,
      exit_commissions = excluded.exit_commissions,
      gross_pnl = excluded.gross_pnl,
      net_pnl = excluded.net_pnl,
      return_pct = excluded.return_pct,
      entries_count = excluded.entries_count,
      exits_count = excluded.exits_count,
      reconstruction_version = excluded.reconstruction_version,
      session_computed = excluded.session_computed,
      source = excluded.source,
      -- Se limpia a propósito: un fill que llega tarde puede volver real una
      -- operación que estaba marcada como huérfana, y tiene que volver.
      orphaned_at = null,
      updated_at = now()
    returning id, (xmax = 0) into v_trade_id, v_inserted;

    if v_inserted then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    if (v_trade ->> 'status') = 'CLOSED' then v_closed := v_closed + 1; end if;
    v_touched := v_touched || v_trade_id;

    -- 4 · Y sus enlaces.
    for v_alloc in select * from jsonb_array_elements(coalesce(v_trade -> 'allocations', '[]'::jsonb))
    loop
      insert into public.trade_fills (
        user_id, trade_id, raw_fill_id, role,
        allocated_size, allocated_commission, sequence_no
      )
      values (
        p_user_id,
        v_trade_id,
        v_alloc ->> 'raw_fill_id',
        v_alloc ->> 'role',
        (v_alloc ->> 'allocated_size')::numeric,
        (v_alloc ->> 'allocated_commission')::numeric,
        (v_alloc ->> 'sequence_no')::int
      );
    end loop;
  end loop;

  return jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'closed', v_closed,
    'touched', to_jsonb(v_touched)
  );
end;
$$;

comment on function public.persist_reconstruction is
  'Escribe una reconstrucción completa en una sola transacción: marca huérfanas, vacía los enlaces del ámbito, inserta o actualiza cada operación por su fill de apertura y vuelve a enlazar sus fills. El cálculo vive en TypeScript; aquí sólo baja la escritura, que es la parte que tiene que ser todo-o-nada.';

revoke all on function public.persist_reconstruction(uuid, uuid, text, text[], jsonb) from public;
grant execute on function public.persist_reconstruction(uuid, uuid, text, text[], jsonb) to service_role;
