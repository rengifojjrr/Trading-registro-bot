import { Decimal } from "decimal.js";
import { DateTime } from "luxon";

import type { MistakeCode } from "@/lib/journal/mistakes";

import type { TradeForStats } from "./stats";

/**
 * The analytics that are about the trader rather than the market: what
 * mistakes cost, whether losing streaks change position size, how much of
 * the result the broker takes, and whether any of this beats doing nothing.
 *
 * All pure. Every function takes plain rows and returns plain numbers, so
 * each can be checked against a worked example in a test rather than being
 * believed because it appeared on a dashboard.
 */

// ---------------------------------------------------------------- mistakes

export interface MistakeCost {
  code: MistakeCode;
  trades: number;
  /** Total net P&L of the trades carrying this tag. Usually negative -- that's the point. */
  totalNetPnl: string;
  /** Average per trade, so a single disaster doesn't outrank a persistent leak. */
  averageNetPnl: string;
}

export function computeMistakeCost(
  trades: (TradeForStats & { mistakes: MistakeCode[] })[],
): MistakeCost[] {
  const byCode = new Map<MistakeCode, { trades: number; total: Decimal }>();

  for (const trade of trades) {
    if (trade.status !== "CLOSED" || trade.netPnl === null) continue;
    for (const code of new Set(trade.mistakes)) {
      const bucket = byCode.get(code) ?? { trades: 0, total: new Decimal(0) };
      bucket.trades += 1;
      bucket.total = bucket.total.plus(trade.netPnl);
      byCode.set(code, bucket);
    }
  }

  return [...byCode.entries()]
    .map(([code, { trades: count, total }]) => ({
      code,
      trades: count,
      totalNetPnl: total.toString(),
      averageNetPnl: total.dividedBy(count).toString(),
    }))
    // Most expensive first: the ranking is the actionable part.
    .sort((a, b) => new Decimal(a.totalNetPnl).comparedTo(b.totalNetPnl));
}

// ----------------------------------------------------------------- streaks

export interface StreakSizingEffect {
  /** Average size of the trade taken right after N consecutive losses. */
  afterLosses: { streak: number; trades: number; averageSize: string }[];
  /** Same, after consecutive wins. */
  afterWins: { streak: number; trades: number; averageSize: string }[];
}

/**
 * Whether a run of losses (or wins) changes how big the next trade is.
 *
 * This is the most common and most expensive behavioural leak there is:
 * doubling up to recover, or sizing down right when the edge returns.
 * Nothing else in the app would surface it, because each trade looks
 * perfectly reasonable on its own.
 */
export function computeStreakSizing(
  trades: (TradeForStats & { maxSize: string })[],
): StreakSizingEffect {
  const closed = trades
    .filter((t) => t.status === "CLOSED" && t.netPnl !== null && t.closedAt !== null)
    .sort((a, b) => (a.closedAt! < b.closedAt! ? -1 : 1));

  const afterLosses = new Map<number, Decimal[]>();
  const afterWins = new Map<number, Decimal[]>();

  let lossRun = 0;
  let winRun = 0;

  for (const trade of closed) {
    // Record this trade's size against the streak that preceded it, before
    // updating the streak with its own result.
    if (lossRun > 0) {
      const bucket = afterLosses.get(lossRun) ?? [];
      bucket.push(new Decimal(trade.maxSize));
      afterLosses.set(lossRun, bucket);
    }
    if (winRun > 0) {
      const bucket = afterWins.get(winRun) ?? [];
      bucket.push(new Decimal(trade.maxSize));
      afterWins.set(winRun, bucket);
    }

    const pnl = new Decimal(trade.netPnl!);
    if (pnl.isNegative()) {
      lossRun += 1;
      winRun = 0;
    } else if (pnl.isPositive()) {
      winRun += 1;
      lossRun = 0;
    } else {
      // Breakeven breaks both runs: it is neither a loss to recover from
      // nor a win to press.
      lossRun = 0;
      winRun = 0;
    }
  }

  const summarise = (map: Map<number, Decimal[]>) =>
    [...map.entries()]
      .map(([streak, sizes]) => ({
        streak,
        trades: sizes.length,
        averageSize: sizes
          .reduce((sum, s) => sum.plus(s), new Decimal(0))
          .dividedBy(sizes.length)
          .toString(),
      }))
      .sort((a, b) => a.streak - b.streak);

  return { afterLosses: summarise(afterLosses), afterWins: summarise(afterWins) };
}

// -------------------------------------------------------- commission drag

