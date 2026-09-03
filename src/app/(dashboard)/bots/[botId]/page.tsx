import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { BlockBadge, PhaseBadge, SemaforoBadge } from "@/components/bots/badges";
import { BaselineFromHistoryButton } from "@/components/bots/bot-buttons";
import { BotForm } from "@/components/bots/bot-form";
import { GateChecklist } from "@/components/bots/gate-checklist";
import { HealthCard } from "@/components/bots/health-card";
import { ImpulseForm } from "@/components/bots/impulse-form";
import { ImpulseList } from "@/components/bots/impulse-list";
import { MonteCarloCard } from "@/components/bots/monte-carlo-card";
import { PaperEquityChart } from "@/components/bots/paper-equity-chart";
import { PaperTradesTabla } from "@/components/bots/paper-trades-tabla";
import { PhaseControls } from "@/components/bots/phase-controls";
import { EquityCurveChart } from "@/components/dashboard/equity-curve-chart";
import { StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/layout/page-header";
import { CollapsibleSection } from "@/components/shared/collapsible-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchBotDetail, fetchBotFormOptions, fetchPaperForBot } from "@/lib/bots/queries";
import { BASELINE_SOURCE_LABELS, PHASE_LABELS, STYLE_LABELS } from "@/lib/bots/types";
import { formatDate, formatDateTime, formatNumber, formatPercent, formatSignedMoney, pnlColorClass, pnlTone } from "@/lib/format";

/**
 * La ficha de un bot: lo que prometió, lo que hace y en qué fase está.
 *
 * El orden es el del método: primero el semáforo y la puerta (lo que hay que
 * decidir), después las cifras y la curva (el porqué), después el contrato y
 * la fase (las acciones), y al final lo que se mira poco.
 */
export default async function BotDetailPage(props: PageProps<"/bots/[botId]">) {
  const { botId } = await props.params;
  const [detail, options, papel] = await Promise.all([
    fetchBotDetail(botId),
    fetchBotFormOptions(),
    fetchPaperForBot(botId),
  ]);
  if (!detail) notFound();

  const { view, context, trades, equity, history, impulses } = detail;
  const { bot, metrics, health, gate, montecarlo, contractBreached } = view;
  const { currency, timezone } = context;
  const bl = bot.baseline;
  const tieneBaseline = bl.profitFactor !== null || bl.expectancyR !== null || bl.winRate !== null || bl.sharpe !== null;

  return (
    <>
      <PageHeader
        title={bot.name}
        description={`${STYLE_LABELS[bot.style]} · ${bot.market} · ${bot.timeframe}${bot.magicNumber ? ` · magic ${bot.magicNumber}` : ""}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <PhaseBadge phase={bot.phase} />
            <BlockBadge block={bot.block} />
            <SemaforoBadge state={health.state} />
          </div>
        }
      />

      {bot.hypothesis ? (
        <p className="rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm text-foreground">
          <span className="text-muted-foreground">Hipótesis: </span>
          {bot.hypothesis}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          size="lg"
          label="P&L neto"
          value={formatSignedMoney(metrics.netPnl, { currency })}
          tone={pnlTone(metrics.netPnl)}
          sub={`${metrics.trades} cerradas · ${metrics.openTrades} abiertas`}
          description="Suma del P&L neto de las operaciones asignadas a este bot, con el mismo cálculo que las tuyas."
        />
        <StatTile
          size="lg"
          label="Profit factor"
          value={formatNumber(metrics.profitFactor)}
          tone={metrics.profitFactor === null ? "neutral" : metrics.profitFactor >= 1 ? "positive" : "negative"}
          sub={metrics.winRate === null ? undefined : `Win rate ${metrics.winRate.toFixed(0)}%`}
          description="Ganancias netas entre pérdidas netas. Sin operaciones perdedoras no está definido."
        />
        <StatTile
          size="lg"
          label="Expectativa"
          value={metrics.expectancyR === null ? "--" : `${formatNumber(metrics.expectancyR)} R`}
          sub={metrics.expectancy === null ? undefined : `${formatSignedMoney(metrics.expectancy, { currency })} por operación`}
          description="P&L medio por operación en múltiplos de la pérdida media, que es la unidad de riesgo real del bot."
        />
        <StatTile
          size="lg"
          label="Drawdown máximo"
          value={metrics.maxDrawdownPct === null ? formatSignedMoney(`-${metrics.maxDrawdown}`, { currency }) : `${metrics.maxDrawdownPct.toFixed(1)}%`}
          tone={metrics.maxDrawdown === "0" ? "neutral" : "negative"}
          sub={metrics.sharpe === null ? "Sharpe: pocos días" : `Sharpe ${formatNumber(metrics.sharpe)}`}
          description="La mayor caída desde un máximo de su curva. En porcentaje del capital si está en Configuración."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Semáforo</CardTitle>
            <p className="text-xs text-muted-foreground">Su ventana móvil contra su línea base. Verde no se toca; amarillo, al 50%; naranja, a papel.</p>
          </CardHeader>
          <CardContent>
            <HealthCard health={health} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Puerta</CardTitle>
            <p className="text-xs text-muted-foreground">Desde F4 los ascensos los decide esto, no la persona.</p>
          </CardHeader>
          <CardContent>
            <GateChecklist gate={gate} />
          </CardContent>
        </Card>
      </div>

      {equity.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Curva de capital</CardTitle>
          </CardHeader>
          <CardContent>
            <EquityCurveChart points={equity} timezone={timezone} />
          </CardContent>
        </Card>
      ) : null}

      {/* El simulador va después de la curva real y antes de la fase: es lo que
          el bot está haciendo ahora mismo, y por tanto parte del porqué de la
          decisión, no una de las acciones. Sin cuenta de papel no se pinta
          nada, que es lo normal en un bot que nunca se sembró. */}
      {papel ? (
        <Card>
          <CardHeader>
            <CardTitle>
              En el simulador{papel.enabled ? "" : " (apagado)"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PaperEquityChart
              puntos={papel.puntos}
              capitalAsignado={papel.capitalAsignado}
              timezone={timezone}
              moneda={currency}
            />
            <CollapsibleSection
              title="Operaciones simuladas"
              subtitle={`${papel.operaciones.length} cerrada${papel.operaciones.length === 1 ? "" : "s"}`}
            >
              <PaperTradesTabla
                operaciones={papel.operaciones}
                timezone={timezone}
                moneda={currency}
              />
            </CollapsibleSection>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Fase: {PHASE_LABELS[bot.phase]}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PhaseControls bot={bot} gateVerdict={gate.verdict} gateSummary={gate.summary} tradeCount={trades.length} timezone={timezone} />

            {history.length > 0 ? (
              <CollapsibleSection title="Historial" subtitle={`${history.length} cambio${history.length === 1 ? "" : "s"}`}>
                <ul className="flex flex-col divide-y divide-border text-sm">
                  {history.map((h) => (
                    <li key={h.id} className="flex flex-col gap-0.5 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {h.fromPhase ? `${h.fromPhase} → ${h.toPhase}` : `Entra por ${h.toPhase}`}
                        </span>
                        <span className="text-xs text-muted-foreground">{formatDateTime(h.createdAt, timezone)}</span>
                        {h.metrics.forzado === true ? <span className="text-xs text-warning">forzado</span> : null}
                      </div>
                      {h.reason ? <p className="text-muted-foreground">{h.reason}</p> : null}
                      {typeof h.metrics.trades === "number" ? (
                        <p className="text-xs text-muted-foreground">
                          Con {String(h.metrics.trades)} operaciones, PF {typeof h.metrics.profitFactor === "number" ? h.metrics.profitFactor.toFixed(2) : "--"}, puerta {String(h.metrics.gate ?? "--")}.
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CollapsibleSection>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contrato de drawdown</CardTitle>
            <p className="text-xs text-muted-foreground">El percentil 95 del Monte Carlo, firmado antes de darle dinero real.</p>
          </CardHeader>
          <CardContent>
            <MonteCarloCard montecarlo={montecarlo} bot={bot} currency={currency} timezone={timezone} breached={contractBreached} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <CollapsibleSection
            title="Línea base"
            subtitle={tieneBaseline ? `${BASELINE_SOURCE_LABELS[bl.source]}${bl.trades ? ` · ${bl.trades} operaciones` : ""}` : "Sin cifras declaradas"}
          >
            <div className="flex flex-col gap-3">
              {tieneBaseline ? (
                <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                  <Dato label="Profit factor" value={formatNumber(bl.profitFactor)} />
                  <Dato label="Expectativa" value={bl.expectancyR === null ? "--" : `${formatNumber(bl.expectancyR)} R`} />
                  <Dato label="Win rate" value={bl.winRate === null ? "--" : `${bl.winRate.toFixed(0)}%`} />
                  <Dato label="Sharpe" value={formatNumber(bl.sharpe)} />
                  <Dato label="DD máximo" value={bl.maxDrawdownPct === null ? "--" : `${bl.maxDrawdownPct.toFixed(1)}%`} />
                  <Dato label="Ops. al mes" value={formatNumber(bl.tradesPerMonth, 1)} />
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sin línea base, el semáforo compara la ventana con el histórico anterior del bot. Si viene de un
                  backtest, escribe sus cifras al editarlo; si no, toma el histórico cuando tenga diez operaciones.
                </p>
              )}
              {bl.note ? <p className="text-xs text-muted-foreground">{bl.note}</p> : null}
              <div>
                <BaselineFromHistoryButton botId={bot.id} trades={metrics.trades} />
              </div>
            </div>
          </CollapsibleSection>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <CollapsibleSection title="Operaciones" subtitle={trades.length === 0 ? "Ninguna asignada" : `${trades.length} asignadas · las más recientes primero`}>
            {trades.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Se asignan desde la{" "}
                <Link href="/trades" className="underline underline-offset-4">
                  lista de operaciones
                </Link>
                : marca las suyas y pulsa «Asignar al bot».
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border text-sm">
                {trades.slice(0, 50).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 py-2">
                    <Link href={`/trades/${t.id}` as Route} className="flex min-w-0 flex-col hover:underline">
                      <span className="truncate text-foreground">
                        {t.direction === "LONG" ? "Largo" : "Corto"} · {t.productId}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(t.openedAt, timezone)}
                        {t.closedAt ? ` → ${formatDate(t.closedAt, timezone)}` : " · abierta"}
                      </span>
                    </Link>
                    <span className={`shrink-0 tabular-nums ${pnlColorClass(t.netPnl)}`}>
                      {t.netPnl === null ? "--" : formatSignedMoney(t.netPnl, { currency })}
                      {t.returnPct ? <span className="ml-1 text-xs text-muted-foreground">{formatPercent(t.returnPct, 1)}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CollapsibleSection>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <CollapsibleSection title="Impulsos sobre este bot" subtitle={impulses.length === 0 ? "Ninguno" : `${impulses.length} apuntado${impulses.length === 1 ? "" : "s"}`}>
            <div className="flex flex-col gap-4">
              <ImpulseForm bots={[{ id: bot.id, name: bot.name }]} defaultBotId={bot.id} />
              <ImpulseList evaluations={impulses} currency={currency} timezone={timezone} />
            </div>
          </CollapsibleSection>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <CollapsibleSection title="Editar el bot" subtitle="Nombre, mercado, bloque, tamaño y línea base">
            <BotForm bot={bot} options={options} />
          </CollapsibleSection>
        </CardContent>
      </Card>

    </>
  );
}

function Dato({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
