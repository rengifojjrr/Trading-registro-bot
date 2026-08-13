"use client";

import { InfoHint } from "@/components/shared/info-hint";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RDistribution } from "@/lib/analytics/breakdowns";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Histogram of journalled R multiples. Deliberately reports how many
 * trades actually carry an R value instead of implying the distribution
 * covers everything -- an unjournalled trade is missing data, not a 0R
 * result, and treating it as the latter would drag the whole shape toward
 * breakeven.
 */
export function RDistributionChart({ distribution }: { distribution: RDistribution }) {
  const maxCount = Math.max(...distribution.bins.map((b) => b.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-foreground">
          Distribución en R
          <InfoHint label="Distribución en R">
            R es cuántas veces tu riesgo inicial ganaste o perdiste. 2R significa que ganaste el doble de lo que
            arriesgabas. Solo se cuentan las operaciones donde anotaste el resultado en R en su diario.
          </InfoHint>
        </CardTitle>
        <CardDescription>
          {distribution.sampleSize === 0
            ? "Todavía no has anotado el resultado en R de ninguna operación."
            : `${distribution.sampleSize} operaciones con R anotada · promedio ${formatNumber(distribution.averageR, 2)}R`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {distribution.sampleSize === 0 ? (
          <p className="text-sm text-muted-foreground">
            Anota el campo &quot;Resultado en R&quot; en el diario de tus operaciones y esta distribución se irá
            construyendo sola.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {distribution.bins.map((bin) => (
              <div key={bin.label} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 text-muted-foreground">{bin.label}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-secondary">
                  <div
                    className={cn("h-full", bin.max <= 0 ? "bg-negative" : "bg-positive")}
                    style={{ width: `${(bin.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="w-6 shrink-0 text-right tabular-nums">{bin.count}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
