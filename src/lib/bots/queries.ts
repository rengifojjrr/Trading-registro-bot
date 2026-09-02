import "server-only";

import { DateTime } from "luxon";

import { fetchAccounts } from "@/lib/analytics/queries";
import { computeEquityCurve, type EquityCurvePoint } from "@/lib/analytics/stats";
import { requireUser } from "@/lib/auth/require-user";
import type { PendingItem } from "@/lib/pending/types";
import { createClient } from "@/lib/supabase/server";

import { blockAllocation, type BlockAllocation } from "./blocks";
import { correlationMatrix, type CorrelationMatrix } from "./correlation";
import { pendingDecisions } from "./decisions";
import { evaluateGate, type GateResult } from "./gates";
import {
  evaluateImpulse,
  impulseReport,
  type ImpulseEvaluation,
  type ImpulseReport,
  type ImpulseRecord,
} from "./impulses";
import { currentDrawdownPct, evaluateKillSwitch, type KillSwitchReading } from "./killswitch";
import {
  computeBotMetrics,
  dailyPnl,
  rollingWindow,
  type BotMetrics,
  type BotTrade,
} from "./metrics";
import { monteCarloDrawdown, type MonteCarloResult } from "./montecarlo";
import { rowToBot, rowToSettings, type BotRecord } from "./records";
import { evaluateHealth, type HealthReading } from "./semaforo";
import {
  IMPULSE_EVALUATION_DAYS,
  ROLLING_WINDOW_DAYS,
  ROLLING_WINDOW_TRADES,
  isImpulseAction,
  isProduction,
  type PortfolioSettings,
} from "./types";

/**
 * Lo que las pantallas de bots leen.
 *
 * Todo el cálculo está en los módulos puros de al lado; esto sólo trae las
 * filas y las junta. Se junta aquí, en un solo sitio, porque cada pantalla
 * necesita la misma foto -- el semáforo de un bot depende de sus operaciones
 * y de los umbrales, el kill-switch de las de todos, las decisiones de todo
 * lo anterior -- y calcularla en cada página acabaría con tres versiones que
 * no coinciden.
 */

export interface BotContext {
  userId: string;
  timezone: string;
  /** El capital, si está en configuración. Sin él no hay drawdown en porcentaje. */
  accountSize: number | null;
  currency: string;
  settings: PortfolioSettings;
}

export async function readBotContext(): Promise<BotContext> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: app }, { data: row }, accounts] = await Promise.all([
    supabase.from("app_settings").select("timezone, account_size").eq("user_id", user.id).maybeSingle(),
    supabase.from("bot_portfolio_settings").select("*").eq("user_id", user.id).maybeSingle(),
    fetchAccounts(),
  ]);

  const accountSize = app?.account_size ? Number(app.account_size) : null;

  return {
    userId: user.id,
    timezone: app?.timezone || "UTC",
    accountSize: accountSize && accountSize > 0 ? accountSize : null,
    currency: accounts[0]?.currency ?? "USD",
    settings: rowToSettings(row),
  };
}

/** Una operación de un bot, con lo que la lista de la ficha enseña. */
export interface BotTradeRow extends BotTrade {
  botId: string;
  direction: "LONG" | "SHORT";
  productId: string;
  returnPct: string | null;
}

const BOT_TRADE_COLUMNS =
  "id, bot_id, status, opened_at, closed_at, net_pnl, gross_pnl, total_commissions, direction, product_id, return_pct";

/**
 * Las operaciones de los bots, agrupadas por bot.
 *
 * `closedDay` se calcula aquí porque es el único sitio que sabe la zona: el
 * P&L diario -- del que salen el Sharpe y las correlaciones -- tiene que
 * cortar por los días del usuario, no por los de UTC.
 */
