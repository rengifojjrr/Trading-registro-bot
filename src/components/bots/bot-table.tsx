import Link from "next/link";
import type { Route } from "next";

import { BlockBadge, PhaseBadge, SemaforoBadge } from "@/components/bots/badges";
import { Badge } from "@/components/ui/badge";
import type { BotView, ResumenPapel } from "@/lib/bots/queries";
import { formatMoney, formatNumber, formatPercent, formatSignedMoney, pnlColorClass } from "@/lib/format";

/**
 * Los bots, uno por fila, para ver cuál rinde más.
 *
 * Las cifras son las de todo su histórico; el semáforo, el de su ventana
 * móvil. Las dos hacen falta: un bot excelente en total puede estar
 * apagándose ahora mismo, y eso es justo lo que el semáforo ve y el total
 * esconde.
 *
 * Las dos últimas columnas son el simulador y sólo se pintan si llega
 * `papel`. Están aquí y no sólo en /bots/simulador porque esta tabla es
 * donde se viene a mirar «qué hacen mis bots»: uno encendido en papel con
 * una posición abierta y cero operaciones reales parecía, sin ellas, un bot
 * parado. Van al final y separadas del neto real a propósito: son otra
 * historia y no deben leerse como si sumaran.
 *
 * En pantallas estrechas se convierte en tarjetas: una tabla de once
 * columnas en un móvil es un arrastre horizontal que nadie hace.
 */
export function BotTable({
  bots,
  currency,
  papel,
}: {
  bots: BotView[];
  currency: string;
  papel?: Map<string, ResumenPapel>;
}) {
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
              {papel && (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs">
                  <CeldaPosicion resumen={papel.get(v.bot.id)} currency={currency} />
                  <CeldaPapel resumen={papel.get(v.bot.id)} currency={currency} />
                </div>
              )}
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
              <th className={`py-2 text-right font-medium ${papel ? "pr-3" : ""}`}>Neto</th>
              {papel && (
                <>
                  <th className="py-2 pr-3 text-right font-medium">Papel</th>
                  <th className="py-2 text-left font-medium">Posición</th>
                </>
              )}
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
                <td className={`py-2 text-right tabular-nums ${papel ? "pr-3" : ""} ${pnlColorClass(v.metrics.netPnl)}`}>
                  {formatSignedMoney(v.metrics.netPnl, { currency })}
                </td>
                {papel && (
                  <>
                    <td className="py-2 pr-3 text-right">
                      <CeldaPapel resumen={papel.get(v.bot.id)} currency={currency} />
                    </td>
                    <td className="py-2">
                      <CeldaPosicion resumen={papel.get(v.bot.id)} currency={currency} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * La cuenta de papel del bot: el equity arriba y, debajo y en color, lo que
 * lleva ganado o perdido desde que se le asignó capital. El guion largo es
 * para el bot que nunca se sembró: no es cero, es que no juega.
 */
function CeldaPapel({ resumen, currency }: { resumen: ResumenPapel | undefined; currency: string }) {
  if (!resumen) return <span className="text-muted-foreground">—</span>;

  return (
    <div className="flex flex-col items-end">
      <span className="tabular-nums text-foreground">{formatMoney(resumen.equity, { currency, compact: true })}</span>
      <span className={`text-xs tabular-nums ${pnlColorClass(resumen.pnl)}`}>
        {formatSignedMoney(resumen.pnl, { currency, compact: true })} · {formatPercent(resumen.pnlPct, 1)}
      </span>
    </div>
  );
}

/** Verde el que gana subiendo, rojo el que gana bajando; gris lo que no sabemos leer. */
function colorDelLado(side: string): "positive" | "negative" | "outline" {
  if (side === "LARGO") return "positive";
  if (side === "CORTO") return "negative";
  return "outline";
}

/**
 * Lo que el bot tiene abierto en papel, o por qué no tiene nada.
 *
 * «Apagado» y «sin posición» se distinguen a propósito: el primero no va a
 * abrir nada haga lo que haga el mercado; el segundo está mirando y aún no
 * ha visto señal. Al usuario que acaba de encender los bots le importa esa
 * diferencia más que ninguna cifra.
 */
function CeldaPosicion({ resumen, currency }: { resumen: ResumenPapel | undefined; currency: string }) {
  if (!resumen) return <span className="text-muted-foreground">—</span>;
  if (!resumen.enabled) return <span className="text-xs text-muted-foreground">apagado</span>;
  if (!resumen.posicion) return <span className="text-xs text-muted-foreground">sin posición</span>;

  return (
    <div className="flex items-center gap-1.5">
      <Badge variant={colorDelLado(resumen.posicion.side)}>{resumen.posicion.side}</Badge>
      <span className="text-xs tabular-nums text-foreground">
        a {formatMoney(resumen.posicion.precioEntrada, { currency })}
      </span>
    </div>
  );
}
