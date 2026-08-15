import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { StreakSizingEffect } from "@/lib/analytics/behaviour";
import { formatNumber } from "@/lib/format";

/**
 * Whether a run of losses changes how big the next trade is.
 *
 * The most expensive behavioural leak there is, and invisible everywhere
 * else in the app: each trade looks perfectly reasonable on its own.
 */
export function StreakSizingCard({ effect }: { effect: StreakSizingEffect }) {
  const hasData = effect.afterLosses.length > 0 || effect.afterWins.length > 0;

  // The comparison that matters: does size grow as the losing run gets longer?
  const escalating =
    effect.afterLosses.length >= 2 &&
    Number(effect.afterLosses[effect.afterLosses.length - 1].averageSize) >
      Number(effect.afterLosses[0].averageSize) * 1.2;

  return (
    <Card className={escalating ? "border-negative/40" : undefined}>
      <CardHeader>
        <CardTitle>Tamaño después de una racha</CardTitle>
        <CardDescription>
          {!hasData
            ? "Hacen falta varias operaciones seguidas para poder comparar."
            : escalating
              ? "Estás aumentando el tamaño según se alarga la racha perdedora. Es la forma más rápida de convertir una mala semana en un mal mes."
              : "Tamaño medio de la operación que tomas justo después de N resultados consecutivos."}
        </CardDescription>
      </CardHeader>
      {hasData ? (
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <StreakColumn title="Después de perder" rows={effect.afterLosses} tone="negative" />
          <StreakColumn title="Después de ganar" rows={effect.afterWins} tone="positive" />
        </CardContent>
      ) : null}
    </Card>
  );
}

function StreakColumn({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { streak: number; trades: number; averageSize: string }[];
  tone: "positive" | "negative";
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className={`text-xs font-medium ${tone === "negative" ? "text-negative" : "text-positive"}`}>
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos todavía.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {rows.map((row) => (
            <li key={row.streak} className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">
                {row.streak} seguida{row.streak === 1 ? "" : "s"}
              </span>
              <span className="tabular-nums">
                {formatNumber(row.averageSize, 4)}{" "}
                <span className="text-xs text-muted-foreground">({row.trades})</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
