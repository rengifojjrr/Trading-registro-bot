/*
  Los títulos de antes de una tarea o un hito.

  Renombrar «Comprar pintura» a «Comprar pintura blanca» en la aplicación y
  después importar el archivo de Claude, que todavía dice «Comprar pintura»,
  creaba una segunda tarea: el importador casa por título y el de la base ya
  no coincidía. Con las personas pasaba lo mismo y se arregla sin columna
  nueva: al renombrar, el nombre de antes pasa a sus alias, que el importador
  ya mira.

  Para tareas e hitos no había dónde guardarlo. `former_titles` es eso: los
  títulos que tuvo, los más recientes al final, como mucho diez. La aplicación
  lo llena al renombrar; el importador lo mira al casar. Nunca se enseña.

  Aditiva: columna con valor por defecto constante (no reescribe la tabla) y
  un tope. Las filas de antes quedan con la lista vacía.
*/

alter table public.tasks_items
  add column if not exists former_titles text[] not null default '{}'
    check (cardinality(former_titles) <= 10);

alter table public.tasks_milestones
  add column if not exists former_titles text[] not null default '{}'
    check (cardinality(former_titles) <= 10);
