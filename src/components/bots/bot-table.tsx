import Link from "next/link";
import type { Route } from "next";

import { BlockBadge, PhaseBadge, SemaforoBadge } from "@/components/bots/badges";
import type { BotView } from "@/lib/bots/queries";
import { formatNumber, formatSignedMoney, pnlColorClass } from "@/lib/format";

/**
 * Los bots, uno por fila, para ver cuál rinde más.
 *
 * Las cifras son las de todo su histórico; el semáforo, el de su ventana
 * móvil. Las dos hacen falta: un bot excelente en total puede estar
 * apagándose ahora mismo, y eso es justo lo que el semáforo ve y el total
 * esconde.
 *
 * En pantallas estrechas se convierte en tarjetas: una tabla de nueve
 * columnas en un móvil es un arrastre horizontal que nadie hace.
 */
export function BotTable({ bots, currency }: { bots: BotView[]; currency: string }) {
  if (bots.length === 0) return null;

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {bots.map((v) => (
          <li key={v.bot.id} className="rounded-lg border border-border p-3">
            <Link href={`/bots/${v.bot.id}` as Route} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">{v.bot.name}</span>
                <SemaforoBadge state={v.health.state} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <PhaseBadge phase={v.bot.phase} />
                <BlockBadge block={v.bot.block} />
                <span className="text-xs text-muted-foreground">
                  {v.bot.market} · {v.bot.timeframe}
                </span>
              </div>
              <dl className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Neto</dt>
                  <dd className={`tabular-nums ${pnlColorClass(v.metrics.netPnl)}`}>
                    {formatSignedMoney(v.metrics.netPnl, { currency, compact: true })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">PF</dt>
                  <dd className="tabular-nums text-foreground">{formatNumber(v.metrics.profitFactor)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Operaciones</dt>
                  <dd className="tabular-nums text-foreground">{v.metrics.trades}</dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="py-2 pr-3 text-left font-medium">Bot</th>
              <th className="py-2 pr-3 text-left font-medium">Fase</th>
              <th className="py-2 pr-3 text-left font-medium">Bloque</th>
              <th className="py-2 pr-3 text-left font-medium">Semáforo</th>
              <th className="py-2 pr-3 text-right font-medium">Tamaño</th>
              <th className="py-2 pr-3 text-right font-medium">Ops.</th>
              <th className="py-2 pr-3 text-right font-medium">PF</th>
              <th className="py-2 pr-3 text-right font-medium">Exp. R</th>
              <th className="py-2 pr-3 text-right font-medium">Sharpe</th>
              <th className="py-2 pr-3 text-right font-medium">DD máx.</th>
              <th className="py-2 text-right font-medium">Neto</th>
            </tr>
          </thead>
          <tbody>
            {bots.map((v) => (
              <tr key={v.bot.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                <td className="py-2 pr-3">
                  <Link href={`/bots/${v.bot.id}` as Route} className="font-medium text-foreground hover:underline">
                    {v.bot.name}
                  </Link>
                  <div className="text-xs text-muted-foreground">
                    {v.bot.market} · {v.bot.timeframe}
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <PhaseBadge phase={v.bot.phase} />
                </td>
                <td className="py-2 pr-3">
                  <BlockBadge block={v.bot.block} />
                </td>
                <td className="py-2 pr-3">
                  <SemaforoBadge state={v.health.state} />
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{v.bot.sizingPct}%</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{v.metrics.trades}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatNumber(v.metrics.profitFactor)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatNumber(v.metrics.expectancyR)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatNumber(v.metrics.sharpe)}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-foreground">
                  {v.metrics.maxDrawdownPct === null ? "--" : `${v.metrics.maxDrawdownPct.toFixed(1)}%`}
                </td>
                <td className={`py-2 text-right tabular-nums ${pnlColorClass(v.metrics.netPnl)}`}>
                  {formatSignedMoney(v.metrics.netPnl, { currency })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
