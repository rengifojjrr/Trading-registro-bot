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
 * Quién trae los fills de una cuenta.
 *
 * Distinto de `TradeSource`, que dice de dónde salió **una operación** ya
 * escrita. Esto dice a quién hay que preguntar para que aparezcan más, y sólo
 * los dos primeros tienen a quién: `MANUAL` es lo que entró por CSV, Notion o a
 * mano, y `SEED` son los datos inventados del guion de siembra.
 */
export type AccountConnector = "COINBASE" | "BYBIT_DEMO" | "MANUAL" | "SEED";

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
  | "ETIQUETA"
  // La persona de tus proyectos tiene su ficha, con comentarios y papelera.
  | "PERSONA";

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

// ------------------------------------------------ Proyectos de verdad (E1)
// Espejan los check de `20261006120000_proyectos_de_verdad.sql`.

export type ProjectStatus =
  | "IDEA"
  | "EN_MARCHA"
  | "ESPERANDO"
  | "ATASCADO"
  | "EN_PAUSA"
  | "TERMINADO"
  | "DESCARTADO";

export type ProjectHealth = "VERDE" | "AMARILLO" | "ROJO";

/** Cuánto de un proyecto sube a la nube. Hoy sólo se construye `COMPLETA`. */
export type CloudLevel = "COMPLETA" | "TITULOS" | "RESERVADO";

/** Quién escribió un texto entero: «Cómo va», la ficha. */
export type AuthorKind = "OWNER" | "CLAUDE" | "BOT";

/**
 * Quién escribió cada campo de una fila: tú en la aplicación, un archivo de
 * Claude o el bot. Importar nunca pisa un campo `owner`.
 */
export type FieldAuthor = "owner" | "claude" | "bot";
export type FieldSrc = Record<string, FieldAuthor>;

// ------------------------------------------------ El puente con el bot (E4)
// Espejan los check de `20261006200000_el_puente_con_el_bot.sql`.

/** Quién habla por el puente: el bot en la Mac, el bot en un servidor, Claude Code. */
export type PuenteCliente = "mac-1" | "vps-1" | "claude-1";

export type InboxKind =
  | "TAREA"
  | "AVANCE"
  | "DECISION"
  | "HITO"
  | "PERSONA"
  | "MIEMBRO"
  | "FUENTE"
  | "COMO_VA"
  | "CIERRE"
  | "ORDEN";

export type InboxStatus = "ABIERTA" | "ACEPTADA" | "DESCARTADA" | "CADUCADA";

export type PersonCircle = "FAMILIA" | "AMIGOS" | "TRABAJO" | "CLIENTES" | "SERVICIOS" | "OTROS";
export type MemberSide = "NOSOTROS" | "CONTRAPARTE" | "ASESOR" | "OTRO";
export type MilestoneKind = "ETAPA" | "HITO";
export type MilestoneStatus = "PENDIENTE" | "EN_CURSO" | "HECHO" | "BLOQUEADO" | "SALTADO";
export type DuePrecision = "DIA" | "SEMANA" | "MES" | "TRIMESTRE";

/** De dónde salió una tarea. Nulo en las de antes de que existiera. */
export type TaskOrigin =
  | "A_MANO"
  | "NOTION"
  | "WHATSAPP"
  | "VOZ"
  | "CLAUDE"
  | "ANALISIS"
  | "REUNION"
  | "LLAMADA"
  | "IMPORTAR";

/** El tipo de la evidencia de una tarea. La evidencia en sí nunca sube. */
export type SourceKind = "LLAMADA" | "REUNION" | "MENSAJE" | "DICTADO" | "DOCUMENTO" | "CLAUDE";

export type LogKind =
  | "NOTA"
  | "AVANCE"
  | "DECISION"
  | "BLOQUEO"
  | "LLAMADA"
  | "REUNION"
  | "MENSAJE"
  | "ESTADO";

export type ProjectDocKind = "FICHA" | "HOJA_DE_RUTA" | "ACTA" | "NOTA" | "OTRO";

export type ProjectSourceKind =
  | "CHAT"
  | "GRUPO"
  | "LLAMADA"
  | "REUNION"
  | "DOCUMENTO"
  | "ENLACE"
  | "ARCHIVO_MAC";

