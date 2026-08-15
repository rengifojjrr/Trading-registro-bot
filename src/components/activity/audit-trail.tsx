import { Badge } from "@/components/ui/badge";
import { AUDIT_ACTION_LABELS, type AuditAction } from "@/lib/audit/actions";
import { formatDateTime } from "@/lib/format";

export interface AuditRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: unknown;
  created_at: string;
}

/**
 * Every deliberate change a person made, newest first.
 *
 * The point is answering "why does this number look different from last
 * month" six months from now, so each row shows the values that actually
 * moved rather than a generic "settings were updated".
 */
export function AuditTrail({ rows, timezone }: { rows: AuditRow[]; timezone: string }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no has hecho ninguna corrección manual. Cuando excluyas un fill, declares un tamaño de
        contrato o marques una operación como revisada, quedará registrado aquí.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="font-medium">
              {AUDIT_ACTION_LABELS[row.action as AuditAction] ?? row.action}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatDateTime(row.created_at, timezone)}
              {row.entity_id ? ` · ${truncateId(row.entity_id)}` : ""}
            </span>
            {describeMetadata(row.metadata) ? (
              <span className="text-xs text-muted-foreground">{describeMetadata(row.metadata)}</span>
            ) : null}
          </div>
          {row.entity_type ? <Badge variant="outline">{row.entity_type}</Badge> : null}
        </div>
      ))}
    </div>
  );
}

/** A uuid in full is noise; the first segment is enough to correlate with a row. */
function truncateId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

/**
 * Renders the metadata as a short factual line. Deliberately not a JSON
 * dump: this is read by a person trying to remember what they did, not by a
 * debugger.
 */
function describeMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const entries = Object.entries(metadata as Record<string, unknown>).filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  if (entries.length === 0) return null;

  return entries
    .slice(0, 4)
    .map(([key, value]) => `${METADATA_LABELS[key] ?? key}: ${formatValue(value)}`)
    .join(" · ");
}

const METADATA_LABELS: Record<string, string> = {
  contractSize: "multiplicador",
  productId: "producto",
  filename: "archivo",
  imported: "importados",
  duplicates: "duplicados",
  errors: "con problemas",
  enabled: "activada",
  matches: "coincide",
  note: "nota",
  changed: "cambió",
  name: "nombre",
  tradeId: "operación",
  triggeredManually: "manual",
};

function formatValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return "…";
  return String(value).slice(0, 60);
}
