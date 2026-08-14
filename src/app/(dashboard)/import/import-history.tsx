import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";

export interface CsvImportRow {
  id: string;
  filename: string;
  row_count: number;
  imported_count: number;
  duplicate_count: number;
  error_count: number;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; variant: "positive" | "negative" | "warning" | "outline" }> = {
  COMPLETED: { label: "Completada", variant: "positive" },
  FAILED: { label: "Fallida", variant: "negative" },
  PROCESSING: { label: "En curso", variant: "warning" },
  PENDING: { label: "Pendiente", variant: "outline" },
};

/** The audit trail for imports -- which file produced which fills, and when. */
export function ImportHistory({ imports, timezone }: { imports: CsvImportRow[]; timezone: string }) {
  if (imports.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importaciones anteriores</CardTitle>
        <CardDescription>Las últimas 10, para saber de qué archivo salió cada operación.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {imports.map((row) => {
          const status = STATUS_LABELS[row.status] ?? { label: row.status, variant: "outline" as const };
          return (
            <div
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">{row.filename}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(row.created_at, timezone)} · {row.imported_count} importados ·{" "}
                  {row.duplicate_count} duplicados · {row.error_count} con problemas de {row.row_count} filas
                </span>
              </div>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