export interface CommissionDrag {
  grossPnl: string;
  commissions: string;
  netPnl: string;
  /** Commissions as a percentage of gross profit. Null when there was no gross profit to eat into. */
  dragPct: number | null;
  /** How many of the winning trades' gross profit the commissions consumed. */
  message: string;
}

export function computeCommissionDrag(trades: TradeForStats[]): CommissionDrag {
  const closed = trades.filter((t) => t.status === "CLOSED" && t.netPnl !== null);

  const gross = closed.reduce((sum, t) => sum.plus(t.grossPnl ?? 0), new Decimal(0));
  const commissions = closed.reduce((sum, t) => sum.plus(t.totalCommissions ?? 0), new Decimal(0));
  const net = gross.minus(commissions);

  const dragPct = gross.isZero() || gross.isNegative()
    ? null
    : commissions.dividedBy(gross).times(100).toNumber();

  let message: string;
  if (closed.length === 0) {
    message = "Todavía no hay operaciones cerradas.";
  } else if (dragPct === null) {
    message = "El resultado bruto no fue positivo, así que no hay ganancia de la que descontar.";
  } else if (dragPct >= 100) {
    message = "Las comisiones se comieron toda la ganancia bruta: sin ellas el período habría sido positivo.";
  } else if (dragPct >= 30) {
    message = `Las comisiones se llevan el ${dragPct.toFixed(1)}% de tu ganancia bruta. Es mucho: revisa tamaño y frecuencia.`;
  } else {
    message = `Las comisiones se llevan el ${dragPct.toFixed(1)}% de tu ganancia bruta.`;
  }

  return {
    grossPnl: gross.toString(),
    commissions: commissions.toString(),
    netPnl: net.toString(),
    dragPct,
    message,
  };
}

// ------------------------------------------------------- expectancy / ruin

export interface ExpectancyResult {
  /** Average net P&L per closed trade. Null with no closed trades. */
  expectancy: string | null;
  winRate: number | null;
  averageWin: string | null;
  averageLoss: string | null;
  /** Average win divided by average loss. Null when there are no losses. */
  payoffRatio: number | null;
  /**
   * Probability of losing the whole account, given this edge and a fixed
   * fraction risked per trade. Null when the edge is undefined.
   */
  riskOfRuin: number | null;
  message: string;
}

/**
 * Expectancy and risk of ruin from the trader's own realised distribution.
 *
 * Risk of ruin uses the classic fixed-fraction approximation: with a
 * per-trade win probability p, payoff ratio b, and a fixed fraction risked,
 * ruin probability is ((1-A)/(1+A))^u where A is the edge per unit risked
 * and u the number of risk units in the account. It is an estimate, not a
 * guarantee -- it assumes every trade risks the same fraction and that past
 * frequencies predict future ones, neither of which is quite true. It is
 * reported anyway because "a 4% chance of losing everything" changes
 * behaviour in a way that a win rate never does.
 */
export function computeExpectancy(
  trades: TradeForStats[],
  options: { riskUnitsInAccount?: number } = {},
): ExpectancyResult {
  const closed = trades.filter(
    (t): t is TradeForStats & { netPnl: string } => t.status === "CLOSED" && t.netPnl !== null,
  );

  if (closed.length === 0) {
    return {
      expectancy: null,
      winRate: null,
      averageWin: null,
      averageLoss: null,
      payoffRatio: null,
      riskOfRuin: null,
      message: "Todavía no hay operaciones cerradas.",
    };
  }

  const wins = closed.filter((t) => new Decimal(t.netPnl).isPositive());
  const losses = closed.filter((t) => new Decimal(t.netPnl).isNegative());

  const total = closed.reduce((sum, t) => sum.plus(t.netPnl), new Decimal(0));
  const expectancy = total.dividedBy(closed.length);
  const winRate = (wins.length / closed.length) * 100;

  const averageWin = wins.length
    ? wins.reduce((s, t) => s.plus(t.netPnl), new Decimal(0)).dividedBy(wins.length)
    : null;
  const averageLoss = losses.length
    ? losses.reduce((s, t) => s.plus(t.netPnl), new Decimal(0)).abs().dividedBy(losses.length)
    : null;

  const payoffRatio =
    averageWin && averageLoss && !averageLoss.isZero()
      ? averageWin.dividedBy(averageLoss).toNumber()
      : null;

  let riskOfRuin: number | null = null;
  let message: string;

  if (payoffRatio === null) {
    message = losses.length === 0
      ? "Sin operaciones perdedoras todavía: el riesgo de ruina no está definido."
      : "Sin operaciones ganadoras todavía.";
  } else {
    const p = wins.length / closed.length;
    // Edge per unit risked, in the units the ruin formula expects.
    const edge = (p * (1 + payoffRatio) - 1) / payoffRatio;
    const riskUnits = options.riskUnitsInAccount ?? 20;

    if (edge <= 0) {
      riskOfRuin = 1;
      message = "Con esta distribución no hay ventaja: sostenida en el tiempo, la ruina es el resultado esperado.";
    } else {
      riskOfRuin = Math.pow((1 - edge) / (1 + edge), riskUnits);
      message =
        riskOfRuin > 0.05
          ? `Con ${riskUnits} unidades de riesgo en la cuenta, la probabilidad estimada de perderlo todo es ${(riskOfRuin * 100).toFixed(1)}%. Arriesga menos por operación para bajarla.`
          : `Con ${riskUnits} unidades de riesgo en la cuenta, la probabilidad estimada de perderlo todo es ${(riskOfRuin * 100).toFixed(2)}%.`;
    }
  }

  return {
    expectancy: expectancy.toString(),
    winRate,
    averageWin: averageWin?.toString() ?? null,
    averageLoss: averageLoss?.toString() ?? null,
    payoffRatio,
    riskOfRuin,
    message,
  };
}

