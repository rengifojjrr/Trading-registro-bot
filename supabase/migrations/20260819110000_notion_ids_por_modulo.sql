-- De qué página de Notion vino cada fila.
--
-- Sin esto, importar dos veces duplica todo. El índice es único y parcial:
-- único para que la reimportación actualice en lugar de insertar, y parcial
-- porque lo que se crea dentro de la aplicación no tiene página de Notion y
-- todos esos nulos chocarían entre sí.
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

create unique index if not exists sleep_entries_notion_idx
  on public.sleep_entries (user_id, notion_page_id) where notion_page_id is not null;

create unique index if not exists tasks_items_notion_idx
  on public.tasks_items (user_id, notion_page_id) where notion_page_id is not null;

create unique index if not exists meals_entries_notion_idx
  on public.meals_entries (user_id, notion_page_id) where notion_page_id is not null;

create unique index if not exists reading_books_notion_idx
  on public.reading_books (user_id, notion_page_id) where notion_page_id is not null;

create unique index if not exists reading_sessions_notion_idx
  on public.reading_sessions (user_id, notion_page_id) where notion_page_id is not null;

-- Los ingredientes se reemplazan enteros al reimportar una comida, así que
-- hace falta poder borrarlos por comida sin recorrer toda la tabla.
create index if not exists meals_ingredients_meal_idx
  on public.meals_ingredients (meal_id);
