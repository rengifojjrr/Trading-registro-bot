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
import { BotChart } from "@/components/bots/bot-chart";
import { EstrategiaDetalle } from "@/components/bots/estrategia-detalle";
import { MonteCarloCard } from "@/components/bots/monte-carlo-card";
import { PaperEquityChart } from "@/components/bots/paper-equity-chart";
import { PaperTradesTabla } from "@/components/bots/paper-trades-tabla";
import { PhaseControls } from "@/components/bots/phase-controls";
import { PosicionAbiertaCard } from "@/components/bots/posicion-abierta-card";
import {
  SEGUNDOS_POR_GRANULARIDAD,
  esGranularidadPublica,
  velasPublicas,
} from "@/lib/coinbase/public-candles";
import { operacionesMarcables, posicionMarcable } from "@/lib/paper/marcadores";
import { estrategiaPorSlug } from "@/lib/paper/strategy-library";
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
// Siempre fresca. Lo que enseña cambia cada cinco minutos sin que el usuario
// haga nada -- el ciclo del simulador escribe por detrás --, y la caché de
// rutas del navegador puede devolver la ficha de hace medio minuto al volver
// atrás. Con una posición abierta, medio minuto es un precio distinto.
export const dynamic = "force-dynamic";

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

  // Las velas del mercado del bot, para pintar sus entradas y salidas encima.
  //
  // Se piden aquí y no en el cliente: la API pública de Coinbase no necesita
  // credenciales, así que el servidor puede traerlas en el mismo render, y el
  // gráfico aparece con datos en vez de con un hueco que se rellena después.
  // Trescientas es el máximo que sirve el endpoint de una vez y basta de
  // sobra para ver el contexto de las últimas operaciones.
  //
  // Sólo si el bot tiene cuenta de papel y su temporalidad es de las que la
  // API pública sirve: un bot creado a mano con «4h» se queda sin gráfico y
  // la ficha lo dice, en vez de pedir una granularidad que va a fallar.
  const granularidad = esGranularidadPublica(bot.timeframe) ? bot.timeframe : null;
  // Con la vela en curso incluida: aquí sólo se pinta. Sin ella, el gráfico de
  // un bot diario se queda en la vela de ayer durante todo el día y parece
  // congelado, que es exactamente la impresión que hay que evitar. El
  // simulador sigue evaluando sólo velas cerradas.
  const velasMs =
    papel && granularidad ? await velasPublicas(bot.market, granularidad, 300, true) : [];
  // La librería de gráficos trabaja en segundos; las velas llegan en milisegundos.
  const velas = velasMs.map((v) => ({ ...v, time: Math.floor(v.time / 1000) }));
  const precioActual = velas.length > 0 ? velas[velas.length - 1].close : null;
  const segundosPorVela = granularidad ? SEGUNDOS_POR_GRANULARIDAD[granularidad] : 0;

  // Lo que dice la biblioteca de esta estrategia, si el bot salió de ella.
  // La matrícula «biblioteca:<slug>» es el mismo convenio que usa el catálogo
  // para reconocer a los suyos.
  const slug = bot.magicNumber?.startsWith("biblioteca:") ? bot.magicNumber.slice("biblioteca:".length) : null;
  const estrategia = slug ? estrategiaPorSlug(slug) : null;
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
        <>
          {/* Primero lo que está pasando ahora mismo: la posición abierta, con
              su P&L latente contra el último cierre. Es la pregunta que trae a
              alguien a esta ficha cuando ve el bot encendido en el simulador. */}
          <PosicionAbiertaCard
            posicion={papel.posicion}
            precioActual={precioActual}
            moneda={currency}
            timezone={timezone}
          />

          {/* El gráfico de velas con cada entrada y cada salida marcada, que
              es como se lee una operación real en su ficha. Sin velas -- la API
              pública no respondió, o la temporalidad no es de las que sirve --
              se explica en vez de dejar un rectángulo con ejes. */}
          <Card>
            <CardHeader>
              <CardTitle>Entradas y salidas sobre el precio</CardTitle>
              <p className="text-xs text-muted-foreground">
                {bot.market} en velas de {bot.timeframe}. Flecha azul, entrada; naranja, salida.
                {papel.lastTickAt ? ` Última evaluación: ${formatDateTime(papel.lastTickAt, timezone)}.` : ""}{" "}
                La última vela es la que se está formando ahora; el bot sólo decide sobre velas
                ya cerradas, así que en {bot.timeframe} la mira {bot.timeframe === "1d" ? "una vez al día" : "al cerrarse"}.
              </p>
            </CardHeader>
            <CardContent>
              {velas.length > 0 ? (
                <BotChart
                  velas={velas}
                  operaciones={operacionesMarcables(papel.operaciones)}
                  posicion={posicionMarcable(papel.posicion)}
                  segundosPorVela={segundosPorVela}
                  moneda={currency}
                  direccionPorDefecto={estrategia?.reglas.direction === "SHORT" ? "CORTO" : "LARGO"}
                />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {granularidad
                    ? "No llegaron velas del mercado. Suele ser un fallo pasajero de la API pública de Coinbase; recarga en un momento."
                    : `La API pública no sirve velas de ${bot.timeframe}. Sólo 1m, 5m, 15m, 1h, 6h y 1d.`}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Curva de capital en papel{papel.enabled ? "" : " (apagado)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <PaperEquityChart
                puntos={papel.puntos}
                capitalAsignado={papel.capitalAsignado}
                timezone={timezone}
                moneda={currency}
                temporalidad={bot.timeframe}
              />
              {/* Abierta de entrada en cuanto hay algo que enseñar: plegada, un
                  bot con operaciones parecía no tener ninguna. */}
              <CollapsibleSection
                title="Operaciones simuladas (papel)"
                subtitle={`${papel.operaciones.length} cerrada${papel.operaciones.length === 1 ? "" : "s"}${papel.posicion ? " · 1 abierta" : ""}`}
                defaultOpen={papel.operaciones.length > 0}
              >
                <PaperTradesTabla
                  operaciones={papel.operaciones}
                  timezone={timezone}
                  moneda={currency}
                />
              </CollapsibleSection>
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* Qué hace la estrategia, contado entero: hipótesis, reglas traducidas
          a castellano, procedencia y cifras medidas si las hay. Sale de la
          biblioteca y no de una columna, para que una corrección llegue a
          todas las fichas a la vez. Un bot creado a mano no tiene entrada y
          se queda con su hipótesis de arriba. */}
      {estrategia ? (
        <Card>
          <CardHeader>
            <CardTitle>Qué hace esta estrategia</CardTitle>
          </CardHeader>
          <CardContent>
            <EstrategiaDetalle estrategia={estrategia} />
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
          {/* «Con dinero real» en el título a propósito: más arriba hay otra
              lista de operaciones, la del simulador, y con las dos llamadas
              «Operaciones» un bot que lleva diez en papel parecía no haber
              hecho ninguna. Ésta sólo se llena cuando el bot opera de verdad y
              sus operaciones de Coinbase se le asignan. */}
          <CollapsibleSection
            title="Operaciones con dinero real"
            subtitle={
              trades.length === 0
                ? papel
                  ? "Ninguna asignada · las del simulador están más arriba"
                  : "Ninguna asignada"
                : `${trades.length} asignadas · las más recientes primero`
            }
          >
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
