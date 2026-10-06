/*
  Una tarea sólo puede colgar de un proyecto de su mismo dueño.

  Las referencias nuevas de los proyectos de verdad son compuestas,
  `(x_id, user_id)`, para que nadie cuelgue nada de algo ajeno aunque conozca
  su id (una clave foránea se comprueba sin RLS). `tasks_items.project_id`
  venía de antes con una clave simple y se quedó fuera: la prueba SQL lo
  encontró (una tarea de B podía apuntar al proyecto de A).

  Se añade la clave compuesta **además** de la de siempre, sin tocarla:

  - `not valid`: no recorre las filas que ya hay (todas son de un mismo dueño)
    ni bloquea la tabla más que un instante; vale para toda fila nueva o que
    cambie de proyecto.
  - `on delete set null (project_id)`: lo mismo que hace la de siempre al
    borrar un proyecto, así que las dos coinciden.

  Aditiva: ni se borra ni se cambia nada.
*/

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'tasks_items_project_user_fkey'
       and conrelid = 'public.tasks_items'::regclass
  ) then
    alter table public.tasks_items
      add constraint tasks_items_project_user_fkey
      foreign key (project_id, user_id) references public.tasks_projects (id, user_id)
      on delete set null (project_id)
      not valid;
  end if;
end $$;
