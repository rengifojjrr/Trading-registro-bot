/**
 * Qué tablas entran en la copia programada (`/api/cron/backup`) y cuáles no, con
 * su porqué.
 *
 * Esta lista se quedó atrás dos veces: primero los siete módulos de vida y
 * después las ocho tablas de los proyectos de verdad (personas, quién hace qué,
 * hoja de ruta, bitácora, ficha y fuentes). Las dos veces la comprobación de
 * Ajustes seguía diciendo «la copia se puede restaurar». Por eso cada tabla con
 * `user_id` que crean las migraciones tiene que estar en una de las dos listas
 * de abajo: lo vigila `tables.test.ts`, que lee `supabase/migrations/*.sql`.
 *
 * El orden es el de las dependencias dentro de cada grupo (lo que se apunta va
 * antes que lo que apunta): es el orden en que habría que restaurar.
 */
export const BACKUP_TABLES = [
  // -------------------------------------------------------------- Trading
  "accounts",
  "raw_fills",
  "raw_orders",
  "trade_grouping_overrides",
  "journal_templates",
  "journal_entries",
  "trade_comments",
  "tags",
  "trade_tags",
  "strategies",
  "playbook_items",
  "trade_playbook_checks",
  "trade_mistakes",
  "trade_verifications",
  "chart_drawings",
  "trade_screenshots",
  "trade_plans",
  "saved_views",

  // ------------------------------------------ Bots, backtest y simulador
  // Lo que decidiste tú (los bots, sus fases, los impulsos que apuntaste, las
  // reglas de las estrategias y los ajustes del simulador). Lo que el simulador
  // genera solo queda fuera.
  "bots",
  "bot_portfolio_settings",
  "bot_phase_history",
  "bot_impulses",
  "backtest_strategies",
  "paper_settings",
  "paper_accounts",

  // ----------------------------------------------------- Los siete de vida
  //
  // Aquí nada se recalcula desde nada: una noche que dormiste en marzo no se
  // reconstruye desde ningún sitio. Si se pierde, se perdió.
  "sleep_entries",
  "habits_definitions",
  "habits_entries",
  "meals_entries",
  "meals_ingredients",
  "shopping_extras",
  "reading_books",
  "reading_sessions",
  "content_pieces",

  // ---------------------------------------------- Proyectos y su gente
  // Sin `core_people`, `tasks_streams` y `tasks_milestones` una tarea con
  // responsable, frente o hito no se podría volver a meter (sus claves
  // apuntan ahí).
  "tasks_projects",
  "core_people",
  "tasks_streams",
  "tasks_milestones",
  "tasks_items",
  "tasks_project_members",
  "tasks_project_log",
  "tasks_project_docs",
  "tasks_project_doc_versions",
  "tasks_project_sources",
  // Lo que propone el bot y lo que decidiste: lo descartado no vuelve gracias
  // a esta tabla.
  "core_inbox",

  // ------------------------------------------------------ Recordatorios
  // Después de proyectos, tareas y personas: un recordatorio puede ir atado a
  // cualquiera de los tres (sin clave foránea, pero así vuelven juntos). Los
  // disparos van detrás de su recordatorio, que es a quien apuntan.
  "core_reminders",
  "core_reminder_fires",

  // ---------------------------------------- Piezas comunes y configuración
  "core_comments",
  "core_attachments",
  "core_relations",
  "core_templates",
  "core_module_views",
  "core_trash",
  "notion_field_mappings",
  "app_settings",
  "csv_imports",
  "audit_log",
] as const;

/**
 * Lo que no entra, y por qué. Una tabla nueva con `user_id` tiene que elegir
 * entre esta lista y la de arriba: no vale olvidarla.
 */
export const NOT_IN_BACKUP: Readonly<Record<string, string>> = {
  trades: "Se reconstruye desde raw_fills.",
  trade_fills: "Se reconstruye desde raw_fills.",
  trade_price_extremes: "Se recalcula desde las velas al reconstruir.",
  trade_reconstruction_runs: "Registro de cada reconstrucción; se rehace.",
  stats_daily: "Se recalcula desde las operaciones.",
  daily_balances: "Se recalcula desde las operaciones y la sincronización.",
  monthly_reports: "Se recalcula desde las operaciones.",
  position_snapshots: "Fotos de la posición que trae cada sincronización.",
  reconciliation_runs: "Registro de cada conciliación; se rehace.",
  reconciliation_discrepancies: "Sale de cada conciliación; se rehace.",
  sync_runs: "Registro de cada sincronización.",
  sync_state: "Por dónde va la sincronización; se rehace sola.",
  csv_import_rows: "Las filas crudas de cada CSV: lo que valía ya está en raw_fills.",
  notifications: "Avisos de paso.",
  push_subscriptions: "Cada teléfono se vuelve a suscribir solo.",
  notion_sync_history: "Estado de la sincronización con Notion: Notion es la otra copia.",
  notion_sync_links: "Estado de la sincronización con Notion: Notion es la otra copia.",
  notion_sync_queue: "Cola de la sincronización con Notion.",
  notion_import_links: "Enlaces de la importación de Notion: Notion es la otra copia.",
  core_daily_metrics: "Cifras del día que se recalculan desde los módulos.",
  paper_positions: "Lo genera el simulador.",
  paper_trades: "Lo genera el simulador.",
  paper_equity_points: "Lo genera el simulador.",
  strategy_measurements: "Medidas del simulador sobre la biblioteca: se vuelven a medir.",
  shopping_checked: "Lo ya marcado en la compra de esta semana.",
  puente_llaves: "Llaves del puente con el bot: sin secreto, y tras restaurar se crean otras en Ajustes.",
  puente_clientes: "El latido del bot: se vuelve a escribir en el siguiente contacto.",
  puente_ops: "Registro de operaciones del puente ya aplicadas; el bot guarda las suyas.",
  puente_cambios: "El feed del puente: se rehace con los cambios que vengan (el bot pide desde el principio).",
};
