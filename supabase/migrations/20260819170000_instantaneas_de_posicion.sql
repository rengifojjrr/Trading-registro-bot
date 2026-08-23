-- `position_snapshots` existía desde el primer día y nunca se escribió ni una
-- fila. Guardaba sólo la mitad de la respuesta: lo que Coinbase reporta. Lo
-- que hace falta para responder «¿cuadra?» es tener las dos mitades juntas, en
-- la misma fila y en las mismas unidades.
--
-- Sin esto quedan tres preguntas sin respuesta:
--
--   ¿se llegó a preguntar?  Sin fila no se distingue «cuadró» de «no se pudo
--                           comprobar», y son cosas muy distintas: la segunda
--                           es la que esconde el fallo.
--   ¿desde cuándo?          Un descuadre que apareció anoche y uno que lleva
--                           ocho días son problemas distintos, y sin histórico
--                           los dos se ven igual.
--   ¿se puede confiar?      La puerta de la sincronización automática necesita
--                           una prueba reciente de que la reconstrucción
--                           coincide con el broker, no un recuento manual de
--                           hace un mes.

alter table public.position_snapshots
  add column if not exists sync_run_id uuid references public.sync_runs (id) on delete set null,
  -- Contratos con signo: negativo es corto. `number_of_contracts` viene de
  -- Coinbase sin signo, con la dirección aparte en `side`; comparar dos
  -- números con signo es lo único que hace la comparación honesta.
  add column if not exists reconstructed_size numeric,
  add column if not exists venue_size numeric,
  -- Redundante con la resta, y a propósito: es la columna por la que se
  -- pregunta, y calcularla en cada consulta invita a que dos sitios la
  -- calculen distinto.
  add column if not exists matches boolean;

create index if not exists position_snapshots_user_taken_idx
  on public.position_snapshots (user_id, snapshotted_at desc);

comment on column public.position_snapshots.matches is
  'Si la posición reconstruida coincidía con la del broker en ese momento. Se guarda también cuando coincide: sin la fila no se distingue «cuadra» de «no se pudo preguntar».';