// ---------------------------------------------------------- buy and hold

export interface BuyAndHoldComparison {
  tradingNetPnl: string;
  buyAndHoldPnl: string;
  /** Trading result minus buy-and-hold. Negative means doing nothing would have paid better. */
  difference: string;
  beatsBuyAndHold: boolean;
  message: string;
}

/**
 * What the same capital would have made simply held over the period.
 *
 * Uncomfortable on purpose. Activity feels productive, and this is the only
 * figure in the app that asks whether it actually was.
 */
export function compareToBuyAndHold(params: {
  tradingNetPnl: string | number;
  /** Price at the start of the compared period. */
  startPrice: string | number;
  endPrice: string | number;
  /** Size that would have been held: usually the average position size. */
  size: string | number;
  contractSize: string | number;
}): BuyAndHoldComparison {
  const trading = new Decimal(params.tradingNetPnl);
  const priceDelta = new Decimal(params.endPrice).minus(params.startPrice);
  const held = priceDelta.times(params.size).times(params.contractSize);
  const difference = trading.minus(held);

  return {
    tradingNetPnl: trading.toString(),
    buyAndHoldPnl: held.toString(),
    difference: difference.toString(),
    beatsBuyAndHold: difference.isPositive(),
    message: difference.isPositive()
      ? "Tu operativa rindió más que quedarte quieto en el período."
      : difference.isZero()
        ? "Tu operativa rindió exactamente lo mismo que quedarte quieto."
        : "Quedarte quieto habría rendido más que operar en este período.",
  };
}

// ------------------------------------------------------------ daily limits

export interface DailyLimitStatus {
  date: string;
  tradesTaken: number;
  realizedPnl: string;
  exceededLossLimit: boolean;
  exceededTradeLimit: boolean;
}

/**
 * Which days broke the trader's own rules.
 *
 * Reported after the fact, never enforced: this app holds a read-only key
 * and could not stop an order even if it wanted to. Seeing that the rule
 * was broken on the three worst days of the month is the useful part.
 */
export function computeDailyLimitBreaches(
  trades: TradeForStats[],
  timezone: string,
  limits: { maxDailyLoss?: number | null; maxTradesPerDay?: number | null },
): DailyLimitStatus[] {
  const byDay = new Map<string, { count: number; pnl: Decimal }>();

  for (const trade of trades) {
    if (trade.status !== "CLOSED" || trade.closedAt === null || trade.netPnl === null) continue;
    const day = DateTime.fromISO(trade.closedAt, { zone: "utc" }).setZone(timezone).toISODate();
    if (!day) continue;
    const bucket = byDay.get(day) ?? { count: 0, pnl: new Decimal(0) };
    bucket.count += 1;
    bucket.pnl = bucket.pnl.plus(trade.netPnl);
    byDay.set(day, bucket);
  }

  return [...byDay.entries()]
    .map(([date, { count, pnl }]) => ({
      date,
      tradesTaken: count,
      realizedPnl: pnl.toString(),
      exceededLossLimit:
        limits.maxDailyLoss != null && limits.maxDailyLoss > 0 && pnl.negated().gt(limits.maxDailyLoss),
      exceededTradeLimit:
        limits.maxTradesPerDay != null && limits.maxTradesPerDay > 0 && count > limits.maxTradesPerDay,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}
