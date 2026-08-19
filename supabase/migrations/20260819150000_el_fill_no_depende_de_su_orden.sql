-- Un fill no puede depender de que hayamos podido traer su orden.
--
-- `raw_fills.order_id` apuntaba a `raw_orders.order_id`. Sobre el papel es
-- integridad referencial; en la práctica invertía la jerarquía de los datos.
-- El fill es lo que Coinbase dice que pasó -- es el hecho, la única fuente de
-- verdad de la que sale todo lo demás. La orden es contexto: tanto, que
-- `upsertRawOrders` se traga sus propios errores a propósito, porque no poder
-- traerla no debería parar nada.
--
-- Con la clave ajena, esas dos decisiones se contradecían: si la orden no
-- llegaba, la base de datos rechazaba el fill. Y como los fills se insertan en
-- un solo lote, **un fill sin orden tiraba el lote entero**.
--
-- No es hipotético. El 12 de agosto de 2026 cuatro sincronizaciones seguidas
-- murieron con `raw_fills_order_id_fkey`, y una compra de 1 contrato del 11 de
-- agosto no se guardó nunca. A partir de ahí la posición reconstruida quedó
-- desplazada en 1 contrato para siempre: donde el usuario cerró y se quedó
-- plano, a la aplicación le sobraba un contrato, así que la posición nunca
-- volvía a cero y todas las operaciones desde el 17 de agosto se fundieron en
-- una sola operación fantasma de 151 contratos que enseñaba una pérdida no
-- realizada de 2.845 dólares que no existía.
--
-- Quitarla no afloja la integridad de nada que importe: la reconstrucción sólo
-- lee fills, nunca órdenes, y el hueco que dejaba la clave ajena ahora lo
-- detecta la propia aplicación comparando `filled_size` y `number_of_fills` de
-- la orden contra los fills guardados -- que es una comprobación mejor, porque
-- encuentra el fill que falta aunque la orden sí esté.
alter table public.raw_fills
  drop constraint if exists raw_fills_order_id_fkey;

-- La clave ajena traía su propio índice; al quitarla hay que dejar uno, que es
-- justamente por donde se busca al reparar un hueco.
create index if not exists raw_fills_order_id_idx
  on public.raw_fills (order_id);

comment on column public.raw_fills.order_id is
  'La orden de Coinbase que produjo el fill. Sin clave ajena a propósito: el fill es el hecho y la orden es contexto que puede no llegar, así que el fill se guarda igual.';
