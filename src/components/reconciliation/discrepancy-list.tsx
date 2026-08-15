"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { resolveDiscrepancy } from "@/app/(dashboard)/reconciliation/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";

export interface DiscrepancyRow {
  id: string;
  discrepancy_type: string;
  entity_type: string;
  entity_id: string;
  expected: unknown;
  actual: unknown;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, { label: string; explanation: string }> = {
  MISSING_IN_DB: {
    label: "Falta en la app",
    explanation:
      "Coinbase reporta esta ejecución y la aplicación no la tiene. Suele resolverse con una sincronización manual.",
  },
  MISSING_IN_COINBASE: {
    label: "Falta en Coinbase",
    explanation:
      "La aplicación tiene una ejecución que Coinbase ya no reporta en esa ventana. Puede ser un fill importado por CSV, o una corrección del propio Coinbase.",
  },
  FIELD_MISMATCH: {
    label: "Valores distintos",
    explanation: "La ejecución existe en ambos lados pero algún campo no coincide.",
  },
  UNCLASSIFIED_FILL: {
    label: "Fill sin clasificar",
    explanation:
      "Un tipo de ajuste o un fill combo que el motor de reconstrucción no procesa automáticamente. No afecta a lo ya calculado, pero no está incluido.",
  },
  TRADE_BOUNDARY_CHANGED: {
    label: "Cambiaron los límites de una operación",
    explanation:
      "Un recálculo agrupó los fills de otra manera, así que una operación anterior ya no corresponde a un límite de posición.",
  },
};

/**
 * One card per difference, showing both sides.
 *
 * Resolving is an explicit human act that records a note -- nothing here
 * changes the data. The app cannot know which of the two versions is right,
 * and pretending otherwise is exactly the kind of silent correction this
 * whole page exists to prevent.
 */
export function DiscrepancyList({ rows, timezone }: { rows: DiscrepancyRow[]; timezone: string }) {
  const open = rows.filter((r) => !r.resolved_at);
  const resolved = rows.filter((r) => r.resolved_at);

  return (
    <div className="flex flex-col gap-3">
      {open.map((row) => (
        <DiscrepancyCard key={row.id} row={row} timezone={timezone} />
      ))}
      {resolved.length > 0 ? (
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {resolved.length} diferencia(s) ya resueltas
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {resolved.map((row) => (
              <DiscrepancyCard key={row.id} row={row} timezone={timezone} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function DiscrepancyCard({ row, timezone }: { row: DiscrepancyRow; timezone: string }) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const meta = TYPE_LABELS[row.discrepancy_type] ?? {
    label: row.discrepancy_type,
    explanation: "",
  };

  function resolve() {
    startTransition(async () => {
      const result = await resolveDiscrepancy(row.id, note);
      if (result.error) toast.error(result.error);
      else toast.success("Diferencia marcada como resuelta.");
      setShowNote(false);
    });
  }

  return (
    <Card className={row.resolved_at ? undefined : "border-warning/40"}>
      <CardContent className="flex flex-col gap-2 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={row.resolved_at ? "outline" : "warning"}>{meta.label}</Badge>
            <span className="font-mono text-xs text-muted-foreground">{row.entity_id}</span>
          </div>
          <span className="text-xs text-muted-foreground">{formatDateTime(row.created_at, timezone)}</span>
        </div>

        {meta.explanation ? <p className="text-xs text-muted-foreground">{meta.explanation}</p> : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <SidePanel title="Según Coinbase" value={row.expected} />
          <SidePanel title="Según la app" value={row.actual} />
        </div>

        {row.resolved_at ? (
          <p className="text-xs text-muted-foreground">
            Resuelta el {formatDateTime(row.resolved_at, timezone)}
            {row.resolution_note ? ` · ${row.resolution_note}` : ""}
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {showNote ? (
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="¿Qué era y cómo lo resolviste?"
                className="max-w-sm"
                autoFocus
              />
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => (showNote ? resolve() : setShowNote(true))}
            >
              <Check className="size-4 text-positive" aria-hidden />
              {showNote ? "Guardar y marcar resuelta" : "Marcar resuelta"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Shows the stored jsonb side by side. Null means "this side had nothing", which is itself the finding. */
function SidePanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-secondary/30 px-3 py-2">
      <span className="text-xs font-medium text-muted-foreground">{title}</span>
      {value === null || value === undefined ? (
        <span className="text-xs italic text-muted-foreground">No existe de este lado</span>
      ) : (
        <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}
