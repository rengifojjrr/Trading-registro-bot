import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DailyLimitStatus } from "@/lib/analytics/behaviour";
import { formatSignedMoney, pnlColorClass } from "@/lib/format";

/**
 * The days that broke the trader's own rules.
 *
 * Reported after the fact, never enforced: this app holds a read-only key
 * and could not stop an order even if it wanted to. Seeing that the rule
 * was broken on exactly the worst days is what makes it useful.
 */
export function DailyLimitsCard({
  days,
  hasLimits,
}: {
  days: DailyLimitStatus[];
  hasLimits: boolean;
}) {
  const breached = days.filter((d) => d.exceededLossLimit || d.exceededTradeLimit);

  return (
    <Card className={breached.length > 0 ? "border-negative/40" : undefined}>
      <CardHeader>
        <CardTitle>Tus propios límites</CardTitle>
        <CardDescription>
          {!hasLimits ? (
            <>
              Todavía no has fijado ninguno.{" "}
              <Link href="/settings" className="text-primary hover:underline">
                Defínelos en Configuración
              </Link>{" "}
              y aquí verás qué días los rompiste.
            </>
          ) : breached.length === 0 ? (
            "No has superado tus límites en ningún día del período."
          ) : (
            `Rompiste tus límites en ${breached.length} día(s). Son los que conviene revisar primero.`
          )}
        </CardDescription>
      </CardHeader>
      {breached.length > 0 ? (
        <CardContent>
          <ul className="flex flex-col divide-y divide-border">
            {breached.map((day) => (
              <li key={day.date} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span className="tabular-nums">{day.date}</span>
                <span className={`tabular-nums ${pnlColorClass(day.realizedPnl)}`}>
                  {formatSignedMoney(day.realizedPnl)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {day.tradesTaken} operación(es)
                </span>
                <div className="flex gap-1">
                  {day.exceededLossLimit ? <Badge variant="negative">Pérdida máxima</Badge> : null}
                  {day.exceededTradeLimit ? <Badge variant="warning">Demasiadas operaciones</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      ) : null}
    </Card>
  );
}