export async function fetchBotTrades(
  userId: string,
  timezone: string,
  botIds?: string[],
): Promise<Map<string, BotTradeRow[]>> {
  const supabase = await createClient();

  let query = supabase
    .from("trades")
    .select(BOT_TRADE_COLUMNS)
    .eq("user_id", userId)
    .is("orphaned_at", null)
    .not("bot_id", "is", null);
  if (botIds) query = query.in("bot_id", botIds);

  const { data, error } = await query.order("opened_at", { ascending: true });
  if (error) throw new Error(`fetchBotTrades: ${error.message}`);

  const porBot = new Map<string, BotTradeRow[]>();
  for (const t of data ?? []) {
    if (!t.bot_id) continue;
    const fila: BotTradeRow = {
      id: t.id,
      botId: t.bot_id,
      status: t.status,
      openedAt: t.opened_at,
      closedAt: t.closed_at,
      closedDay: t.closed_at
        ? DateTime.fromISO(t.closed_at, { zone: "utc" }).setZone(timezone).toFormat("yyyy-LL-dd")
        : null,
      netPnl: t.net_pnl,
      grossPnl: t.gross_pnl,
      totalCommissions: t.total_commissions,
      direction: t.direction,
      productId: t.product_id,
      returnPct: t.return_pct,
    };
    const lista = porBot.get(t.bot_id) ?? [];
    lista.push(fila);
    porBot.set(t.bot_id, lista);
  }
  return porBot;
}

export interface BotView {
  bot: BotRecord;
  /** Todo su histórico. */
  metrics: BotMetrics;
  /** La ventana móvil: lo que mira el semáforo. */
  rolling: BotMetrics;
  health: HealthReading;
  gate: GateResult;
  montecarlo: MonteCarloResult | null;
  /** Si desde que firmó el contrato lo ha superado. */
  contractBreached: boolean;
}

function cerradas<T extends BotTrade>(trades: T[]): (T & { closedAt: string; netPnl: string })[] {
  return trades
    .filter((t): t is T & { closedAt: string; netPnl: string } => t.status === "CLOSED" && t.closedAt !== null && t.netPnl !== null)
    .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
}

/**
 * Operaciones abiertas o cerradas en la ventana, para el watchdog.
 *
 * Abiertas también: un swing con una posición de tres semanas no ha cerrado
 * nada, pero está vivo.
 */
function actividadReciente(trades: BotTrade[], now: Date): number {
  const desde = now.getTime() - ROLLING_WINDOW_DAYS * 86_400_000;
  return trades.filter(
    (t) => Date.parse(t.openedAt) >= desde || (t.closedAt !== null && Date.parse(t.closedAt) >= desde),
  ).length;
}

export function buildBotView(bot: BotRecord, trades: BotTrade[], ctx: BotContext, now: Date): BotView {
  const metrics = computeBotMetrics(trades, ctx.accountSize);

  const ventana = rollingWindow(trades, now, ROLLING_WINDOW_DAYS, ROLLING_WINDOW_TRADES);
  const rolling = computeBotMetrics(ventana, ctx.accountSize);

  // El histórico de antes de la ventana: la referencia cuando no hay backtest.
  const enVentana = new Set(ventana.map((t) => t.id));
  const anteriores = trades.filter((t) => t.status === "CLOSED" && !enVentana.has(t.id));
  const historical = anteriores.length > 0 ? computeBotMetrics(anteriores, ctx.accountSize) : null;

  const health = evaluateHealth({
    rolling,
    declared: bot.baseline,
    historical,
    contractDrawdownPct: bot.drawdownContractPct,
  });

  const gate = evaluateGate(metrics, ctx.settings.gates);
  const montecarlo = monteCarloDrawdown(
    cerradas(trades).map((t) => Number(t.netPnl)),
    ctx.accountSize,
  );

  // Desde la firma, no desde siempre: lo que hizo en papel antes de firmar
  // no es incumplimiento de nada.
  let contractBreached = false;
  if (bot.drawdownContractPct !== null) {
    const desde = bot.contractSignedAt ? Date.parse(bot.contractSignedAt) : 0;
    const posteriores = trades.filter((t) => t.closedAt !== null && Date.parse(t.closedAt) >= desde);
    const m = computeBotMetrics(posteriores, ctx.accountSize);
    contractBreached = m.maxDrawdownPct !== null && m.maxDrawdownPct > bot.drawdownContractPct;
  }

  return { bot, metrics, rolling, health, gate, montecarlo, contractBreached };
}

export interface PortfolioView {
  context: BotContext;
  bots: BotView[];
  /** Las cifras del equipo entero: sólo staging y producción. */
  team: BotMetrics;
  drawdown: ReturnType<typeof currentDrawdownPct>;
  killSwitch: KillSwitchReading;
  allocation: BlockAllocation;
  correlation: CorrelationMatrix;
  /** Para poner nombre a los pares de la matriz. */
  names: Record<string, string>;
  impulses: ImpulseEvaluation[];
  impulseReport: ImpulseReport;
  decisions: PendingItem[];
}

