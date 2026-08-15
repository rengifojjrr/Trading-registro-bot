import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MistakeCost } from "@/lib/analytics/behaviour";
import { MISTAKE_META } from "@/lib/journal/mistakes";
import { formatMoney, formatSignedMoney, pnlColorClass } from "@/lib/format";

/**
 * Which mistakes cost the most, worst first.
 *
 * Ranked by total rather than frequency: a rare catastrophe and a frequent
 * small leak are both worth fixing, but only the money says which first.
 */
export function MistakeCostTable({ rows }: { rows: MistakeCost[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Qué te cuesta cada error</CardTitle>
        <CardDescription>
          {rows.length === 0
            ? "Todavía no has etiquetado errores en ninguna operación."
            : "Ordenado por lo que te ha costado en total, no por cuántas veces ocurrió."}
        </CardDescription>
      </CardHeader>
      {rows.length > 0 ? (
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 text-left font-medium">Error</th>
                  <th className="px-2 py-2 text-right font-medium">Veces</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2 text-right font-medium">Media</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.code} className="border-b border-border/60 last:border-0">
                    <td className="px-2 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{MISTAKE_META[row.code].label}</span>
                        <span className="text-xs text-muted-foreground">
                          {MISTAKE_META[row.code].description}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.trades}</td>
                    <td className={`px-2 py-2 text-right font-medium tabular-nums ${pnlColorClass(row.totalNetPnl)}`}>
                      {formatSignedMoney(row.totalNetPnl)}
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums ${pnlColorClass(row.averageNetPnl)}`}>
                      {formatMoney(row.averageNetPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
