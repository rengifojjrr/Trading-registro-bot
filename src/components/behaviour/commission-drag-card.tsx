import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CommissionDrag } from "@/lib/analytics/behaviour";
import { formatMoney, formatSignedMoney } from "@/lib/format";

/** Gross, commissions and net side by side, so the gap is a size rather than a percentage. */
export function CommissionDragCard({ drag }: { drag: CommissionDrag }) {
  return (
    <Card className={drag.dragPct !== null && drag.dragPct >= 30 ? "border-warning/40" : undefined}>
      <CardHeader>
        <CardTitle>Lo que se lleva el bróker</CardTitle>
        <CardDescription>{drag.message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-6">
        <Figure label="Bruto" value={formatSignedMoney(drag.grossPnl)} />
        <Figure label="Comisiones" value={`-${formatMoney(drag.commissions)}`} />
        <Figure label="Neto" value={formatSignedMoney(drag.netPnl)} emphasis />
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={emphasis ? "text-lg font-semibold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}
