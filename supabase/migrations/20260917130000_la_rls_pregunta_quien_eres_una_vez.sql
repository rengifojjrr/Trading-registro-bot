/*
  Treinta y dos políticas preguntaban quién eres una vez por fila.

  `auth.uid()` lee el JWT de la petición: dentro de una consulta devuelve lo
  mismo para todas las filas, siempre. Pero escrito suelto --`auth.uid() =
  user_id`-- Postgres no puede saberlo y lo trata como parte del filtro, así
  que lo llama **una vez por cada fila que mira**. En una tabla de cien filas
  no se nota; en `paper_equity_points`, que crece un punto cada cinco minutos,
  o en `raw_fills` después de sincronizar un año, es el mismo trabajo repetido
  decenas de miles de veces para obtener decenas de miles de veces la misma
  respuesta.

  Envolverlo en un subselect --`(select auth.uid()) = user_id`-- lo convierte
  en un InitPlan: Postgres lo resuelve una vez antes de empezar a escanear y
  compara ese valor contra cada fila. Mismo resultado, mismas filas, mismo
  permiso; lo único que cambia es cuántas veces se hace la pregunta.

  No es un arreglo nuevo en este proyecto: las políticas de la primera fase ya
  estaban escritas así --`security_hardening`, en agosto-- y lo que pasó es que
  todo lo que vino después (bots, papel, los seis módulos de vida, la papelera,
  las plantillas) se escribió sin ello. Esto pone al día a las que faltaban.

  Se usa `alter policy` y no `drop` + `create` a propósito: cambia la
  expresión sin que la política deje de existir en ningún momento. Un hueco,
  por breve que sea, en una política que es lo único que separa los datos de
  una persona de los de otra, no hace falta abrirlo para esto.
*/

alter policy backtest_strategies_own on public.backtest_strategies using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy bot_impulses_own on public.bot_impulses using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy bot_phase_history_own on public.bot_phase_history using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy bot_portfolio_settings_own on public.bot_portfolio_settings using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy bots_own on public.bots using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy content_pieces_own_rows on public.content_pieces using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy core_attachments_own_rows on public.core_attachments using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy core_comments_own_rows on public.core_comments using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy core_daily_metrics_own_rows on public.core_daily_metrics using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy core_module_views_own_rows on public.core_module_views using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy core_relations_own_rows on public.core_relations using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy core_templates_own_rows on public.core_templates using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy core_trash_own_rows on public.core_trash using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy habits_definitions_own_rows on public.habits_definitions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy habits_entries_own_rows on public.habits_entries using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy journal_templates_own on public.journal_templates using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy meals_entries_own_rows on public.meals_entries using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy meals_ingredients_own_rows on public.meals_ingredients using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy paper_accounts_own on public.paper_accounts using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy paper_equity_points_own on public.paper_equity_points using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy paper_positions_own on public.paper_positions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy paper_settings_own on public.paper_settings using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy paper_trades_own on public.paper_trades using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy push_subscriptions_own on public.push_subscriptions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy reading_books_own_rows on public.reading_books using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy reading_sessions_own_rows on public.reading_sessions using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy saved_views_own_rows on public.saved_views using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy shopping_checked_own on public.shopping_checked using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy shopping_extras_own on public.shopping_extras using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy sleep_entries_own_rows on public.sleep_entries using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy tasks_items_own_rows on public.tasks_items using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy tasks_projects_own_rows on public.tasks_projects using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
