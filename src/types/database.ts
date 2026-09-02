/**
 * Hand-written to match supabase/migrations/*.sql exactly (there is no live
 * Supabase project yet to generate this from -- see docs/DATABASE.md).
 *
 * Once a project exists, prefer regenerating this file with:
 *   supabase gen types typescript --project-id <ref> > src/types/database.ts
 * and re-apply the hand-written comments/JSON generics you care about.
 * Until then, if you add or change a column, update both the migration and
 * this file in the same commit -- nothing enforces they stay in sync.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// `Relationships: []` is required (not just conventional) -- @supabase/
// postgrest-js's GenericTable type includes it, and omitting it makes the
// whole Tables map fail to structurally match GenericSchema, which is what
// silently collapses every Row/Insert/Update to `never` when the client's
// generics can't resolve. See docs/DATABASE.md.
type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

// Mirrors the trades.session_computed / session_override check constraint.
// See lib/sessions/classify.ts for the DST-aware classifier that produces it.
export type SessionLabel =
  | "SYDNEY"
  | "SYDNEY_TOKYO_OVERLAP"
  | "TOKYO"
  | "TOKYO_LONDON_OVERLAP"
  | "LONDON"
  | "LONDON_NEW_YORK_OVERLAP"
  | "NEW_YORK"
  | "OFF_SESSION";

/**
 * Espeja el check de `reconciliation_discrepancies.discrepancy_type`.
 *
 * `POSITION_MISMATCH` es la posición reconstruida contra la que reporta el
 * broker: si no cuadran, falta un fill y alguna operación se queda abierta
 * aquí aunque esté cerrada de verdad.
 */
export type DiscrepancyType =
  | "MISSING_IN_DB"
  | "MISSING_IN_COINBASE"
  | "FIELD_MISMATCH"
  | "UNCLASSIFIED_FILL"
  | "TRADE_BOUNDARY_CHANGED"
  | "POSITION_MISMATCH";

// Mirrors the trades.source check constraint.
export type TradeSource = "COINBASE_SYNC" | "CSV_IMPORT" | "MANUAL" | "DEMO_SEED" | "NOTION_IMPORT";

/**
 * Espeja el enum `public.entity_kind`.
 *
 * Es a qué apuntan las tablas comunes de vida -- comentarios, adjuntos,
 * vínculos y papelera -- cuando pueden apuntar a cualquier módulo.
 */
export type EntityKind =
  // La operación va al mismo enum que los módulos de vida a propósito: «dónde
  // está lo que borré» tiene que tener una sola respuesta.
  | "OPERACION"
  | "SUENO"
  | "HABITO"
  | "TAREA"
  | "PROYECTO"
  | "COMIDA"
  | "LECTURA"
  | "LIBRO"
  | "CONTENIDO"
  // Las dos que borraban de verdad mientras todo lo demás tenía red debajo.
  | "ESTRATEGIA"
  | "ETIQUETA";

/** Los diez nombres de color de Notion, copiados en lugar de traducidos. */
export type ProjectColor =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

/**
 * Lo que se archiva al borrar, para poder devolverlo con su mismo
 * identificador. Los hijos van dentro porque restaurar una comida sin sus
 * ingredientes sería devolver un nombre vacío.
 */
