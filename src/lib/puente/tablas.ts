/**
 * La lista blanca del puente: qué tablas puede tocar, con qué funciones, y qué
 * columnas salen hacia el bot.
 *
 * Las rutas del puente usan la clave de servicio, que se salta todas las RLS:
 * un fallo aquí podría leer o escribir cualquier cosa (el trading, el sueño…).
 * Por eso lo que el puente toca está escrito en esta lista y nada más, y
 * `tablas.test.ts` lee todo `src/lib/puente/**` y `src/app/api/puente/**` y
 * falla si aparece un `.from()` o un `.rpc()` que no esté aquí, o SQL libre.
 */

/** Las tablas que el puente lee o escribe. */
export const TABLAS_DEL_PUENTE = [
  // Lo del dueño que el bot puede ver y cambiar.
  "tasks_projects",
  "tasks_items",
  "core_people",
  "tasks_project_members",
  "tasks_streams",
  "tasks_milestones",
  "tasks_project_log",
  "tasks_project_docs",
  "tasks_project_sources",
  "core_inbox",
  // Llegan con los recordatorios (E2): si la tabla no existe, la operación
  // espera en la bandeja del bot («no_disponible»).
  "core_reminders",
  "core_reminder_fires",
  // Cifras del día de WhatsApp: sólo números.
  "core_daily_metrics",
  // La zona del dueño, para las fechas.
  "app_settings",
  // Las del propio puente.
  "puente_llaves",
  "puente_clientes",
  "puente_ops",
  "puente_cambios",
] as const;

export type TablaDelPuente = (typeof TABLAS_DEL_PUENTE)[number];

/** Las funciones de la base que el puente puede llamar. Ninguna más. */
export const FUNCIONES_DEL_PUENTE = ["puente_usar_nonce"] as const;

/** Entidad del feed → su tabla y las columnas que salen hacia el bot. */
export const ENTIDADES = {
  proyecto: {
    tabla: "tasks_projects",
    columnas: [
      "id", "name", "slug", "aliases", "status", "health", "health_until", "objective", "how_md", "how_at", "how_by",
      "cloud_level", "started_on", "target_on", "closed_on", "color", "icon", "is_active", "ext_source", "ext_id",
      "version", "updated_at",
    ],
  },
  tarea: {
    tabla: "tasks_items",
    // Sin `notes`, `description` ni `categories`: el bot no los necesita y todo
    // lo que llega al bot puede acabar en una consulta a una IA.
    columnas: [
      "id", "project_id", "parent_id", "title", "status", "priority", "due_date", "assignee_id", "with_ids",
      "stream_id", "milestone_id", "origin", "source_kind", "source_ref", "source_label", "source_at",
      "completed_at", "ext_source", "ext_id", "version", "updated_at",
    ],
  },
  persona: {
    tabla: "core_people",
    // Sin la nota del dueño ni las cuatro cifras del teléfono.
    columnas: [
      "id", "name", "aliases", "is_owner", "relation", "org", "circle", "has_whatsapp", "whatsapp_hint",
      "archived_at", "ext_source", "ext_id", "version", "updated_at",
    ],
  },
  miembro: {
    tabla: "tasks_project_members",
    columnas: ["id", "project_id", "person_id", "role", "does_md", "side", "is_lead", "active", "version", "updated_at"],
  },
  frente: {
    tabla: "tasks_streams",
    columnas: ["id", "project_id", "name", "lead_person_id", "active", "version", "updated_at"],
  },
  hito: {
    tabla: "tasks_milestones",
    columnas: [
      "id", "project_id", "kind", "stage_id", "title", "starts_on", "due_on", "due_precision", "status",
      "owner_person_id", "done_at", "version", "updated_at",
    ],
  },
  bitacora: {
    tabla: "tasks_project_log",
    // El texto de una entrada no sale: el título basta para «qué pasó».
    columnas: ["id", "project_id", "at", "kind", "title", "person_ids", "source_kind", "source_ref", "origin", "auto", "version"],
  },
  doc: {
    tabla: "tasks_project_docs",
    // La ficha entera no viaja por el feed: el bot la pide aparte si la necesita.
    columnas: ["id", "project_id", "kind", "title", "made_by", "version", "updated_at"],
  },
  fuente: {
    tabla: "tasks_project_sources",
    columnas: [
      "id", "project_id", "kind", "label", "ref", "lives", "person_ids", "at", "duration_sec", "confirmed",
      "origin", "version",
    ],
  },
  propuesta: {
    tabla: "core_inbox",
    columnas: [
      "id", "kind", "project_id", "alt_project_ids", "title", "confidence", "status", "decided_at", "decided_via",
      "dismiss_reason", "result_kind", "result_id", "source_kind", "source_ref", "expires_at", "ext_source",
      "ext_id", "version",
    ],
  },
  recordatorio: {
    tabla: "core_reminders",
    columnas: [
      "id", "text", "kind", "entity_kind", "entity_id", "freq", "every_n", "at_time", "days", "monthday",
      "on_date", "until_date", "tz", "channels", "lock_private", "quiet", "active", "snooze_until", "next_fire_at",
      "ext_source", "ext_id", "version",
    ],
  },
} as const satisfies Record<string, { tabla: TablaDelPuente; columnas: readonly string[] }>;

export type Entidad = keyof typeof ENTIDADES;

export const NOMBRES_DE_ENTIDAD = Object.keys(ENTIDADES) as Entidad[];

export function esEntidad(valor: unknown): valor is Entidad {
  return typeof valor === "string" && Object.prototype.hasOwnProperty.call(ENTIDADES, valor);
}

/** Sólo las columnas de la lista, en su orden. Lo que sobre se queda fuera. */
export function recortarFila(entidad: Entidad, fila: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const columna of ENTIDADES[entidad].columnas) {
    salida[columna] = Object.prototype.hasOwnProperty.call(fila, columna) ? fila[columna] : null;
  }
  return salida;
}
