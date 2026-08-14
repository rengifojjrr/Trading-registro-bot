// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * lightweight-charts draws to a <canvas>, which jsdom has no 2D context
 * for. Everything below is about the controls *around* the chart -- which
 * timeframes are offered and which tools exist -- so the library is stubbed
 * rather than run. The candles themselves are verified by the Playwright
 * suite against a real browser.
 */
const priceScale = { applyOptions: vi.fn() };
const timeScale = {
  fitContent: vi.fn(),
  timeToCoordinate: vi.fn(() => 0),
  coordinateToTime: vi.fn(() => 0),
  subscribeVisibleTimeRangeChange: vi.fn(),
  unsubscribeVisibleTimeRangeChange: vi.fn(),
};
const series = {
  setData: vi.fn(),
  createPriceLine: vi.fn(() => ({})),
  removePriceLine: vi.fn(),
  priceToCoordinate: vi.fn(() => 0),
  coordinateToPrice: vi.fn(() => 0),
};

vi.mock("lightweight-charts", () => ({
  createChart: () => ({
    addSeries: () => series,
    priceScale: () => priceScale,
    timeScale: () => timeScale,
    subscribeClick: vi.fn(),
    unsubscribeClick: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    resize: vi.fn(),
    remove: vi.fn(),
  }),
  createSeriesMarkers: vi.fn(),
  CandlestickSeries: {},
  HistogramSeries: {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  PriceScaleMode: { Normal: 0, Logarithmic: 1 },
}));

vi.mock("@/lib/hooks/use-current-price", () => ({
  useCurrentPrice: () => ({ price: null }),
}));

import { TradeChart } from "./trade-chart";

const OPENED = Math.floor(new Date("2026-08-12T03:05:37Z").getTime() / 1000);
/** Deliberately days later: this is the shape of the user's real open position. */
const CLOSED = OPENED + 2 * 24 * 60 * 60;

function candle(offsetSeconds: number) {
  return {
    time: OPENED + offsetSeconds,
    open: 68000,
    high: 68100,
    low: 67900,
    close: 68050,
    volume: 12,
  };
}

function renderChart() {
  return render(
    <TradeChart
      tradeId="11111111-1111-1111-1111-111111111111"
      productId="BIP-20DEC30-CDE"
      direction="LONG"
      openedAtUnix={OPENED}
      closedAtUnix={CLOSED}
      initialCandles={[candle(0), candle(3600), candle(7200)]}
      initialGranularity="ONE_HOUR"
      initialDrawings={[]}
      entry={{ time: OPENED, price: 68000 }}
      exit={null}
      isOpen
    />,
  );
}

describe("TradeChart timeframes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers every timeframe, none disabled, even on a multi-day position", async () => {
    // The reported bug: on a position held for days, 1 min / 5 min / 15 min
    // / 30 min were all greyed out because the window was fixed at a week
    // and they couldn't fit inside it. Selecting a finer candle now zooms
    // in instead, so nothing is unselectable.
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("combobox"));
    const listbox = await screen.findByRole("listbox");

    for (const label of ["1 min", "5 min", "15 min", "30 min", "1 h", "2 h", "4 h", "6 h", "1 día"]) {
      const option = within(listbox).getByRole("option", { name: label });
      expect(option, label).not.toHaveAttribute("data-disabled");
      expect(option.getAttribute("aria-disabled")).not.toBe("true");
    }
  });

  it("says the entry is off screen instead of hiding the timeframe", async () => {
    const user = userEvent.setup();
    renderChart();

    // At 1 h the 2-day position fits (48 candles), so no warning.
    expect(screen.queryByText(/la entrada queda fuera de la vista/)).toBeNull();

    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "1 min" }));

    // 2 days can't fit in 300 one-minute candles, so the chart shows the
    // most recent slice and has to say so.
    expect(await screen.findByText(/la entrada queda fuera de la vista/)).toBeTruthy();
  });
});

describe("TradeChart tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes the full markup toolbar", () => {
    renderChart();

    for (const label of [
      "Cursor",
      "Línea horizontal (precio)",
      "Línea vertical (momento)",
      "Línea de tendencia",
      "Rectángulo",
      "Retroceso de Fibonacci",
      "Medir movimiento (no se guarda)",
    ]) {
      expect(screen.getByRole("button", { name: label }), label).toBeTruthy();
    }
  });

  it("exposes the view toggles", () => {
    renderChart();

    for (const label of ["Volumen", "Escala logarítmica", "Restablecer vista"]) {
      expect(screen.getByRole("button", { name: label }), label).toBeTruthy();
    }
  });

  it("disables undo and hide until there is something drawn", () => {
    renderChart();

    expect(screen.getByRole("button", { name: "Deshacer último dibujo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ocultar dibujos" })).toBeDisabled();
  });

  it("explains what to do once a tool is picked", async () => {
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("button", { name: "Línea vertical (momento)" }));
    expect(screen.getByText(/marcar un momento en el tiempo/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Medir movimiento (no se guarda)" }));
    expect(screen.getByText(/inicio del movimiento que quieres medir/)).toBeTruthy();
  });
});
