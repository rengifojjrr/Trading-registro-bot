import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MIN_SAMPLE_SIZE, type StrategyPerformance } from "@/lib/analytics/strategy-report";
import { formatMoney, formatNumber, formatPercent, formatSignedMoney, pnlTone } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One strategy's performance, computed from the exact same computeStats()
 * the rest of the app uses -- never a strategy-specific shortcut. Warns
 * visually (tooltip on the triangle icon) below MIN_SAMPLE_SIZE closed
 * trades, per the promise already made in the Estrategias page's own
 * empty-state copy: no strategy gets declared profitable off a small
 * sample or win rate alone.
 */
export function StrategyPerformanceCard({ performance }: { performance: StrategyPerformance }) {
  const { strategyName, stats, lowSample } = performance;
  const hasTrades = stats.tradesCount > 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <CardTitle>{strategyName}</CardTitle>
        {lowSample && stats.closedTradesCount > 0 ? (
          <Tooltip>
            <TooltipTrigger
              className="text-warning outline-none hover:text-warning/80"
              aria-label="Muestra pequeña -- interpretar con cautela"
            >
              <AlertTriangle className="size-4" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>
              Menos de {MIN_SAMPLE_SIZE} operaciones cerradas -- estas cifras todavía no son una conclusión confiable
              sobre el rendimiento real de la estrategia.
            </TooltipContent>
          </Tooltip>
        ) : null}
      </CardHeader>
      <CardContent>
        {!hasTrades ? (
          <p className="text-sm text-muted-foreground">Sin operaciones todavía.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="P&L neto" value={formatSignedMoney(stats.netPnl)} tone={pnlTone(stats.netPnl)} />
            <Metric
              label="Win rate"
              value={stats.winRate === null ? "--" : formatPercent(stats.winRate)}
              sub={`${stats.wins}/${stats.closedTradesCount} cerradas`}
            />
            <Metric label="Profit factor" value={stats.profitFactor === null ? "--" : formatNumber(stats.profitFactor)} />
            <Metric
              label="Expectancy"
              value={stats.expectancy === null ? "--" : formatSignedMoney(stats.expectancy)}
              tone={stats.expectancy === null ? "neutral" : pnlTone(stats.expectancy)}
            />
            <Metric
              label="Drawdown máx"
              value={stats.maxDrawdown === "0" ? formatMoney("0") : `-${formatMoney(stats.maxDrawdown)}`}
            />
            <Metric label="Operaciones" value={stats.tradesCount} sub={`${stats.openTradesCount} abiertas`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-base font-semibold tabular-nums",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
