import { describe, expect, it } from "vitest";

import {
  EMPTY_METRICS,
  computeBotMetrics,
  dailyPnl,
  rollingWindow,
  sharpe,
  sortino,
  type BotTrade,
} from "./metrics";

let contador = 0;

function cerrada(netPnl: string, closedAt: string): BotTrade {
  contador += 1;
  return {
    id: `t${contador}`,
    status: "CLOSED",
    openedAt: closedAt,
    closedAt,
    closedDay: closedAt.slice(0, 10),
    netPnl,
    grossPnl: netPnl,
    totalCommissions: "0",
  };
}

function abierta(): BotTrade {
  contador += 1;
  return {
    id: `t${contador}`,
    status: "OPEN",
    openedAt: "2026-08-01T10:00:00Z",
    closedAt: null,
    closedDay: null,
    netPnl: null,
    grossPnl: null,
    totalCommissions: "0",
  };
}

describe("computeBotMetrics", () => {
  it("sin cerradas devuelve las cifras vacías, contando las abiertas", () => {
    expect(computeBotMetrics([abierta()], 1000)).toEqual({ ...EMPTY_METRICS, openTrades: 1 });
  });

  it("calcula la expectativa en R con la pérdida media como unidad", () => {
    const trades = [
      cerrada("100", "2026-08-01T10:00:00Z"),
      cerrada("100", "2026-08-02T10:00:00Z"),
      cerrada("-50", "2026-08-03T10:00:00Z"),
      cerrada("100", "2026-08-04T10:00:00Z"),
      cerrada("-50", "2026-08-05T10:00:00Z"),
    ];

    const m = computeBotMetrics(trades, 1000);

    expect(m.trades).toBe(5);
    expect(m.winRate).toBe(60);
    expect(m.profitFactor).toBe(3);
    expect(m.expectancy).toBe("40");
    expect(m.averageLoss).toBe("50.00");
    expect(m.expectancyR).toBe(0.8);
    expect(m.payoff).toBe(2);
    expect(m.netPnl).toBe("200");
    expect(m.maxDrawdown).toBe("50");
    expect(m.maxDrawdownPct).toBe(5);
    expect(m.recoveryFactor).toBe(4);
    expect(m.spanDays).toBe(5);
    expect(m.firstClose).toBe("2026-08-01T10:00:00Z");
    expect(m.lastClose).toBe("2026-08-05T10:00:00Z");
  });

  it("sin tamaño de cuenta no inventa el drawdown en porcentaje", () => {
    const m = computeBotMetrics([cerrada("-10", "2026-08-01T10:00:00Z")], null);
    expect(m.maxDrawdownPct).toBeNull();
  });

  it("sin perdedoras no hay unidad R ni profit factor", () => {
    const m = computeBotMetrics([cerrada("10", "2026-08-01T10:00:00Z")], 1000);
    expect(m.expectancyR).toBeNull();
    expect(m.profitFactor).toBeNull();
    expect(m.payoff).toBeNull();
  });

  it("estima las operaciones por mes con el tramo que abarca el histórico", () => {
    const trades = [
      cerrada("1", "2026-07-01T10:00:00Z"),
      cerrada("1", "2026-07-31T10:00:00Z"),
    ];
    const m = computeBotMetrics(trades, null);
    // Dos operaciones en 31 días: unas dos al mes.
    expect(m.tradesPerMonth).toBeCloseTo(1.96, 1);
  });
});

describe("dailyPnl", () => {
  it("rellena a cero los días sin operar entre el primero y el último", () => {
    const serie = dailyPnl([
      { closedAt: "2026-08-01T10:00:00Z", closedDay: "2026-08-01", netPnl: "10" },
      { closedAt: "2026-08-01T12:00:00Z", closedDay: "2026-08-01", netPnl: "5" },
      { closedAt: "2026-08-04T10:00:00Z", closedDay: "2026-08-04", netPnl: "-3" },
    ]);

    expect([...serie.entries()]).toEqual([
      ["2026-08-01", 15],
      ["2026-08-02", 0],
      ["2026-08-03", 0],
      ["2026-08-04", -3],
    ]);
  });

  it("usa el día local si viene, y el UTC si no", () => {
    const serie = dailyPnl([{ closedAt: "2026-08-02T01:00:00Z", closedDay: "2026-08-01", netPnl: "1" }]);
    expect([...serie.keys()]).toEqual(["2026-08-01"]);

    const sinDia = dailyPnl([{ closedAt: "2026-08-02T01:00:00Z", closedDay: null, netPnl: "1" }]);
    expect([...sinDia.keys()]).toEqual(["2026-08-02"]);
  });
});

describe("sharpe y sortino", () => {
  it("no se pronuncian con menos de cinco días", () => {
    expect(sharpe([1, 2, 3, 4])).toBeNull();
    expect(sortino([1, -2, 3, 4])).toBeNull();
  });

  it("son invariantes a la escala", () => {
    const base = [10, -5, 20, -3, 8, 0, 12];
    const doble = base.map((v) => v * 2);
    expect(sharpe(doble)).toBeCloseTo(sharpe(base)!, 10);
    expect(sortino(doble)).toBeCloseTo(sortino(base)!, 10);
  });

  it("sin variación no hay Sharpe; sin días negativos no hay Sortino", () => {
    expect(sharpe([5, 5, 5, 5, 5])).toBeNull();
    expect(sortino([1, 2, 3, 4, 5])).toBeNull();
  });
});

describe("rollingWindow", () => {
  const ahora = new Date("2026-09-01T00:00:00Z");

  it("elige por días cuando trae más operaciones que por cuenta", () => {
    const trades = Array.from({ length: 12 }, (_, i) =>
      cerrada("1", `2026-08-${String(i + 10).padStart(2, "0")}T10:00:00Z`),
    );
    expect(rollingWindow(trades, ahora, 30, 5)).toHaveLength(12);
  });

  it("elige por cuenta cuando el bot opera poco", () => {
    const trades = [
      cerrada("1", "2026-01-01T10:00:00Z"),
      cerrada("1", "2026-03-01T10:00:00Z"),
      cerrada("1", "2026-05-01T10:00:00Z"),
      cerrada("1", "2026-08-25T10:00:00Z"),
    ];
    const ventana = rollingWindow(trades, ahora, 30, 3);
    expect(ventana.map((t) => t.closedAt)).toEqual([
      "2026-03-01T10:00:00Z",
      "2026-05-01T10:00:00Z",
      "2026-08-25T10:00:00Z",
    ]);
  });

  it("ignora las abiertas", () => {
    expect(rollingWindow([abierta()], ahora, 30, 30)).toEqual([]);
  });
});
