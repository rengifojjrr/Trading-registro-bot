import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Bucket } from "@/lib/analytics/breakdowns";
import { formatMoney, formatSignedMoney, pnlColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Below this, a bucket's win rate is noise -- flagged rather than silently presented as a finding. */
const LOW_SAMPLE_THRESHOLD = 5;

/**
 * One "results sliced by X" table. Every row carries its sample size and
 * anything thin is visually marked, so a 100% win rate over two trades
 * can't be mistaken for a pattern.
 */
export function BreakdownTable({
  title,
  description,
  buckets,
  currency,
}: {
  title: string;
  description?: string;
  buckets: Bucket[];
  currency: string;
}) {
  if (buckets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No hay operaciones cerradas en este período.
        </CardContent>
      </Card>
    );
  }

  const best = buckets.reduce((a, b) => (Number(b.netPnl) > Number(a.netPnl) ? b : a));
  const worst = buckets.reduce((a, b) => (Number(b.netPnl) < Number(a.netPnl) ? b : a));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-foreground">
          {title}
          <InfoHint label={title}>
            Solo cuenta operaciones cerradas. Las filas con menos de {LOW_SAMPLE_THRESHOLD} operaciones se marcan
            porque su porcentaje de acierto todavía no significa nada.
          </InfoHint>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-normal">Grupo</th>
                <th className="py-2 text-right font-normal">Ops.</th>
                <th className="py-2 text-right font-normal">Acierto</th>
                <th className="py-2 text-right font-normal">Promedio</th>
                <th className="py-2 text-right font-normal">P&L neto</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => {
                const thin = bucket.trades < LOW_SAMPLE_THRESHOLD;
                return (
                  <tr key={bucket.key} className="border-b border-border last:border-0">
                    <td className="py-2">
                      {bucket.label}
                      {thin ? <span className="ml-1.5 text-xs text-warning">pocos datos</span> : null}
                    </td>
                    <td className="py-2 text-right tabular-nums">{bucket.trades}</td>
                    <td className={cn("py-2 text-right tabular-nums", thin && "text-muted-foreground")}>
                      {bucket.winRate === null ? "--" : `${bucket.winRate.toFixed(0)}%`}
                    </td>
                    <td className={cn("py-2 text-right tabular-nums", pnlColorClass(bucket.average))}>
                      {bucket.average === null ? "--" : formatSignedMoney(bucket.average, { currency })}
                    </td>
                    <td className={cn("py-2 text-right font-medium tabular-nums", pnlColorClass(bucket.netPnl))}>
                      {formatSignedMoney(bucket.netPnl, { currency })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {buckets.length > 1 && best.key !== worst.key ? (
          <p className="text-xs text-muted-foreground">
            Mejor: <span className="text-positive">{best.label}</span> ({formatMoney(best.netPnl, { currency })}) ·
            Peor: <span className="text-negative">{worst.label}</span> ({formatMoney(worst.netPnl, { currency })})
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
