-- Los índices de `notion_page_id` dejan de ser parciales.
--
-- Se crearon con `where notion_page_id is not null` para que las filas
-- creadas dentro de la aplicación -- que no vienen de Notion y llevan nulo --
-- no chocaran entre sí. La intención era buena y la ejecución, equivocada:
-- Postgres no deja usar un índice único parcial en un `ON CONFLICT` a menos
-- que se repita su predicado, y el cliente de Supabase no lo repite. Con
-- estos índices, las seis importaciones fallaban en la primera pasada con
-- «there is no unique or exclusion constraint matching the ON CONFLICT
-- specification».
--
-- El predicado sobraba de todas formas: en un índice único de Postgres los
-- nulos se consideran distintos entre sí, así que un índice a secas ya
-- permite tantas filas sin `notion_page_id` como haga falta. Es la misma
-- garantía con una restricción menos.

drop index if exists sleep_entries_notion_idx;
drop index if exists tasks_items_notion_idx;
drop index if exists meals_entries_notion_idx;
drop index if exists reading_books_notion_idx;
drop index if exists reading_sessions_notion_idx;
drop index if exists content_pieces_notion_page_idx;

create unique index if not exists sleep_entries_notion_idx
  on public.sleep_entries (user_id, notion_page_id);
create unique index if not exists tasks_items_notion_idx
  on public.tasks_items (user_id, notion_page_id);
create unique index if not exists meals_entries_notion_idx
  on public.meals_entries (user_id, notion_page_id);
create unique index if not exists reading_books_notion_idx
  on public.reading_books (user_id, notion_page_id);
create unique index if not exists reading_sessions_notion_idx
  on public.reading_sessions (user_id, notion_page_id);
create unique index if not exists content_pieces_notion_page_idx
  on public.content_pieces (user_id, notion_page_id);