/**
 * Lo que se archiva al borrar, para poder devolverlo con su mismo
 * identificador. Los hijos van dentro porque restaurar una comida sin sus
 * ingredientes sería devolver un nombre vacío.
 */
export interface TrashPayload {
  row: Record<string, Json>;
  children?: Record<string, Record<string, Json>[]>;
  /** Filas que apuntaban a ésta (`tabla.columna` → ids) y se vuelven a enlazar al restaurar. */
  relinks?: { table: string; column: string; ids: string[] }[];
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
          /** `finca-el-roble`: único por usuario. Nulo en los proyectos de antes. */
          slug: string | null;
          aliases: string[];
          status: ProjectStatus;
          /** Nulo = lo calcula la aplicación. Puesto a mano vale hasta `health_until`. */
          health: ProjectHealth | null;
          health_until: string | null;
          objective: string | null;
          /** «Cómo va», en un párrafo. */
          how_md: string | null;
          how_at: string | null;
          how_by: AuthorKind | null;
          cloud_level: CloudLevel;
          started_on: string | null;
          target_on: string | null;
          closed_on: string | null;
          field_src: FieldSrc;
          ext_source: string | null;
          ext_id: string | null;
          /** La sube un disparador en cada cambio. */
          version: number;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          color?: ProjectColor | null;
          icon?: string | null;
          is_active?: boolean;
          sort_order?: number;
          slug?: string | null;
          aliases?: string[];
          status?: ProjectStatus;
          health?: ProjectHealth | null;
          health_until?: string | null;
          objective?: string | null;
          how_md?: string | null;
          how_at?: string | null;
          how_by?: AuthorKind | null;
          cloud_level?: CloudLevel;
          started_on?: string | null;
          target_on?: string | null;
          closed_on?: string | null;
          field_src?: FieldSrc;
          ext_source?: string | null;
          ext_id?: string | null;
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
          /** La fila «Yo» de core_people = tuya; nulo = sin asignar. */
          assignee_id: string | null;
          with_ids: string[];
          stream_id: string | null;
          milestone_id: string | null;
          /** Subtareas, un nivel. */
          parent_id: string | null;
          /** Nulo en las tareas de antes de que existiera la columna. */
          origin: TaskOrigin | null;
          source_kind: SourceKind | null;
          /** Opaca. Nunca el texto de un mensaje. */
          source_ref: string | null;
          source_label: string | null;
          source_at: string | null;
          field_src: FieldSrc;
          /** Los títulos que tuvo antes de renombrarla: el importador casa con ellos. */
          former_titles: string[];
          ext_source: string | null;
          ext_id: string | null;
          version: number;
        },
        {
          id?: string;
          user_id: string;
          project_id?: string | null;
          title: string;
          former_titles?: string[];
          assignee_id?: string | null;
          with_ids?: string[];
          stream_id?: string | null;
          milestone_id?: string | null;
          parent_id?: string | null;
          origin?: TaskOrigin | null;
          source_kind?: SourceKind | null;
          source_ref?: string | null;
          source_label?: string | null;
          source_at?: string | null;
          field_src?: FieldSrc;
          ext_source?: string | null;
          ext_id?: string | null;
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

      // ------------------------------------- Vida: proyectos de verdad (E1)

      /** Personas que entran en algo tuyo. Nunca la agenda ni teléfonos enteros. */
      core_people: Table<
        {
          id: string;
          user_id: string;
          name: string;
          aliases: string[];
          is_owner: boolean;
          relation: string | null;
          org: string | null;
          circle: PersonCircle | null;
          note: string | null;
          /** El enlace verificado con su WhatsApp. Sólo lo pone el bot. */
          has_whatsapp: boolean;
          /** Lo que dijiste tú: si tiene WhatsApp. No enlaza nada. */
          whatsapp_hint: "SI" | "NO" | null;
          phone_tail: string | null;
          color: ProjectColor | null;
          archived_at: string | null;
          field_src: FieldSrc;
          ext_source: string | null;
          ext_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          name: string;
          aliases?: string[];
          is_owner?: boolean;
          relation?: string | null;
          org?: string | null;
          circle?: PersonCircle | null;
          note?: string | null;
          whatsapp_hint?: "SI" | "NO" | null;
          /** Sólo lo cambia el bot por el puente, tras el «sí» escrito del dueño. */
          has_whatsapp?: boolean;
          phone_tail?: string | null;
          color?: ProjectColor | null;
          archived_at?: string | null;
          field_src?: FieldSrc;
          ext_source?: string | null;
          ext_id?: string | null;
        }
      >;

      tasks_project_members: Table<
        {
          id: string;
          user_id: string;
          project_id: string;
          person_id: string;
          role: string | null;
          does_md: string | null;
          side: MemberSide | null;
          is_lead: boolean;
          since: string | null;
          active: boolean;
          sort_order: number;
          field_src: FieldSrc;
          ext_source: string | null;
          ext_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          project_id: string;
          person_id: string;
          role?: string | null;
          does_md?: string | null;
          side?: MemberSide | null;
          is_lead?: boolean;
          since?: string | null;
          active?: boolean;
          sort_order?: number;
          field_src?: FieldSrc;
          ext_source?: string | null;
          ext_id?: string | null;
        }
      >;

      tasks_streams: Table<
        {
          id: string;
          user_id: string;
          project_id: string;
          name: string;
          lead_person_id: string | null;
          sort_order: number;
          active: boolean;
          field_src: FieldSrc;
          ext_source: string | null;
          ext_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          project_id: string;
          name: string;
          lead_person_id?: string | null;
          sort_order?: number;
          active?: boolean;
          field_src?: FieldSrc;
          ext_source?: string | null;
          ext_id?: string | null;
        }
      >;

      tasks_milestones: Table<
        {
          id: string;
          user_id: string;
          project_id: string;
          kind: MilestoneKind;
          /** La etapa de un hito. Las etapas no cuelgan de nada. */
          stage_id: string | null;
          title: string;
          detail: string | null;
          starts_on: string | null;
          due_on: string | null;
          due_precision: DuePrecision;
          status: MilestoneStatus;
          blocked_why: string | null;
          done_at: string | null;
          owner_person_id: string | null;
          sort_order: number;
          field_src: FieldSrc;
          /** Los títulos que tuvo antes de renombrarlo: el importador casa con ellos. */
          former_titles: string[];
          ext_source: string | null;
          ext_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          project_id: string;
          kind: MilestoneKind;
          stage_id?: string | null;
          title: string;
          detail?: string | null;
          starts_on?: string | null;
          due_on?: string | null;
          due_precision?: DuePrecision;
          status?: MilestoneStatus;
          blocked_why?: string | null;
          done_at?: string | null;
          owner_person_id?: string | null;
          sort_order?: number;
          field_src?: FieldSrc;
          former_titles?: string[];
          ext_source?: string | null;
          ext_id?: string | null;
        }
      >;

      tasks_project_log: Table<
        {
          id: string;
          user_id: string;
          project_id: string;
          /** Cuándo pasó, que no es cuándo se apuntó. */
          at: string;
          kind: LogKind;
          title: string;
          body: string | null;
          person_ids: string[];
          source_kind: SourceKind | null;
          source_ref: string | null;
          source_label: string | null;
          origin: TaskOrigin;
          /** Lo apuntó la aplicación sola (un cambio de estado). */
          auto: boolean;
          ext_source: string | null;
          ext_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          project_id: string;
          at?: string;
          kind: LogKind;
          title: string;
          body?: string | null;
          person_ids?: string[];
          source_kind?: SourceKind | null;
          source_ref?: string | null;
          source_label?: string | null;
          origin?: TaskOrigin;
          auto?: boolean;
          ext_source?: string | null;
          ext_id?: string | null;
        }
      >;

      tasks_project_docs: Table<
        {
          id: string;
          user_id: string;
          project_id: string;
          kind: ProjectDocKind;
          title: string;
          body_md: string;
          made_by: AuthorKind;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          project_id: string;
          kind: ProjectDocKind;
          title: string;
          body_md: string;
          made_by: AuthorKind;
        }
      >;

      /** Las versiones anteriores de un documento. Las escribe un disparador. */
      tasks_project_doc_versions: Table<
        {
          doc_id: string;
          user_id: string;
          version: number;
          body_md: string;
          made_by: AuthorKind;
          created_at: string;
        },
        {
          doc_id: string;
          user_id: string;
          version: number;
          body_md: string;
          made_by: AuthorKind;
          created_at?: string;
        }
      >;

      tasks_project_sources: Table<
        {
          id: string;
          user_id: string;
          project_id: string;
          kind: ProjectSourceKind;
          label: string;
          /** Opaca (del bot), una dirección web o un adjunto. */
          ref: string | null;
          lives: "NUBE" | "MAC";
          person_ids: string[];
          at: string | null;
          duration_sec: number | null;
          confirmed: boolean;
          origin: TaskOrigin;
          ext_source: string | null;
          ext_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          project_id: string;
          kind: ProjectSourceKind;
          label: string;
          ref?: string | null;
          lives: "NUBE" | "MAC";
          person_ids?: string[];
          at?: string | null;
          duration_sec?: number | null;
          confirmed?: boolean;
          origin?: TaskOrigin;
          ext_source?: string | null;
          ext_id?: string | null;
        }
      >;

      // ------------------------------------------ El puente con el bot (E4)
      // Ver supabase/migrations/20261006200000_el_puente_con_el_bot.sql.

      /** Para revisar: lo que el bot propone, con título corto y tapado. */
      core_inbox: Table<
        {
          id: string;
          user_id: string;
          kind: InboxKind;
          project_id: string | null;
          alt_project_ids: string[];
          title: string;
          payload: Json;
          confidence: "FIRME" | "DUDOSA";
          why: string | null;
          source_kind: SourceKind | null;
          /** Opaca: sólo la abre el panel de la Mac. */
          source_ref: string | null;
          source_label: string | null;
          source_at: string | null;
          status: InboxStatus;
          decided_at: string | null;
          decided_via: "WEB" | "WHATSAPP" | "VOZ" | "CLAUDE" | null;
          dismiss_reason: "NO_ES_TAREA" | "OTRO_PROYECTO" | "YA_HECHA" | "OTRO" | null;
          result_kind: string | null;
          result_id: string | null;
          expires_at: string;
          ext_source: string | null;
          ext_id: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          kind: InboxKind;
          project_id?: string | null;
          alt_project_ids?: string[];
          title: string;
          payload?: Json;
          confidence?: "FIRME" | "DUDOSA";
          why?: string | null;
          source_kind?: SourceKind | null;
          source_ref?: string | null;
          source_label?: string | null;
          source_at?: string | null;
          status?: InboxStatus;
          decided_at?: string | null;
          decided_via?: "WEB" | "WHATSAPP" | "VOZ" | "CLAUDE" | null;
          dismiss_reason?: "NO_ES_TAREA" | "OTRO_PROYECTO" | "YA_HECHA" | "OTRO" | null;
          result_kind?: string | null;
          result_id?: string | null;
          expires_at?: string;
          ext_source?: string | null;
          ext_id?: string | null;
        }
      >;

      /** Sal y huella de cada llave del puente: la llave se deriva, no se guarda. Sólo el rol de servicio. */
      puente_llaves: Table<
        {
          id: string;
          user_id: string;
          cliente: PuenteCliente;
          sal: string;
          huella: string;
          etiqueta: string | null;
          creada_en: string;
          usada_en: string | null;
          revocada_en: string | null;
        },
        {
          id?: string;
          user_id: string;
          cliente: PuenteCliente;
          sal: string;
          huella: string;
          etiqueta?: string | null;
          usada_en?: string | null;
          revocada_en?: string | null;
        }
      >;

      /** Nonces gastados (15 min). Sólo los toca `puente_usar_nonce`. */
      puente_nonces: Table<
        { llave_id: string; nonce: string; visto_en: string },
        { llave_id: string; nonce: string; visto_en?: string }
      >;

      /** El latido de cada cliente. El dueño lo lee (la tarjeta de WhatsApp); escribe sólo el puente. */
      puente_clientes: Table<
        {
          user_id: string;
          cliente: PuenteCliente;
          visto_en: string | null;
          estado_en: string | null;
          boot_id: string | null;
          boot_anterior: string | null;
          boot_cambio_en: string | null;
          dos_motores_en: string | null;
          version: string | null;
          panel_url: string | null;
          wa_conectado: boolean | null;
          donde: "MAC" | "SERVIDOR" | null;
        },
        {
          user_id: string;
          cliente: PuenteCliente;
          visto_en?: string | null;
          estado_en?: string | null;
          boot_id?: string | null;
          boot_anterior?: string | null;
          boot_cambio_en?: string | null;
          dos_motores_en?: string | null;
          version?: string | null;
          panel_url?: string | null;
          wa_conectado?: boolean | null;
          donde?: "MAC" | "SERVIDOR" | null;
        }
      >;

      /** Operaciones ya aplicadas y su resultado: un reenvío devuelve lo mismo. */
      puente_ops: Table<
        {
          op_id: string;
          user_id: string;
          cliente: PuenteCliente;
          kind: string;
          aplicada_en: string;
          resultado: Json;
        },
        {
          op_id: string;
          user_id: string;
          cliente: PuenteCliente;
          kind: string;
          aplicada_en?: string;
          resultado: Json;
        }
      >;

      /** El feed: qué fila cambió y cuándo (la llenan disparadores). */
      puente_cambios: Table<
        {
          seq: number;
          user_id: string;
          entidad: string;
          entidad_id: string;
          op: "upsert" | "delete";
          version: number | null;
          por: PuenteCliente | null;
          cambiado_en: string;
        },
        {
          user_id: string;
          entidad: string;
          entidad_id: string;
          op: "upsert" | "delete";
          version?: number | null;
          por?: PuenteCliente | null;
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
          /**
           * Quién trae los fills de esta cuenta, que es otra pregunta que si
           * el dinero es real (eso es `is_demo`). Sólo `COINBASE` y
           * `BYBIT_DEMO` se consultan. Ver
           * `20260923130000_de_donde_salen_los_fills_de_una_cuenta.sql`.
           */
          connector: AccountConnector;
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
          connector?: AccountConnector;
          is_active?: boolean;
        }
      >;

      /**
       * El calendario económico. Tabla de referencia, sin `user_id`: que la
       * Reserva Federal decida tipos el miércoles es un hecho del mundo, no
       * un dato de nadie. Ver la migración 20260909120000.
       */
      /**
       * Los titulares que no están en ningún calendario.
       *
       * De referencia, como `economic_events`: sin `user_id`, la escribe la
       * sincronización con el rol de servicio y la lee cualquiera que haya
       * entrado. Un titular de Reuters no es de nadie.
       */
      market_news: Table<
        {
          id: string;
          source: string;
          source_news_id: string;
          published_at: string;
          title: string;
          provider: string | null;
          url: string | null;
          summary: string | null;
          symbols: string[];
          topics: string[];
          /** Qué hizo el precio después, medido sobre velas de un minuto. */
          move_pct_1h: string | null;
          max_move_pct_1h: string | null;
          measured_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          source?: string;
          source_news_id: string;
          published_at: string;
          title: string;
          provider?: string | null;
          url?: string | null;
          summary?: string | null;
          symbols?: string[];
          topics?: string[];
          move_pct_1h?: string | number | null;
          max_move_pct_1h?: string | number | null;
          measured_at?: string | null;
        }
      >;

      economic_events: Table<
        {
          id: string;
          source: string;
          source_event_id: string;
          occurs_at: string;
          country: string;
          currency: string | null;
          title: string;
          indicator: string | null;
          category: string | null;
          /** -1 baja, 0 media, 1 alta: la escala de la fuente, sin traducir. */
          importance: number;
          period: string | null;
          actual: string | null;
          forecast: string | null;
          previous: string | null;
          unit: string | null;
          scale: string | null;
          comment: string | null;
          source_name: string | null;
          source_url: string | null;
          raw_payload: Json;
          fetched_at: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          source?: string;
          source_event_id: string;
          occurs_at: string;
          country: string;
          currency?: string | null;
          title: string;
          indicator?: string | null;
          category?: string | null;
          importance?: number;
          period?: string | null;
          actual?: string | number | null;
          forecast?: string | number | null;
          previous?: string | number | null;
          unit?: string | null;
          scale?: string | null;
          comment?: string | null;
          source_name?: string | null;
          source_url?: string | null;
          raw_payload?: Json;
          fetched_at?: string;
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
          /**
           * Precio medio de los contratos que siguen abiertos, cerrando el
           * lote más antiguo primero (FIFO): el «precio de entrada» que
           * enseña Coinbase para la posición. Null cuando no queda nada.
           */
          open_lots_wap: string | null;
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
          /**
           * Si el dinero era ficticio. La deriva un disparador de
           * `accounts.is_demo`: escribirla no sirve de nada. Ver
           * `20260923120000_el_dinero_de_papel_no_se_suma_al_real.sql`.
           */
          is_paper: boolean;
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
          open_lots_wap?: string | number | null;
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
      /** La última medición de cada estrategia de la biblioteca, por usuario.
       *  Ver supabase/migrations/20260917160000_medir_las_estrategias_de_la_biblioteca.sql */
      /**
       * Dato de referencia compartido, sin `user_id`: la miden la biblioteca
       * (que es código), las velas públicas y un motor determinista, así que
       * la respuesta es la misma para todo el mundo. Sólo la escribe el rol de
       * servicio. Ver `20260917210000_lo_medido_no_es_de_nadie.sql`.
       */
      strategy_measurements: Table<
        {
          id: string;
          slug: string;
          pnl_pct: string;
          dd_pct: string;
          trades: number;
          profit_factor: string | null;
          market: string;
          timeframe: string;
          velas: number;
          desde: string;
          hasta: string;
          comision_pct: string;
          measured_at: string;
        },
        {
          id?: string;
          slug: string;
          pnl_pct: number | string;
          dd_pct: number | string;
          trades: number;
          profit_factor?: number | string | null;
          market: string;
          timeframe: string;
          velas: number;
          desde: string;
          hasta: string;
          comision_pct: number | string;
          measured_at?: string;
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
          descripcion_larga: string | null;
          familia_operativa: string | null;
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
          descripcion_larga?: string | null;
          familia_operativa?: string | null;
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
          descripcion_larga?: string | null;
          familia_operativa?: string | null;
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

      // El simulador en papel. Ver supabase/migrations/20260903100000_paper_trading.sql.
      //
      // Todas las columnas `numeric` llegan como `string` en Row: postgrest las
      // serializa así para no perder precisión en números que no caben en un
      // double. Al escribir se acepta `string | number` porque el cliente
      // convierte. Tratar un Row como si trajera números es el error fácil aquí:
      // `equity + pnl` sobre dos strings concatena en vez de sumar.
      paper_settings: Table<
        {
          user_id: string;
          comision_pct: string;
          deslizamiento_pct: string;
          capital_por_defecto: string;
          created_at: string;
          updated_at: string;
        },
        {
          user_id: string;
          comision_pct?: string | number;
          deslizamiento_pct?: string | number;
          capital_por_defecto?: string | number;
        }
      >;

      paper_accounts: Table<
        {
          id: string;
          user_id: string;
          bot_id: string;
          enabled: boolean;
          capital_asignado: string;
          efectivo: string;
          equity: string;
          started_at: string | null;
          last_tick_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          bot_id: string;
          enabled?: boolean;
          capital_asignado: string | number;
          efectivo: string | number;
          equity: string | number;
          started_at?: string | null;
          last_tick_at?: string | null;
        }
      >;

      paper_positions: Table<
        {
          id: string;
          user_id: string;
          bot_id: string;
          side: string;
          size: string;
          precio_entrada: string;
          hora_entrada: string;
          stop: string | null;
          objetivo: string | null;
          atr_entrada: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          user_id: string;
          bot_id: string;
          side: string;
          size: string | number;
          precio_entrada: string | number;
          hora_entrada?: string;
          stop?: string | number | null;
          objetivo?: string | number | null;
          atr_entrada?: string | number | null;
          status?: string;
        }
      >;

      paper_trades: Table<
        {
          id: string;
          user_id: string;
          bot_id: string;
          position_id: string | null;
          side: string;
          size: string;
          precio_entrada: string;
          hora_entrada: string;
          precio_salida: string;
          hora_salida: string;
          pnl: string;
          pnl_pct: string;
          comision: string;
          motivo_salida: string;
          barras_en_mercado: number | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          bot_id: string;
          position_id?: string | null;
          side: string;
          size: string | number;
          precio_entrada: string | number;
          hora_entrada: string;
          precio_salida: string | number;
          hora_salida: string;
          pnl: string | number;
          pnl_pct: string | number;
          comision?: string | number;
          motivo_salida: string;
          barras_en_mercado?: number | null;
        }
      >;

      paper_equity_points: Table<
        {
          id: string;
          user_id: string;
          bot_id: string;
          ts: string;
          equity: string;
        },
        {
          id?: string;
          user_id: string;
          bot_id: string;
          ts?: string;
          equity: string | number;
        }
      >;

      // Una fila, sin políticas: la lee el rol de servicio (la ruta del ciclo)
      // y postgres (pg_cron). Ver supabase/migrations/20260903170000_paper_cron.sql.
      paper_cron_secret: Table<
        {
          id: number;
          secret: string;
          created_at: string;
          rotated_at: string | null;
        },
        {
          id?: number;
          secret: string;
          rotated_at?: string | null;
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
          survey_closed_at: string | null;
          /** El plan que se ofreció para esta operación, se confirmara o no. */
          plan_id: string | null;
          /** Si es la operación que ese plan planificaba. Null = sin preguntar. */
          plan_followed: boolean | null;
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
          survey_closed_at?: string | null;
          plan_id?: string | null;
          plan_followed?: boolean | null;
        }
      >;

      /**
       * Lo que pensabas **antes** de entrar.
       *
       * Existe sin operación a propósito: planificar y no entrar también es un
       * dato, y de los buenos. Lo une a una operación una persona, en la
       * encuesta del cierre, porque no se puede deducir del producto y la hora.
       */
      trade_plans: Table<
        {
          id: string;
          user_id: string;
          created_at: string;
          updated_at: string;
          product_id: string | null;
          direction: "LONG" | "SHORT" | null;
          idea: string | null;
          entry_price: string | null;
          stop_price: string | null;
          target_price: string | null;
          risk_amount: string | null;
          emotional_state: string | null;
          screenshot_path: string | null;
          discarded_at: string | null;
        },
        {
          id?: string;
          user_id: string;
          product_id?: string | null;
          direction?: "LONG" | "SHORT" | null;
          idea?: string | null;
          entry_price?: string | number | null;
          stop_price?: string | number | null;
          target_price?: string | number | null;
          risk_amount?: string | number | null;
          emotional_state?: string | null;
          screenshot_path?: string | null;
          discarded_at?: string | null;
          updated_at?: string;
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
          /**
           * De quién es el dibujo: de una operación o de una publicación
           * macro. Exactamente uno de los dos, garantizado por la restricción
           * `chart_drawings_un_solo_dueno` de la tabla.
           */
          trade_id: string | null;
          event_id: string | null;
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
          trade_id?: string | null;
          event_id?: string | null;
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
       * Gasta un nonce del puente: true la primera vez, false si se repite.
       * Sólo el rol de servicio. Ver `20261006200000_el_puente_con_el_bot.sql`.
       */
      puente_usar_nonce: {
        Args: { p_llave: string; p_nonce: string };
        Returns: boolean;
      };
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
      /**
       * La mayor caída desde máximo de la curva de todos los bots de papel
       * sumados, sobre toda la historia.
       *
       * Sin `user_id`: es `security invoker` y suma lo que las RLS dejan ver,
       * que es lo del que llama. Devuelve una fila, o ninguna cuando no hay
       * curva que medir. Ver
       * `20260917180000_la_caida_conjunta_sobre_toda_la_curva.sql`.
       */
      paper_caida_maxima_conjunta: {
        Args: Record<string, never>;
        Returns: {
          caida_pct: string;
          pico: string;
          pico_ts: string;
          valle: string;
          valle_ts: string;
        }[];
      };
    };
    Enums: Record<string, never>;
  };
}
