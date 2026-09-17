/*
  El linter pide cincuenta y un índices. Aquí se ponen dos, y se quita uno.

  Merece la pena explicar por qué, porque el aviso va a seguir saliendo y el
  siguiente que lo mire va a tener la tentación de crearlos todos de golpe.

  «Foreign key without index» es un buen consejo genérico que en esta base es
  casi siempre falso, por dos motivos:

  1. **Cuarenta y tantos son `user_id` apuntando a `auth.users`.** Esto es un
     diario personal: hay un usuario. Un índice sobre una columna en la que
     todas las filas valen lo mismo no lo usa el planificador ni queriendo --no
     descarta ninguna fila-- y en cambio hay que escribirlo en cada `insert`.
     Serían cuarenta índices que cuestan y no ahorran.

  2. **Los que quedan ya están cubiertos.** Todas las consultas de esta
     aplicación filtran primero por `user_id` y después por lo que sea, porque
     eso es lo que hace `requireUser` en cada una. Así que lo que sirve no es un
     índice sobre la clave ajena sola, sino uno compuesto que empiece por
     `user_id` -- y varios ya existen: `habits_entries` tiene
     `(user_id, habit_id, entry_date)`, que cubre exactamente la consulta que
     se hace; `paper_trades` tiene `(user_id, hora_salida)`.

  Lo que sí falta son dos huecos de verdad, encontrados mirando las consultas
  y no la lista de avisos. Los dos son de la forma «dame los hijos de esto»,
  los dos crecen con el uso y los dos hoy acaban en un escaneo entero:

  - `fetchBook` suma las páginas de un libro: `user_id` + `book_id`. Los
    índices que había en `reading_sessions` van por fecha y por página de
    Notion; ninguno sirve para esto.
  - `fetchProjectWithTasks` trae las tareas de un proyecto: `user_id` +
    `project_id`. El índice que había va por estado y fecha límite.

  Hoy son tablas pequeñas y el escaneo es más rápido que el índice. Se ponen
  igual porque el coste es nulo --dos índices sobre tablas que se escriben
  pocas veces al día-- y porque son justo las dos tablas que crecen para
  siempre: una sesión de lectura por rato leído, una tarea por cosa que hacer.
*/

create index if not exists reading_sessions_book_idx
  on public.reading_sessions (user_id, book_id);

comment on index public.reading_sessions_book_idx is
  'Las sesiones de un libro. Empieza por user_id porque toda consulta lo filtra primero.';

create index if not exists tasks_items_project_idx
  on public.tasks_items (user_id, project_id);

comment on index public.tasks_items_project_idx is
  'Las tareas de un proyecto. Empieza por user_id porque toda consulta lo filtra primero.';

/*
  Y el duplicado.

  `raw_fills` tenía dos índices idénticos sobre `order_id`. El de agosto
  (`raw_fills_order_idx`) lo creó la migración que levantó la capa cruda. El
  otro lo creó, un mes después, la migración que quitó la clave ajena hacia
  `raw_orders`: dio por hecho que el índice que había venía de la clave y que
  al quitarla se iría con ella, así que dejó uno «por si acaso». No venía de la
  clave. Llevan desde entonces escribiéndose los dos en cada fill que entra
  para responder exactamente lo mismo.

  Se queda el original, que es el que nombran las consultas de la capa cruda.
*/
drop index if exists public.raw_fills_order_id_idx;
