-- De qué página de Notion vino cada fila.
--
-- Sin esto, importar dos veces duplica todo: es lo que permite que la
-- reimportación actualice en lugar de insertar. La unicidad se añade en la
-- migración siguiente, que explica por qué el índice no puede ser parcial.
--
-- Hábitos no aparece aquí: sus marcas ya tienen la clave natural
-- (user_id, habit_id, entry_date), que es idempotente por su cuenta. Una
-- marca de hábito no es una página de Notion sino una casilla dentro de una,
-- así que la página no la identificaría.

alter table public.sleep_entries add column if not exists notion_page_id text;
alter table public.tasks_items add column if not exists notion_page_id text;
alter table public.meals_entries add column if not exists notion_page_id text;
alter table public.reading_books add column if not exists notion_page_id text;
alter table public.reading_sessions add column if not exists notion_page_id text;

-- Los ingredientes se reemplazan enteros al reimportar una comida, así que
-- hace falta poder borrarlos por comida sin recorrer toda la tabla.
create index if not exists meals_ingredients_meal_idx
  on public.meals_ingredients (meal_id);