export async function buildPortfolio(now: Date = new Date()): Promise<PortfolioView> {
  const ctx = await readBotContext();
  const supabase = await createClient();

  const [{ data: botRows, error }, tradesByBot, { data: impulseRows }] = await Promise.all([
    supabase.from("bots").select("*").eq("user_id", ctx.userId).order("created_at", { ascending: false }),
    fetchBotTrades(ctx.userId, ctx.timezone),
    supabase
      .from("bot_impulses")
      .select("id, bot_id, action, note, executed, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (error) throw new Error(`buildPortfolio: ${error.message}`);

  const bots = (botRows ?? []).map(rowToBot);
  const names: Record<string, string> = Object.fromEntries(bots.map((b) => [b.id, b.name]));
  const views = bots.map((b) => buildBotView(b, tradesByBot.get(b.id) ?? [], ctx, now));

  // El equipo: lo que opera con dinero. La escalera mira su curva conjunta.
  const enProduccion = views.filter((v) => isProduction(v.bot.phase));
  const delEquipo = enProduccion.flatMap((v) => tradesByBot.get(v.bot.id) ?? []);
  const team = computeBotMetrics(delEquipo, ctx.accountSize);
  const drawdown = currentDrawdownPct(
    cerradas(delEquipo).map((t) => Number(t.netPnl)),
    ctx.accountSize,
  );
  const killSwitch = evaluateKillSwitch(drawdown.drawdownPct, ctx.settings.killSwitch);

  const allocation = blockAllocation(
    bots.map((b) => ({ block: b.block, phase: b.phase, sizingPct: b.sizingPct })),
    ctx.settings.targets,
  );

  const correlation = correlationMatrix(
    views
      .filter((v) => v.bot.phase !== "RETIRADO" && v.metrics.trades > 0)
      .map((v) => ({ id: v.bot.id, daily: dailyPnl(cerradas(tradesByBot.get(v.bot.id) ?? [])) })),
  );

  const todas = [...tradesByBot.values()].flat();
  const impulses = (impulseRows ?? [])
    .filter((r) => isImpulseAction(r.action))
    .map((r) => {
      const registro: ImpulseRecord = {
        id: r.id,
        botId: r.bot_id,
        botName: r.bot_id ? (names[r.bot_id] ?? null) : null,
        action: r.action as ImpulseRecord["action"],
        note: r.note,
        executed: r.executed,
        createdAt: r.created_at,
      };
      return evaluateImpulse(registro, r.bot_id ? (tradesByBot.get(r.bot_id) ?? []) : todas, now);
    });

  // Los que acaban de cumplir la semana: hay una cifra nueva que mirar.
  const recienEvaluables = impulses.filter(
    (i) =>
      i.status === "EVALUADO" &&
      now.getTime() - Date.parse(i.evaluableAt) <= IMPULSE_EVALUATION_DAYS * 86_400_000,
  ).length;

  const decisions = pendingDecisions({
    bots: views.map((v) => ({
      id: v.bot.id,
      name: v.bot.name,
      phase: v.bot.phase,
      block: v.bot.block,
      health: v.health,
      gate: v.gate,
      contractBreached: v.contractBreached,
      tradesLast30Days: actividadReciente(tradesByBot.get(v.bot.id) ?? [], now),
      // Lo que prometió o, si no prometió nada, su propio ritmo -- sólo con
      // dos meses de histórico: dos operaciones en su primer día no son
      // «sesenta al mes».
      expectedTradesPerMonth:
        v.bot.baseline.tradesPerMonth ?? (v.metrics.spanDays >= 60 ? v.metrics.tradesPerMonth : null),
    })),
    killSwitch,
    allocation,
    redundantPairs: correlation.redundant.map((p) => ({
      a: names[p.a] ?? p.a,
      b: names[p.b] ?? p.b,
      rho: p.rho ?? 0,
    })),
    impulsesToEvaluate: recienEvaluables,
  });

  return {
    context: ctx,
    bots: views,
    team,
    drawdown,
    killSwitch,
    allocation,
    correlation,
    names,
    impulses,
    impulseReport: impulseReport(impulses),
    decisions,
  };
}

export interface PhaseHistoryRow {
  id: string;
  fromPhase: string | null;
  toPhase: string;
  reason: string | null;
  metrics: Record<string, unknown>;
  createdAt: string;
}

export interface BotDetail {
  view: BotView;
  context: BotContext;
  trades: BotTradeRow[];
  equity: EquityCurvePoint[];
  history: PhaseHistoryRow[];
  impulses: ImpulseEvaluation[];
}

export async function fetchBotDetail(botId: string, now: Date = new Date()): Promise<BotDetail | null> {
  const ctx = await readBotContext();
  const supabase = await createClient();

  const [{ data: row }, tradesByBot, { data: historyRows }, { data: impulseRows }] = await Promise.all([
    supabase.from("bots").select("*").eq("user_id", ctx.userId).eq("id", botId).maybeSingle(),
    fetchBotTrades(ctx.userId, ctx.timezone, [botId]),
    supabase
      .from("bot_phase_history")
      .select("id, from_phase, to_phase, reason, metrics, created_at")
      .eq("bot_id", botId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("bot_impulses")
      .select("id, bot_id, action, note, executed, created_at")
      .eq("user_id", ctx.userId)
      .eq("bot_id", botId)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (!row) return null;

  const bot = rowToBot(row);
  const trades = tradesByBot.get(botId) ?? [];
  const view = buildBotView(bot, trades, ctx, now);

  const impulses = (impulseRows ?? [])
    .filter((r) => isImpulseAction(r.action))
    .map((r) =>
      evaluateImpulse(
        {
          id: r.id,
          botId: r.bot_id,
          botName: bot.name,
          action: r.action as ImpulseRecord["action"],
          note: r.note,
          executed: r.executed,
          createdAt: r.created_at,
        },
        trades,
        now,
      ),
    );

  return {
    view,
    context: ctx,
    // Las más recientes primero en la lista; la curva va en orden.
    trades: [...trades].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt)),
    equity: computeEquityCurve(trades),
    history: (historyRows ?? []).map((h) => ({
      id: h.id,
      fromPhase: h.from_phase,
      toPhase: h.to_phase,
      reason: h.reason,
      metrics: (typeof h.metrics === "object" && h.metrics !== null && !Array.isArray(h.metrics)
        ? h.metrics
        : {}) as Record<string, unknown>,
      createdAt: h.created_at,
    })),
    impulses,
  };
}

/** Lo que hace falta para asignar operaciones o apuntar un impulso: nombre y fase. */
export async function fetchBotChoices(): Promise<{ id: string; name: string; phase: string }[]> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("bots")
    .select("id, name, phase")
    .eq("user_id", user.id)
    .neq("phase", "RETIRADO")
    .order("name");

  return data ?? [];
}

/** Las estrategias de backtest y las etiquetas de estrategia, para enlazarlas desde la ficha. */
export async function fetchBotFormOptions(): Promise<{
  backtestStrategies: { id: string; name: string }[];
  strategies: { id: string; name: string }[];
}> {
  const user = await requireUser();
  const supabase = await createClient();

  const [{ data: backtest }, { data: strategies }] = await Promise.all([
    supabase
      .from("backtest_strategies")
      .select("id, name")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("name"),
    supabase.from("strategies").select("id, name").eq("user_id", user.id).eq("is_active", true).order("name"),
  ]);

  return { backtestStrategies: backtest ?? [], strategies: strategies ?? [] };
}

/**
 * La foto de un bot en el momento de cambiarlo de fase.
 *
 * Es lo que se guarda en el historial: sin ella, la decisión de ascender no
 * se puede revisar después.
 */
export async function snapshotForHistory(botId: string, now: Date = new Date()) {
  const detail = await fetchBotDetail(botId, now);
  if (!detail) return null;
  const { metrics, gate, health } = detail.view;
  return {
    bot: detail.view.bot,
    metrics: {
      trades: metrics.trades,
      netPnl: metrics.netPnl,
      profitFactor: metrics.profitFactor,
      expectancyR: metrics.expectancyR,
      sharpe: metrics.sharpe,
      maxDrawdownPct: metrics.maxDrawdownPct,
      gate: gate.verdict,
      semaforo: health.state,
    },
    gate,
  };
}
