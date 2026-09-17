/*
  Lo que mide una estrategia de la biblioteca no es de nadie.

  `strategy_measurements` nació con una fila por estrategia **y por usuario**, y
  su migración lo justificaba así: «cada uno mide cuando quiere y sobre el
  histórico que haya en ese momento». Suena razonable y no lo es, porque la
  medición no depende de quién la pida:

  - La estrategia es de la biblioteca, que es código (`lib/paper/strategy-library.ts`).
  - Las velas son las públicas de Coinbase, las mismas para todo el mundo.
  - El motor es `runBacktest`, que es determinista.

  Dos usuarios midiendo la misma estrategia el mismo día obtienen exactamente
  el mismo número, después de pedirle a Coinbase las mismas ciento treinta y
  dos páginas cada uno. Con una fila por usuario, cada uno paga ese trabajo
  otra vez para llegar a lo que ya estaba escrito.

  Y una consecuencia peor, que es la que empuja este cambio: lo que no depende
  de nadie no lo puede medir nadie **por adelantado**. Con la fila atada a un
  usuario, la única forma de llenarla era que ese usuario entrara y pulsara un
  botón, y lo que la pantalla enseñaba mientras tanto era «Sin medir» en once
  de veintidós estrategias. Sin dueño, lo puede medir el reloj que ya corre
  cada cinco minutos, y la pantalla llega con los números puestos.

  Así que pasa a ser dato de referencia compartido, que es el patrón que este
  esquema ya tiene para `products` y que `docs/DATABASE.md` describe en el
  principio 5: sin `user_id`, legible por cualquiera que haya entrado, escrita
  sólo por el rol de servicio.

  **Se puede hacer hoy y hoy es gratis.** La tabla está vacía: se creó ayer y
  nadie llegó a pulsar el botón. Dentro de un mes esto sería migrar filas y
  decidir cuál de las de cada usuario es la buena.

  Escribir sólo el servicio no es una restricción molesta: nadie teclea una
  medición, salen todas de `medirYGuardar`. Y es lo que impide que una cifra de
  rentabilidad --que es lo que alguien va a mirar para decidir si pone dinero--
  pueda escribirse desde el navegador con la clave publicable.
*/

/* Vacía, y se comprueba antes de tocarla: si alguien llegó a medir algo entre
   ayer y hoy, esto se para en vez de tirar su trabajo en silencio. */
do $$
begin
  if exists (select 1 from public.strategy_measurements) then
    raise exception 'strategy_measurements ya tiene filas: migra los datos a mano antes de quitar user_id';
  end if;
end $$;

/* La política primero: menciona `user_id` en su `using`, y Postgres no deja
   quitar una columna de la que depende una política. */
drop policy if exists strategy_measurements_own_rows on public.strategy_measurements;

alter table public.strategy_measurements
  drop constraint if exists strategy_measurements_una_por_slug;

drop index if exists public.strategy_measurements_slug_idx;

alter table public.strategy_measurements drop column user_id;

alter table public.strategy_measurements
  add constraint strategy_measurements_una_por_slug unique (slug);

comment on table public.strategy_measurements is
  'La última medición de cada estrategia de la biblioteca. Dato de referencia compartido, como products: la miden las velas públicas y el motor de backtest, no un usuario. Las cifras nunca se escriben a mano.';

/* Leer sí, escribir no. La de antes daba CRUD al dueño de la fila y ya no hay
   dueño; el rol de servicio se salta las RLS y es el único que escribe aquí,
   desde `lib/paper/measurement-store.ts`. */
create policy strategy_measurements_lectura on public.strategy_measurements
  for select
  to authenticated
  using (true);