export interface TrashPayload {
  row: Record<string, Json>;
  children?: Record<string, Record<string, Json>[]>;
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          display_name: string | null;
          created_at: string;
          updated_at: string;
        },
        { id: string; display_name?: string | null }
      >;

      // ------------------------------------------------------- Vida: núcleo

      core_daily_metrics: Table<
        {
          id: string;
          user_id: string;
          metric_date: string;
          module: string;
          metric_key: string;
          value: string;
          unit: string | null;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          metric_date: string;
          module: string;
          metric_key: string;
          value: number | string;
          unit?: string | null;
          updated_at?: string;
        }
      >;

      // -------------------------------------------------------- Vida: sueño

      sleep_entries: Table<
        {
          id: string;
          user_id: string;
          sleep_date: string;
          slept_at: string | null;
          woke_at: string | null;
          /** Generada por Postgres a partir de los dos timestamps -- nunca se escribe. */
          duration_minutes: number | null;
          score: string | null;
          mood_on_waking: string[];
          woke_how: string[];
          before_bed: string[];
          dream: string | null;
          notes: string | null;
          place: string | null;
          /** Tu estimación de cuánto dormiste, que no es la resta de las horas. */
          self_reported: string | null;
          icon: string | null;
          /** De qué página de Notion vino, cuando vino de ahí. */
          notion_page_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          sleep_date: string;
          slept_at?: string | null;
          woke_at?: string | null;
          score?: number | string | null;
          mood_on_waking?: string[];
          woke_how?: string[];
          before_bed?: string[];
          dream?: string | null;
          notes?: string | null;
          place?: string | null;
          self_reported?: string | null;
          icon?: string | null;
          notion_page_id?: string | null;
          updated_at?: string;
        }
      >;

      // ------------------------------------------------------ Vida: hábitos

      habits_definitions: Table<
        {
          id: string;
          user_id: string;
          name: string;
          emoji: string | null;
          sort_order: number;
          archived_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          emoji?: string | null;
          sort_order?: number;
          archived_at?: string | null;
        }
      >;

      habits_entries: Table<
        {
          id: string;
          user_id: string;
          habit_id: string;
          entry_date: string;
          done: boolean;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          habit_id: string;
          entry_date: string;
          done?: boolean;
        }
      >;

      // ----------------------------------------------------- Vida: lecturas

      reading_books: Table<
        {
          id: string;
          user_id: string;
          title: string;
          author: string | null;
          genres: string[];
          total_pages: number | null;
          status: "POR_LEER" | "LEYENDO" | "TERMINADO" | "ABANDONADO";
          icon: string | null;
          notion_page_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          author?: string | null;
          genres?: string[];
          total_pages?: number | null;
          status?: "POR_LEER" | "LEYENDO" | "TERMINADO" | "ABANDONADO";
          icon?: string | null;
          notion_page_id?: string | null;
        }
      >;

      reading_sessions: Table<
        {
          id: string;
          user_id: string;
          book_id: string | null;
          session_date: string;
          started_at: string | null;
          minutes: number | null;
          pages: number | null;
          score: string | null;
          summary: string | null;
          notion_page_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          book_id?: string | null;
          session_date: string;
          started_at?: string | null;
          minutes?: number | null;
          pages?: number | null;
          score?: number | string | null;
          summary?: string | null;
          notion_page_id?: string | null;
        }
      >;

      // ------------------------------------------------------- Vida: tareas

      tasks_projects: Table<
        {
          id: string;
          user_id: string;
          name: string;
          /** Uno de los diez nombres de color de Notion, no un hexadecimal. */
          color: ProjectColor | null;
          icon: string | null;
          is_active: boolean;
          sort_order: number;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          color?: ProjectColor | null;
          icon?: string | null;
          is_active?: boolean;
          sort_order?: number;
        }
      >;

      tasks_items: Table<
        {
          id: string;
          user_id: string;
          project_id: string | null;
          title: string;
          status: "NO_INICIADA" | "EN_CURSO" | "HECHA";
          priority: "ALTA" | "MEDIA" | "BAJA";
          due_date: string | null;
          /** El último día, cuando la tarea dura más de uno. */
          due_end: string | null;
          /** La hora del día, cuando la tiene. `HH:MM:SS`. */
          due_time: string | null;
          categories: string[];
          notes: string | null;
          /** El cuerpo de la página de Notion: lo que la tarea explica. */
          description: string | null;
          icon: string | null;
          completed_at: string | null;
          notion_page_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          project_id?: string | null;
          title: string;
          status?: "NO_INICIADA" | "EN_CURSO" | "HECHA";
          priority?: "ALTA" | "MEDIA" | "BAJA";
          due_date?: string | null;
          due_end?: string | null;
          due_time?: string | null;
          categories?: string[];
          notes?: string | null;
          description?: string | null;
          icon?: string | null;
          completed_at?: string | null;
          notion_page_id?: string | null;
          /** Se escribe sólo al importar, para conservar la fecha de Notion. */
          created_at?: string;
          updated_at?: string;
        }
      >;

      // ------------------------------------------------------ Vida: comidas

      meals_entries: Table<
        {
          id: string;
          user_id: string;
          meal_date: string;
          meal_type: "DESAYUNO" | "ALMUERZO" | "CENA";
          name: string;
          notes: string | null;
          cook: string | null;
          icon: string | null;
          notion_page_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          meal_date: string;
          meal_type: "DESAYUNO" | "ALMUERZO" | "CENA";
          name: string;
          notes?: string | null;
          cook?: string | null;
          icon?: string | null;
          notion_page_id?: string | null;
        }
      >;

      meals_ingredients: Table<
        {
          id: string;
          user_id: string;
          meal_id: string;
          name: string;
          quantity: string | null;
          unit: string | null;
          sort_order: number;
        },
        {
          id?: string;
          user_id: string;
          meal_id: string;
          name: string;
          quantity?: number | string | null;
          unit?: string | null;
          sort_order?: number;
        }
      >;

      // ---------------------------------------------------- Vida: contenido

      /**
       * Los diez estados son los del calendario real de Notion, no una
       * simplificación: cada uno nombra un cuello de botella concreto del
       * proceso. Se escriben aquí en lugar de importarlos del módulo porque
       * este archivo describe la base de datos y no puede depender de
       * `src/modules` -- el módulo tiene que poder extraerse entero.
       */
      content_pieces: Table<
        {
          id: string;
          user_id: string;
          title: string;
          summary: string | null;
          channels: string[];
          platforms: string[];
          content_type: string | null;
          status:
            | "IDEA"
            | "FALTA_GUION"
            | "FALTA_GRABAR"
            | "FALTA_EDITAR"
            | "EDITANDO"
            | "EDITADO_FALTA_LINK"
            | "EN_DRIVE"
            | "FALTA_MINIATURA"
            | "LISTO_PARA_PUBLICAR"
            | "PUBLICADO";
          planned_date: string | null;
          published_at: string | null;
          has_script: boolean;
          is_edited: boolean;
          has_thumbnail_ab: boolean;
          /** El primero de `record_difficulties`; se conserva por compatibilidad. */
          record_difficulty: string | null;
          /** En Notion «DIFICULTAD DE GRABAR» admite varios valores a la vez. */
          record_difficulties: string[];
          record_minutes: number | null;
          edit_minutes: number | null;
          /** El tiempo guardado es un suelo: «despues de las 10 deje de contar». */
          edit_time_uncapped: boolean;
          edit_styles: string[];
          edit_notes: string | null;
          video_url: string | null;
          final_url: string | null;
          url: string | null;
          notes: string | null;
          /** El cuerpo de la página: el guion, que es el trabajo de verdad. */
          body: string | null;
          icon: string | null;
          notion_page_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          title: string;
          summary?: string | null;
          channels?: string[];
          platforms?: string[];
          content_type?: string | null;
          status?:
            | "IDEA"
            | "FALTA_GUION"
            | "FALTA_GRABAR"
            | "FALTA_EDITAR"
            | "EDITANDO"
            | "EDITADO_FALTA_LINK"
            | "EN_DRIVE"
            | "FALTA_MINIATURA"
            | "LISTO_PARA_PUBLICAR"
            | "PUBLICADO";
          planned_date?: string | null;
          published_at?: string | null;
          has_script?: boolean;
          is_edited?: boolean;
          has_thumbnail_ab?: boolean;
          record_difficulty?: string | null;
          record_difficulties?: string[];
          record_minutes?: number | null;
          edit_minutes?: number | null;
          edit_time_uncapped?: boolean;
          edit_styles?: string[];
          edit_notes?: string | null;
          video_url?: string | null;
          final_url?: string | null;
          url?: string | null;
          notes?: string | null;
          body?: string | null;
          icon?: string | null;
          notion_page_id?: string | null;
          updated_at?: string;
        }
      >;

      // --------------------------------------------- Vida: piezas comunes

      /**
       * Las seis tablas que siguen apuntan a filas de cualquier módulo, así
       * que guardan a qué tipo de cosa apuntan. No hay clave foránea posible
       * contra once tablas distintas: lo que las protege es la misma política
       * de RLS que todo lo demás, y el borrado en cascada se hace explícito
       * desde la aplicación.
       */

      core_comments: Table<
        {
          id: string;
          user_id: string;
          entity_kind: EntityKind;
          entity_id: string;
          body: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          entity_kind: EntityKind;
          entity_id: string;
          body: string;
          updated_at?: string;
        }
      >;

      core_attachments: Table<
        {
          id: string;
          user_id: string;
          entity_kind: EntityKind;
          entity_id: string;
          /** Qué ranura ocupa: en contenido el montaje y la versión final no son lo mismo. */
          slot: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          entity_kind: EntityKind;
          entity_id: string;
          slot?: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          size_bytes?: number | null;
        }
      >;

      core_relations: Table<
        {
          id: string;
          user_id: string;
          from_kind: EntityKind;
          from_id: string;
          to_kind: EntityKind;
          to_id: string;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          from_kind: EntityKind;
          from_id: string;
          to_kind: EntityKind;
          to_id: string;
        }
      >;

      core_trash: Table<
        {
          id: string;
          user_id: string;
          entity_kind: EntityKind;
          entity_id: string;
          label: string;
          payload: TrashPayload;
          deleted_at: string;
        },
        {
          id?: string;
          user_id: string;
          entity_kind: EntityKind;
          entity_id: string;
          label: string;
          payload: TrashPayload;
        }
      >;

      core_module_views: Table<
        {
          id: string;
          user_id: string;
          module: string;
          name: string;
          path: string;
          query: string;
          sort_order: number;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          module: string;
          name: string;
          path: string;
          query?: string;
          sort_order?: number;
        }
      >;

      core_templates: Table<
        {
          id: string;
          user_id: string;
          module: string;
          name: string;
          payload: Record<string, unknown>;
          body: string | null;
          is_default: boolean;
          sort_order: number;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          module: string;
          name: string;
          payload?: Record<string, unknown>;
          body?: string | null;
          is_default?: boolean;
          sort_order?: number;
        }
      >;

      saved_views: Table<
        {
          id: string;
          user_id: string;
          name: string;
          path: string;
          query: string;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          path: string;
          query?: string;
        }
      >;

      app_settings: Table<
        {
          user_id: string;
          timezone: string;
          max_daily_loss: string | null;
          max_trades_per_day: number | null;
          max_risk_per_trade_pct: string | null;
          account_size: string | null;
          sync_interval_minutes: number;
          reconciliation_hour_local: number;
          monthly_report_day: number;
          active_venue: "FCM" | "INTX";
          active_product_id: string | null;
          notion_enabled: boolean;
          notion_database_id: string | null;
          auto_sync_enabled: boolean;
          maintenance_margin_rate: number;
          target_margin_ratio: number;
          trading_fee_pct: number;
          min_fee_per_contract: number;
          coinbase_key_rotated_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          timezone?: string;
          max_daily_loss?: string | number | null;
          max_trades_per_day?: number | null;
          max_risk_per_trade_pct?: string | number | null;
          account_size?: string | number | null;
          sync_interval_minutes?: number;
          reconciliation_hour_local?: number;
          monthly_report_day?: number;
          active_venue?: "FCM" | "INTX";
          active_product_id?: string | null;
          notion_enabled?: boolean;
          notion_database_id?: string | null;
          auto_sync_enabled?: boolean;
          maintenance_margin_rate?: number;
          target_margin_ratio?: number;
          trading_fee_pct?: number;
          min_fee_per_contract?: number;
          coinbase_key_rotated_at?: string | null;
        }
      >;

      accounts: Table<
        {
          id: string;
          user_id: string;
          portfolio_id: string;
          venue: "FCM" | "INTX" | "EXTERNAL";
          name: string;
          currency: string;
          is_demo: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          portfolio_id: string;
          venue: "FCM" | "INTX" | "EXTERNAL";
          name: string;
          currency?: string;
          is_demo?: boolean;
          is_active?: boolean;
        }
      >;

      products: Table<
        {
          product_id: string;
          venue: "CBE" | "FCM" | "INTX" | "UNKNOWN_VENUE_TYPE" | "EXTERNAL";
          product_type: "SPOT" | "FUTURE" | "EQUITY" | "OPTION_GROUP" | "FUTURE_GROUP";
          base_currency_id: string | null;
          quote_currency_id: string | null;
          contract_size: string | null; // numeric -> string over the wire
          contract_root_unit: string | null;
          contract_expiry_type: "EXPIRING" | "PERPETUAL" | null;
          contract_expiry: string | null;
          contract_expiry_timezone: string | null;
          risk_managed_by: "MANAGED_BY_FCM" | "MANAGED_BY_VENUE" | null;
          display_name: string | null;
          raw_metadata: Json;
          fetched_at: string;
          is_stale: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          product_id: string;
          venue: "CBE" | "FCM" | "INTX" | "UNKNOWN_VENUE_TYPE" | "EXTERNAL";
          product_type: "SPOT" | "FUTURE" | "EQUITY" | "OPTION_GROUP" | "FUTURE_GROUP";
          base_currency_id?: string | null;
          quote_currency_id?: string | null;
          contract_size?: string | null;
          contract_root_unit?: string | null;
          contract_expiry_type?: "EXPIRING" | "PERPETUAL" | null;
          contract_expiry?: string | null;
          contract_expiry_timezone?: string | null;
          risk_managed_by?: "MANAGED_BY_FCM" | "MANAGED_BY_VENUE" | null;
          display_name?: string | null;
          raw_metadata?: Json;
          fetched_at?: string;
          is_stale?: boolean;
        }
      >;

      sync_state: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          sync_type: "POLL" | "RECONCILE";
          cursor: string | null;
          high_water_mark: string | null;
          overlap_window_seconds: number;
          last_attempt_at: string | null;
          last_success_at: string | null;
          consecutive_failures: number;
          status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          sync_type: "POLL" | "RECONCILE";
          cursor?: string | null;
          high_water_mark?: string | null;
          overlap_window_seconds?: number;
          last_attempt_at?: string | null;
          last_success_at?: string | null;
          consecutive_failures?: number;
          status?: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
        }
      >;

      sync_runs: Table<
        {
          id: string;
          user_id: string;
          sync_state_id: string;
          started_at: string;
          finished_at: string | null;
          status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
          fills_fetched: number;
          fills_new: number;
          orders_fetched: number;
          trades_created: number;
          trades_updated: number;
          discrepancies_found: number;
          error_summary: string | null;
          raw_error: Json | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          sync_state_id: string;
          started_at?: string;
          finished_at?: string | null;
          status?: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
          fills_fetched?: number;
          fills_new?: number;
          orders_fetched?: number;
          trades_created?: number;
          trades_updated?: number;
          discrepancies_found?: number;
          error_summary?: string | null;
          raw_error?: Json | null;
        }
      >;

      reconciliation_runs: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          run_date: string;
          window_start: string;
          window_end: string;
          coinbase_fill_count: number | null;
          db_fill_count: number | null;
          resolved: boolean;
          resolved_at: string | null;
          started_at: string;
          finished_at: string | null;
          status: "RUNNING" | "SUCCESS" | "FAILED";
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          run_date?: string;
          window_start: string;
          window_end: string;
          coinbase_fill_count?: number | null;
          db_fill_count?: number | null;
          resolved?: boolean;
          resolved_at?: string | null;
          started_at?: string;
          finished_at?: string | null;
          status?: "RUNNING" | "SUCCESS" | "FAILED";
        }
      >;

      reconciliation_discrepancies: Table<
        {
          id: string;
          user_id: string;
          reconciliation_run_id: string;
          discrepancy_type: DiscrepancyType;
          entity_type: string;
          entity_id: string;
          expected: Json | null;
          actual: Json | null;
          resolved_at: string | null;
          resolution_note: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          reconciliation_run_id: string;
          discrepancy_type: DiscrepancyType;
          entity_type: string;
          entity_id: string;
          expected?: Json | null;
          actual?: Json | null;
          resolved_at?: string | null;
          resolution_note?: string | null;
        }
      >;

      raw_orders: Table<
        {
          order_id: string;
          user_id: string;
          account_id: string;
          product_id: string | null;
          order_type: string | null;
          order_side: "BUY" | "SELL" | null;
          status: string | null;
          raw_payload: Json;
          sync_run_id: string | null;
          fetched_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          order_id: string;
          user_id: string;
          account_id: string;
          product_id?: string | null;
          order_type?: string | null;
          order_side?: "BUY" | "SELL" | null;
          status?: string | null;
          raw_payload: Json;
          sync_run_id?: string | null;
          fetched_at?: string;
        }
      >;

      raw_fills: Table<
        {
          entry_id: string;
          user_id: string;
          account_id: string;
          order_id: string | null;
          product_id: string;
          coinbase_trade_id: string | null;
          trade_time: string;
          sequence_timestamp: string;
          trade_type: "FILL" | "REVERSAL" | "CORRECTION" | "SYNTHETIC";
          side: "BUY" | "SELL";
          price: string;
          size: string;
          commission: string;
          commission_detail: Json | null;
          liquidity_indicator: "MAKER" | "TAKER" | "UNKNOWN_LIQUIDITY_INDICATOR" | null;
          size_in_quote: boolean;
          retail_portfolio_id: string | null;
          future_legs: Json;
          raw_payload: Json;
          sync_run_id: string | null;
          ingested_at: string;
          created_at: string;
        },
        {
          entry_id: string;
          user_id: string;
          account_id: string;
          order_id?: string | null;
          product_id: string;
          coinbase_trade_id?: string | null;
          trade_time: string;
          sequence_timestamp: string;
          trade_type?: "FILL" | "REVERSAL" | "CORRECTION" | "SYNTHETIC";
          side: "BUY" | "SELL";
          price: string | number;
          size: string | number;
          commission?: string | number;
          commission_detail?: Json | null;
          liquidity_indicator?: "MAKER" | "TAKER" | "UNKNOWN_LIQUIDITY_INDICATOR" | null;
          size_in_quote?: boolean;
          retail_portfolio_id?: string | null;
          future_legs?: Json;
          raw_payload: Json;
          sync_run_id?: string | null;
        },
        // No update type: raw_fills is append-only by design (never
        // updated, even by the service role -- corrections arrive as new
        // rows with trade_type REVERSAL/CORRECTION/SYNTHETIC instead).
        never
      >;

      trades: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          product_id: string;
          opening_fill_id: string | null;
          direction: "LONG" | "SHORT";
          status: "OPEN" | "CLOSED";
          opened_at: string;
          closed_at: string | null;
          duration_seconds: number | null;
          max_size: string;
          total_entry_qty: string;
          total_exit_qty: string;
          entry_wap: string | null;
          exit_wap: string | null;
          notional_value: string | null;
          contract_multiplier: string;
          entry_commissions: string;
          exit_commissions: string;
          total_commissions: string;
          gross_pnl: string | null;
          net_pnl: string | null;
          return_pct: string | null;
          entries_count: number;
          exits_count: number;
          reconstruction_version: number;
          is_manually_adjusted: boolean;
          orphaned_at: string | null;
          session_computed: SessionLabel | null;
          session_override: SessionLabel | null;
          session_effective: SessionLabel | null;
          source: TradeSource;
          /** El bot que la abrió, si la abrió un bot. Sobrevive al recálculo. */
          bot_id: string | null;
          /**
           * Contratos de salida que ejecutó una orden de liquidación de
           * Coinbase. `0` si Coinbase no intervino. Lo escribe
           * `refresh_trade_liquidations` después de cada reconstrucción.
           */
          liquidated_qty: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          product_id: string;
          opening_fill_id?: string | null;
          direction: "LONG" | "SHORT";
          status?: "OPEN" | "CLOSED";
          opened_at: string;
          closed_at?: string | null;
          max_size?: string | number;
          total_entry_qty?: string | number;
          total_exit_qty?: string | number;
          entry_wap?: string | number | null;
          exit_wap?: string | number | null;
          notional_value?: string | number | null;
          contract_multiplier?: string | number;
          entry_commissions?: string | number;
          exit_commissions?: string | number;
          gross_pnl?: string | number | null;
          net_pnl?: string | number | null;
          return_pct?: string | number | null;
          entries_count?: number;
          exits_count?: number;
          reconstruction_version?: number;
          is_manually_adjusted?: boolean;
          orphaned_at?: string | null;
          session_computed?: SessionLabel | null;
          session_override?: SessionLabel | null;
          source?: "COINBASE_SYNC" | "CSV_IMPORT" | "MANUAL" | "DEMO_SEED" | "NOTION_IMPORT";
          bot_id?: string | null;
          liquidated_qty?: string | number;
        }
      >;

      trade_grouping_overrides: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          product_id: string;
          override_type: "MERGE" | "SPLIT" | "REASSIGN" | "EXCLUDE_FILL";
          anchor_fill_id: string;
          payload: Json;
          is_active: boolean;
          note: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          product_id: string;
          override_type: "MERGE" | "SPLIT" | "REASSIGN" | "EXCLUDE_FILL";
          anchor_fill_id: string;
          payload?: Json;
          is_active?: boolean;
          note?: string | null;
        }
      >;

      trade_fills: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          raw_fill_id: string;
          role: "ENTRY" | "EXIT";
          allocated_size: string;
          allocated_commission: string;
          sequence_no: number;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          raw_fill_id: string;
          role: "ENTRY" | "EXIT";
          allocated_size: string | number;
          allocated_commission?: string | number;
          sequence_no: number;
        }
      >;

      trade_reconstruction_runs: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          product_id: string;
          algorithm_version: number;
          fills_processed: number;
          trades_created: number;
          trades_updated: number;
          trades_closed: number;
          started_at: string;
          finished_at: string | null;
          status: "RUNNING" | "SUCCESS" | "FAILED";
          notes: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          product_id: string;
          algorithm_version: number;
          fills_processed?: number;
          trades_created?: number;
          trades_updated?: number;
          trades_closed?: number;
          started_at?: string;
          finished_at?: string | null;
          status?: "RUNNING" | "SUCCESS" | "FAILED";
          notes?: string | null;
        }
      >;

      daily_balances: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          balance_date: string;
          equity: string | null;
          realized_pnl: string;
          unrealized_pnl: string | null;
          net_deposits: string | null;
          source: "COMPUTED" | "COINBASE_API" | "MANUAL";
          computed_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          balance_date: string;
          equity?: string | number | null;
          realized_pnl?: string | number;
          unrealized_pnl?: string | number | null;
          net_deposits?: string | number | null;
          source?: "COMPUTED" | "COINBASE_API" | "MANUAL";
        }
      >;

      stats_daily: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          period_type: "DAY" | "WEEK" | "MONTH";
          period_start: string;
          trades_count: number;
          wins: number;
          losses: number;
          breakeven: number;
          gross_pnl: string;
          net_pnl: string;
          commissions: string;
          win_rate: string | null;
          profit_factor: string | null;
          expectancy: string | null;
          max_drawdown: string | null;
          best_trade_id: string | null;
          worst_trade_id: string | null;
          computed_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          period_type: "DAY" | "WEEK" | "MONTH";
          period_start: string;
          trades_count?: number;
          wins?: number;
          losses?: number;
          breakeven?: number;
          gross_pnl?: string | number;
          net_pnl?: string | number;
          commissions?: string | number;
          win_rate?: string | number | null;
          profit_factor?: string | number | null;
          expectancy?: string | number | null;
          max_drawdown?: string | number | null;
          best_trade_id?: string | null;
          worst_trade_id?: string | null;
        }
      >;

      monthly_reports: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          period_month: string;
          generated_at: string;
          summary: Json;
          pdf_storage_path: string | null;
          csv_storage_path: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          period_month: string;
          generated_at?: string;
          summary?: Json;
          pdf_storage_path?: string | null;
          csv_storage_path?: string | null;
        }
      >;

      /**
       * Las reglas ejecutables de backtest.
       *
       * Distinta de `strategies`, que es una etiqueta para operaciones ya
       * hechas. `rules` y `costs` van como `Json` porque su forma la define
       * `lib/backtest/types.ts` y cambia cada vez que se añade un bloque: una
       * migración por bloque sería el precio de haberlas puesto en columnas.
       */
      /**
       * Un navegador suscrito a avisos.
       *
       * `p256dh` y `auth` son las claves para cifrar el cuerpo de un aviso.
       * Aquí los avisos van sin cuerpo, pero se guardan igual: el navegador
       * las da juntas y tirarlas obligaría a volver a pedir permiso el día que
       * se quiera mandar contenido.
       */
      /** Lo que hay que comprar y no viene de ninguna comida planificada. */
      shopping_extras: Table<
        {
          id: string;
          user_id: string;
          name: string;
          quantity: string | null;
          unit: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          quantity?: string | number | null;
          unit?: string | null;
        },
        { name?: string; quantity?: string | number | null; unit?: string | null }
      >;
      /**
       * Lo que ya está en el carro.
       *
       * La clave es el nombre normalizado y no un identificador de fila: la
       * lista se recalcula de las comidas planificadas en cada carga, así que
       * las filas no sobreviven de una a la siguiente y el nombre sí.
       */
      shopping_checked: Table<
        { user_id: string; item_key: string; checked_at: string },
        { user_id: string; item_key: string },
        { checked_at?: string }
      >;
      push_subscriptions: Table<
        {
          endpoint: string;
          user_id: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_used_at: string | null;
        },
        {
          endpoint: string;
          user_id: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
        },
        {
          p256dh?: string;
          auth?: string;
          user_agent?: string | null;
          last_used_at?: string | null;
        }
      >;
      backtest_strategies: Table<
        {
          id: string;
          user_id: string;
          name: string;
          product_id: string | null;
          rules: Json;
          costs: Json;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          product_id?: string | null;
          rules?: Json;
          costs?: Json;
          is_active?: boolean;
        },
        {
          name?: string;
          product_id?: string | null;
          rules?: Json;
          costs?: Json;
          is_active?: boolean;
          updated_at?: string;
        }
      >;

      // ------------------------------------------------------------- Bots
      // Ver supabase/migrations/20260902100000_bots.sql y lib/bots/types.ts.

      bots: Table<
        {
          id: string;
          user_id: string;
          name: string;
          market: string;
          timeframe: string;
          style: string;
          block: string;
          phase: string;
          sizing_pct: string;
          risk_per_trade_pct: string;
          magic_number: string | null;
          hypothesis: string | null;
          baseline: Json;
          drawdown_contract_pct: string | null;
          contract_signed_at: string | null;
          backtest_strategy_id: string | null;
          strategy_id: string | null;
          notes: string | null;
          retired_at: string | null;
          retirement_reason: string | null;
          retirement_note: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          market: string;
          timeframe: string;
          style: string;
          block: string;
          phase?: string;
          sizing_pct?: string | number;
          risk_per_trade_pct?: string | number;
          magic_number?: string | null;
          hypothesis?: string | null;
          baseline?: Json;
          drawdown_contract_pct?: string | number | null;
          contract_signed_at?: string | null;
          backtest_strategy_id?: string | null;
          strategy_id?: string | null;
          notes?: string | null;
          retired_at?: string | null;
          retirement_reason?: string | null;
          retirement_note?: string | null;
        },
        {
          name?: string;
          market?: string;
          timeframe?: string;
          style?: string;
          block?: string;
          phase?: string;
          sizing_pct?: string | number;
          risk_per_trade_pct?: string | number;
          magic_number?: string | null;
          hypothesis?: string | null;
          baseline?: Json;
          drawdown_contract_pct?: string | number | null;
          contract_signed_at?: string | null;
          backtest_strategy_id?: string | null;
          strategy_id?: string | null;
          notes?: string | null;
          retired_at?: string | null;
          retirement_reason?: string | null;
          retirement_note?: string | null;
          updated_at?: string;
        }
      >;

      bot_phase_history: Table<
        {
          id: string;
          user_id: string;
          bot_id: string;
          from_phase: string | null;
          to_phase: string;
          reason: string | null;
          metrics: Json;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          bot_id: string;
          from_phase?: string | null;
          to_phase: string;
          reason?: string | null;
          metrics?: Json;
        }
      >;

      bot_impulses: Table<
        {
          id: string;
          user_id: string;
          bot_id: string | null;
          action: string;
          note: string | null;
          executed: boolean;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          bot_id?: string | null;
          action: string;
          note?: string | null;
          executed?: boolean;
        }
      >;

      bot_portfolio_settings: Table<
        {
          user_id: string;
          target_convexo: string;
          target_concavo: string;
          target_hibrido: string;
          ks_alert_pct: string;
          ks_reduce_pct: string;
          ks_close_pct: string;
          ks_off_pct: string;
          gate_profit_factor: string;
          gate_expectancy_r: string;
          gate_sharpe: string;
          gate_max_drawdown_pct: string;
          gate_min_trades: number;
          updated_at: string;
        },
        {
          user_id: string;
          target_convexo?: string | number;
          target_concavo?: string | number;
          target_hibrido?: string | number;
          ks_alert_pct?: string | number;
          ks_reduce_pct?: string | number;
          ks_close_pct?: string | number;
          ks_off_pct?: string | number;
          gate_profit_factor?: string | number;
          gate_expectancy_r?: string | number;
          gate_sharpe?: string | number;
          gate_max_drawdown_pct?: string | number;
          gate_min_trades?: number;
          updated_at?: string;
        }
      >;

      strategies: Table<
        {
          id: string;
          user_id: string;
          name: string;
          description: string | null;
          rules: Json;
          timeframe_entry: string | null;
          timeframe_reference: string | null;
          timeframe_structure: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          description?: string | null;
          rules?: Json;
          timeframe_entry?: string | null;
          timeframe_reference?: string | null;
          timeframe_structure?: string | null;
          is_active?: boolean;
        }
      >;

      tags: Table<
        {
          id: string;
          user_id: string;
          name: string;
          color: string | null;
          created_at: string;
        },
        { id?: string; user_id: string; name: string; color?: string | null }
      >;

      trade_tags: Table<
        { user_id: string; trade_id: string; tag_id: string; created_at: string },
        { user_id: string; trade_id: string; tag_id: string }
      >;

      journal_entries: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          strategy_id: string | null;
          htf_bias: string | null;
          sr_proximity: string | null;
          planned_direction: "LONG" | "SHORT" | "NONE" | null;
          risk_amount: string | null;
          stop_loss_price: string | null;
          take_profit_price: string | null;
          result_r: string | null;
          plan_adherence: number | null;
          entry_quality: number | null;
          emotional_state: string | null;
          mistake_tag: string | null;
          lesson_learned: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          strategy_id?: string | null;
          htf_bias?: string | null;
          sr_proximity?: string | null;
          planned_direction?: "LONG" | "SHORT" | "NONE" | null;
          risk_amount?: string | number | null;
          stop_loss_price?: string | number | null;
          take_profit_price?: string | number | null;
          result_r?: string | number | null;
          plan_adherence?: number | null;
          entry_quality?: number | null;
          emotional_state?: string | null;
          mistake_tag?: string | null;
          lesson_learned?: string | null;
          notes?: string | null;
        }
      >;

      trade_screenshots: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          storage_path: string;
          caption: string | null;
          phase: "BEFORE" | "AFTER" | "OTHER" | null;
          uploaded_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          storage_path: string;
          caption?: string | null;
          phase?: "BEFORE" | "AFTER" | "OTHER" | null;
        }
      >;

      trade_comments: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          body: string;
          created_at: string;
        },
        { id?: string; user_id: string; trade_id: string; body: string }
      >;

      /**
       * Combinaciones de diario guardadas.
       *
       * Los errores se repiten -- eso es lo que los hace errores -- y volver a
       * marcar las mismas cinco etiquetas cada vez es la fricción que hace que
       * a la tercera ya no se apunte nada.
       */
      journal_templates: Table<
        {
          id: string;
          user_id: string;
          name: string;
          /** Lo mismo que acepta `lib/journal/bulk-apply.ts`. */
          values: Json;
          use_count: number;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          values?: Json;
          use_count?: number;
          last_used_at?: string | null;
          updated_at?: string;
        }
      >;

      playbook_items: Table<
        {
          id: string;
          user_id: string;
          strategy_id: string;
          label: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          strategy_id: string;
          label: string;
          sort_order?: number;
          is_active?: boolean;
        }
      >;

      trade_playbook_checks: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          playbook_item_id: string;
          checked: boolean;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          playbook_item_id: string;
          checked?: boolean;
        }
      >;

      trade_mistakes: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          mistake_code: string;
          note: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          mistake_code: string;
          note?: string | null;
        }
      >;

      chart_drawings: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          /**
           * El catálogo vive en `lib/charts/tools.ts`; aquí se escribe como
           * `string` a propósito. Repetir veintitrés literales en dos sitios
           * es garantizar que se desincronicen: quien manda es la restricción
           * de la tabla, y el código valida contra el catálogo antes de
           * escribir.
           */
          tool: string;
          /** Lista de {time, price}: de uno a cinco según la herramienta. */
          points: Json;
          color: string;
          /** Sólo lo que se aparta de los valores de fábrica. */
          style: Json;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          tool: string;
          points: Json;
          color?: string;
          style?: Json;
        }
      >;

      notion_sync_links: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          notion_page_id: string;
          notion_database_id: string;
          last_synced_at: string | null;
          last_synced_hash: string | null;
          status: "SYNCED" | "PENDING" | "ERROR";
          error_message: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          notion_page_id: string;
          notion_database_id: string;
          last_synced_at?: string | null;
          last_synced_hash?: string | null;
          status?: "SYNCED" | "PENDING" | "ERROR";
          error_message?: string | null;
        }
      >;

      notion_import_links: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          notion_page_id: string;
          notion_database_id: string;
          raw_properties: Json;
          imported_at: string;
          last_synced_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          notion_page_id: string;
          notion_database_id: string;
          raw_properties: Json;
          imported_at?: string;
          last_synced_at?: string;
        }
      >;

      notion_sync_queue: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          attempt_count: number;
          next_attempt_at: string;
          last_error: string | null;
          status: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED_PERMANENT";
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          attempt_count?: number;
          next_attempt_at?: string;
          last_error?: string | null;
          status?: "PENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED_PERMANENT";
        }
      >;

      notion_field_mappings: Table<
        {
          id: string;
          user_id: string;
          internal_field: string;
          notion_property_name: string;
          notion_property_type: string;
          enabled: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          internal_field: string;
          notion_property_name: string;
          notion_property_type: string;
          enabled?: boolean;
        }
      >;

      notion_sync_history: Table<
        {
          id: string;
          user_id: string;
          trade_id: string | null;
          action: "CREATE" | "UPDATE";
          status: "SUCCESS" | "ERROR" | "RATE_LIMITED";
          http_status: number | null;
          rate_limited: boolean;
          duration_ms: number | null;
          error_message: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id?: string | null;
          action: "CREATE" | "UPDATE";
          status: "SUCCESS" | "ERROR" | "RATE_LIMITED";
          http_status?: number | null;
          rate_limited?: boolean;
          duration_ms?: number | null;
          error_message?: string | null;
        }
      >;

      trade_verifications: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          matches: boolean;
          note: string | null;
          verified_at: string;
          verified_figures: Json | null;
          figures_changed_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          matches: boolean;
          note?: string | null;
          verified_at?: string;
          verified_figures?: Json | null;
          figures_changed_at?: string | null;
        }
      >;

      notifications: Table<
        {
          id: string;
          user_id: string;
          type:
            | "SYNC_FAILURE"
            | "DISCREPANCY"
            | "UNCLASSIFIED_FILL"
            | "MISSING_CONTRACT_SPEC"
            | "CALC_UNVERIFIED"
            | "NOTION_ERROR"
            // No es una discrepancia: la aplicación está bien y quien se está
            // pasando es quien opera. Mezclarlos haría imposible filtrarlos.
            | "RISK_LIMIT"
            // Tampoco es un fallo: los números están bien, lo que falta es lo
            // que solo puedes escribir tú.
            | "JOURNAL_PENDING"
            // Coinbase cerró posición por su cuenta. Las cifras están bien y
            // no hay nada que arreglar: es un hecho que hay que saber.
            | "LIQUIDATION";
          severity: "INFO" | "WARNING" | "CRITICAL";
          title: string;
          message: string;
          related_entity_type: string | null;
          related_entity_id: string | null;
          dedup_key: string | null;
          occurrence_count: number;
          last_seen_at: string;
          is_read: boolean;
          resolved_at: string | null;
          created_at: string;
          emailed: boolean;
          emailed_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          type:
            | "SYNC_FAILURE"
            | "DISCREPANCY"
            | "UNCLASSIFIED_FILL"
            | "MISSING_CONTRACT_SPEC"
            | "CALC_UNVERIFIED"
            | "NOTION_ERROR"
            // No es una discrepancia: la aplicación está bien y quien se está
            // pasando es quien opera. Mezclarlos haría imposible filtrarlos.
            | "RISK_LIMIT"
            // Tampoco es un fallo: los números están bien, lo que falta es lo
            // que solo puedes escribir tú.
            | "JOURNAL_PENDING"
            | "LIQUIDATION";
          severity?: "INFO" | "WARNING" | "CRITICAL";
          title: string;
          message: string;
          related_entity_type?: string | null;
          related_entity_id?: string | null;
          dedup_key?: string | null;
          occurrence_count?: number;
          last_seen_at?: string;
          is_read?: boolean;
          resolved_at?: string | null;
          emailed?: boolean;
          emailed_at?: string | null;
        }
        // No restricted Update override here: the service-role client
        // (lib/notifications/create.ts) legitimately updates
        // occurrence_count/last_seen_at/message on a dedup match, while the
        // RLS-scoped client is separately expected (by convention, not by
        // a TypeScript-level restriction that RLS itself doesn't enforce
        // either -- see supabase/migrations 20260811120900_system.sql) to
        // only ever send is_read/resolved_at.
      >;

      csv_imports: Table<
        {
          id: string;
          user_id: string;
          account_id: string | null;
          filename: string;
          column_mapping: Json;
          row_count: number;
          imported_count: number;
          duplicate_count: number;
          error_count: number;
          status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          account_id?: string | null;
          filename: string;
          column_mapping?: Json;
          row_count?: number;
          imported_count?: number;
          duplicate_count?: number;
          error_count?: number;
          status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
          emailed?: boolean;
          emailed_at?: string | null;
        }
      >;

      csv_import_rows: Table<
        {
          id: string;
          user_id: string;
          csv_import_id: string;
          row_number: number;
          raw_row: Json;
          status: "PENDING" | "IMPORTED" | "DUPLICATE" | "ERROR";
          error_message: string | null;
          matched_raw_fill_id: string | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          csv_import_id: string;
          row_number: number;
          raw_row: Json;
          status?: "PENDING" | "IMPORTED" | "DUPLICATE" | "ERROR";
          error_message?: string | null;
          matched_raw_fill_id?: string | null;
        }
      >;

      position_snapshots: Table<
        {
          id: string;
          user_id: string;
          account_id: string;
          product_id: string;
          side: "LONG" | "SHORT" | "UNKNOWN" | null;
          number_of_contracts: string | null;
          avg_entry_price: string | null;
          unrealized_pnl: string | null;
          raw_payload: Json;
          snapshotted_at: string;
          sync_run_id: string | null;
          // Las dos mitades de la comparación, en las mismas unidades y con
          // signo: negativo es corto. `number_of_contracts` viene de Coinbase
          // sin signo y con la dirección aparte, que no se puede restar.
          reconstructed_size: string | null;
          venue_size: string | null;
          matches: boolean | null;
        },
        {
          id?: string;
          user_id: string;
          account_id: string;
          product_id: string;
          side?: "LONG" | "SHORT" | "UNKNOWN" | null;
          number_of_contracts?: string | number | null;
          avg_entry_price?: string | number | null;
          unrealized_pnl?: string | number | null;
          // Opcional desde que la instantánea se guarda también cuando sólo
          // se compara el tamaño: exigirlo obligaría a inventar un payload.
          raw_payload?: Json;
          snapshotted_at?: string;
          sync_run_id?: string | null;
          reconstructed_size?: string | number | null;
          venue_size?: string | number | null;
          matches?: boolean | null;
        }
      >;

      trade_price_extremes: Table<
        {
          id: string;
          user_id: string;
          trade_id: string;
          mfe_price: string | null;
          mae_price: string | null;
          mfe_pct: string | null;
          mae_pct: string | null;
          granularity_used: string | null;
          candle_source: string | null;
          is_approximate: boolean;
          unavailable_reason: string | null;
          computed_at: string;
        },
        {
          id?: string;
          user_id: string;
          trade_id: string;
          mfe_price?: string | number | null;
          mae_price?: string | number | null;
          mfe_pct?: string | number | null;
          mae_pct?: string | number | null;
          granularity_used?: string | null;
          candle_source?: string | null;
          is_approximate?: boolean;
          unavailable_reason?: string | null;
        }
      >;

      audit_log: Table<
        {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type?: string | null;
          entity_id?: string | null;
          metadata?: Json;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      /**
       * Escribe una reconstrucción completa en una sola transacción.
       *
       * El cálculo vive en `lib/reconstruction/engine.ts`, que es donde está
       * probado; esto sólo baja la escritura, que es la parte que tiene que
       * ser todo-o-nada. Ver la migración
       * `20260819180000_reconstruccion_atomica.sql`.
       */
      persist_reconstruction: {
        Args: {
          p_user_id: string;
          p_account_id: string;
          p_product_id: string;
          p_orphaned_opening_fill_ids: string[];
          p_trades: Json;
        };
        Returns: Json;
      };
      /**
       * Cambia `bot_id` de las operaciones del usuario que llama, y nada
       * más. `trades` no tiene política de UPDATE para el usuario a
       * propósito; ver `20260902120000_asignar_operaciones_a_bot.sql`.
       */
      assign_trades_to_bot: {
        Args: { p_trade_ids: string[]; p_bot_id: string | null };
        Returns: number;
      };
      /**
       * Recalcula `trades.liquidated_qty` de un producto a partir de los
       * fills de salida cuya orden es una liquidación de Coinbase. Devuelve
       * cuántas operaciones cambiaron. Ver `20260902150000_liquidaciones.sql`.
       */
      refresh_trade_liquidations: {
        Args: { p_user_id: string; p_product_id: string };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
  };
}
