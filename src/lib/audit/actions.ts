/**
 * The audit vocabulary, kept free of any server-only import.
 *
 * `log.ts` is `server-only` because it writes with the service-role client;
 * the labels below are needed by the activity page's rendering too. Same
 * split as lib/analytics/trade-sort.ts, and for the same reason: pulling a
 * `server-only` module into client-reachable code is a build error waiting
 * to happen.
 */

/**
 * Closed set on purpose. A free-form string would drift into three
 * spellings of the same event and make the log unqueryable within a month.
 */
export const AUDIT_ACTIONS = [
  "FILL_EXCLUDED",
  "OVERRIDE_UNDONE",
  "TRADES_MERGED",
  "PRODUCT_RECALCULATED",
  "CONTRACT_SIZE_DECLARED",
  "CSV_IMPORTED",
  "TRADE_VERIFIED",
  "VERIFICATION_CLEARED",
  "AUTO_SYNC_TOGGLED",
  "SETTINGS_UPDATED",
  "STRATEGY_CREATED",
  "STRATEGY_UPDATED",
  "STRATEGY_DELETED",
  "TAG_CREATED",
  "TAG_RENAMED",
  "TAG_DELETED",
  "JOURNAL_SAVED",
  "MANUAL_SYNC_TRIGGERED",
  "BACKUP_EXPORTED",
  "BACKUP_VERIFIED",
  "VERIFIED_FIGURES_CHANGED",
  "RISK_LIMITS_UPDATED",
  "COINBASE_KEY_ROTATED",
  "BACKFILL_REQUESTED",
  "TRADE_DELETED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  FILL_EXCLUDED: "Fill excluido del cálculo",
  OVERRIDE_UNDONE: "Corrección deshecha",
  TRADES_MERGED: "Operaciones fundidas en una",
  PRODUCT_RECALCULATED: "Producto recalculado",
  CONTRACT_SIZE_DECLARED: "Tamaño de contrato declarado a mano",
  CSV_IMPORTED: "Importación CSV",
  TRADE_VERIFIED: "Operación revisada contra Coinbase",
  VERIFICATION_CLEARED: "Revisión borrada",
  AUTO_SYNC_TOGGLED: "Sincronización automática cambiada",
  SETTINGS_UPDATED: "Configuración guardada",
  COINBASE_KEY_ROTATED: "Clave de Coinbase rotada",
  BACKFILL_REQUESTED: "Rebackfill del histórico solicitado",
  TRADE_DELETED: "Operación borrada",
  STRATEGY_CREATED: "Estrategia creada",
  STRATEGY_UPDATED: "Estrategia editada",
  STRATEGY_DELETED: "Estrategia eliminada",
  TAG_CREATED: "Etiqueta creada",
  TAG_RENAMED: "Etiqueta renombrada",
  TAG_DELETED: "Etiqueta eliminada",
  JOURNAL_SAVED: "Diario guardado",
  MANUAL_SYNC_TRIGGERED: "Sincronización manual",
  BACKUP_EXPORTED: "Respaldo exportado",
  BACKUP_VERIFIED: "Respaldo comprobado",
  VERIFIED_FIGURES_CHANGED: "Cambiaron cifras ya verificadas",
  RISK_LIMITS_UPDATED: "Límites de riesgo actualizados",
};
