-- La cuadratura entre lo que Coinbase dice de cada orden y lo que guardamos.
--
-- Coinbase devuelve en cada orden cuánto se ejecutó (`filled_size`) y en
-- cuántos trozos (`number_of_fills`). Eso convierte «¿nos falta algún fill?»,
-- que parece incontestable sin volver a pedirlo todo, en una resta.
--
-- Va en una vista y no en la aplicación porque la alternativa es traerse todos
-- los fills a memoria para sumarlos. Con veintisiete da igual; con dos años de
-- historial, no. Aquí Postgres agrega y devuelve una fila por orden.
--
-- La vista **no decide** qué es un hueco: sólo pone las dos caras una al lado
-- de la otra. Decidir es de `src/lib/sync/gaps.ts`, que está cubierto por
-- tests -- entre otras cosas para que un desajuste de coma flotante o una
-- corrección a la baja de Coinbase no provoquen reintentos infinitos.
create or replace view public.order_fill_tallies
with (security_invoker = true) as
select
  o.order_id,
  o.user_id,
  o.account_id,
  o.product_id,
  nullif(o.raw_payload ->> 'filled_size', '')      as expected_size,
  nullif(o.raw_payload ->> 'number_of_fills', '')  as expected_fills,
  coalesce(sum(f.size), 0)::text                   as stored_size,
  count(f.entry_id)::int                           as stored_count
from public.raw_orders o
left join public.raw_fills f on f.order_id = o.order_id
group by o.order_id, o.user_id, o.account_id, o.product_id, o.raw_payload;

comment on view public.order_fill_tallies is
  'Por orden: lo que Coinbase dice que se ejecutó frente a los fills que tenemos guardados. Detecta el fill que nunca se ingirió, que es lo que descuadra la posición reconstruida y funde varias operaciones en una sola.';
