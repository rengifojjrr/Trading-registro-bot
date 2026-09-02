import { Plus, Users } from "lucide-react";
import Link from "next/link";

import { BotTable } from "@/components/bots/bot-table";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildPortfolio } from "@/lib/bots/queries";
import { isProduction } from "@/lib/bots/types";
import { formatNumber, formatSignedMoney, pnlTone } from "@/lib/format";

/**
 * El primer equipo: los bots que operan con dinero.
 *
 * Una fila por bot para poder comparar cuál rinde más, y arriba las cifras
 * del equipo entero, que son las que de verdad importan: un portfolio es la
 * suma, no el mejor de sus bots.
 */
export default async function TeamPage() {
  const p = await buildPortfolio();
  const { context } = p;
  const equipo = p.bots.filter((v) => isProduction(v.bot.phase));

  return (
    <>
      <PageHeader
        title="Equipo"
        description="Los bots en staging y producción: los que operan con dinero."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/bots/nuevo">
              <Plus className="size-4" aria-hidden />
              Nuevo bot
            </Link>
          </Button>
        }
      />

      {equipo.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nadie opera con dinero todavía"
          description="El equipo se llena desde la cantera: un bot llega aquí subiendo a F6 (staging, con el 10% de su tamaño) y después a F7. Si ya tienes bots corriendo con dinero real, dales de alta directamente en F6 o F7."
          action={
            <Button asChild size="sm">
              <Link href="/bots/cantera">Ver la cantera</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              size="lg"
              label="Neto del equipo"
              value={formatSignedMoney(p.team.netPnl, { currency: context.currency })}
              tone={pnlTone(p.team.netPnl)}
              sub={`${p.team.trades} operaciones · ${p.team.openTrades} abiertas`}
              description="Suma del P&L neto de las operaciones de todos los bots del equipo."
            />
            <StatTile
              size="lg"
              label="Profit factor"
              value={formatNumber(p.team.profitFactor)}
              tone={p.team.profitFactor === null ? "neutral" : p.team.profitFactor >= 1 ? "positive" : "negative"}
              description="Ganancias netas entre pérdidas netas del equipo entero."
            />
            <StatTile
              size="lg"
              label="Drawdown máximo"
              value={p.team.maxDrawdownPct === null ? formatSignedMoney(`-${p.team.maxDrawdown}`, { currency: context.currency }) : `${p.team.maxDrawdownPct.toFixed(1)}%`}
              tone={p.team.maxDrawdown === "0" ? "neutral" : "negative"}
              sub={p.team.maxDrawdownPct === null ? "Sin tamaño de cuenta no hay porcentaje" : formatSignedMoney(`-${p.team.maxDrawdown}`, { currency: context.currency })}
              description="La mayor caída desde un máximo de la curva conjunta del equipo. En porcentaje del capital si está en Configuración."
            />
            <StatTile
              size="lg"
              label="Sharpe"
              value={formatNumber(p.team.sharpe)}
              sub={p.team.sortino === null ? undefined : `Sortino ${formatNumber(p.team.sortino)}`}
              description="Anualizado sobre el P&L diario del equipo, con los días sin operar a cero."
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Bot a bot</CardTitle>
            </CardHeader>
            <CardContent>
              <BotTable bots={equipo} currency={context.currency} />
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
