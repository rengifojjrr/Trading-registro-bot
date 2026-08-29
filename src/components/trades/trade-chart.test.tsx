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

import { GROUP_LABELS, TOOLS } from "@/lib/charts/tools";

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

function renderChart(overrides: { isOpen?: boolean; exit?: { time: number; price: number } | null } = {}) {
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
      exit={overrides.exit ?? null}
      isOpen={overrides.isOpen ?? true}
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

    await user.click(screen.getByRole("combobox", { name: "Temporalidad" }));
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

    await user.click(screen.getByRole("combobox", { name: "Temporalidad" }));
    await user.click(await screen.findByRole("option", { name: "1 min" }));

    // 2 days can't fit in 300 one-minute candles, so the chart shows the
    // most recent slice and has to say so.
    expect(await screen.findByText(/la entrada queda fuera de la vista/)).toBeTruthy();
  });
});

describe("TradeChart live refresh", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockCandleFetch() {
    const fetchMock = vi.fn(async (url: string | URL) => {
      void url;
      return {
        json: async () => ({ candles: [candle(0), candle(3600), candle(7200), candle(10800)] }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("keeps re-fetching candles while the position is open", async () => {
    // The reported bug: candles were fetched once at page load and never
    // again, so the chart's right edge froze while the "Ahora" line kept
    // moving -- two different prices for the same instant on one chart.
    const fetchMock = mockCandleFetch();
    vi.useFakeTimers();
    try {
      renderChart({ isOpen: true });
      expect(fetchMock).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(61_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain("/api/coinbase/trade-candles");

      await vi.advanceTimersByTimeAsync(60_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("does not poll for a closed trade", async () => {
    // A finished trade's candles can never change, so polling would be
    // pure waste against Coinbase's rate limit.
    const fetchMock = mockCandleFetch();
    vi.useFakeTimers();
    try {
      renderChart({ isOpen: false });
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it("refreshes without re-framing the view the user set", async () => {
    const fetchMock = mockCandleFetch();
    vi.useFakeTimers();
    try {
      renderChart({ isOpen: true });
      timeScale.fitContent.mockClear();

      await vi.advanceTimersByTimeAsync(61_000);

      expect(fetchMock).toHaveBeenCalled();
      // Re-framing on every refresh would yank a zoomed-in chart back once
      // a minute.
      expect(timeScale.fitContent).not.toHaveBeenCalled();
      // The refreshed candles still reach the existing series.
      expect(series.setData).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});

describe("TradeChart tools", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ofrece las herramientas como botones, agrupadas por familia", async () => {
    // Cuarenta y seis líneas de texto en un desplegable obligaban a leer una
    // lista para elegir. Ahora son botones con el dibujo de la herramienta, y
    // las familias se pliegan porque cuarenta y seis iconos a la vez tampoco
    // se leen. Cursor y medir se quedan aparte: son los que más se alternan.
    const user = userEvent.setup();
    renderChart();

    expect(screen.getByRole("button", { name: "Cursor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Medir movimiento" })).toBeTruthy();

    // La familia de líneas se abre de salida: es el 80% del uso.
    expect(screen.getByRole("button", { name: "Línea de tendencia" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rayo" })).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Fibonacci y Gann" }));
    expect(screen.getByRole("button", { name: "Retroceso de Fibonacci" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Horquilla de Andrews" })).toBeTruthy();
    // Y la familia anterior deja de ocupar sitio.
    expect(screen.queryByRole("button", { name: "Línea de tendencia" })).toBeNull();
  });

  it("no deja ninguna herramienta del catálogo sin botón", async () => {
    // Una herramienta que existe en el catálogo y no se puede elegir es código
    // muerto que nadie descubre.
    const user = userEvent.setup();
    renderChart();

    const familias = [...new Set(TOOLS.map((t) => t.group))];
    for (const familia of familias) {
      await user.click(screen.getByRole("tab", { name: GROUP_LABELS[familia] }));
      for (const tool of TOOLS.filter((t) => t.group === familia)) {
        expect(screen.getByRole("button", { name: tool.label }), tool.id).toBeTruthy();
      }
    }
  });

  it("marca en qué familia está la herramienta que tienes puesta", async () => {
    // Con la familia plegada, sin esto no hay forma de saber dónde está lo que
    // está activo -- y parece que no hay nada seleccionado.
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("tab", { name: "Patrones" }));
    await user.click(screen.getByRole("button", { name: "Onda de Elliott" }));
    expect(screen.getByRole("button", { name: "Onda de Elliott" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("tab", { name: "Líneas" }));
    // La herramienta sigue activa aunque su familia esté plegada.
    expect(screen.getByText(/onda de elliott/i)).toBeTruthy();
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

  it("dice cuántos clics faltan, no un texto fijo por herramienta", async () => {
    // Con herramientas de uno a cinco puntos, «haz clic dos veces» dejó de ser
    // cierto: el aviso cuenta los clics que quedan en cada momento.
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("button", { name: "Línea vertical" }));
    expect(screen.getByText(/Un clic más para completar línea vertical/)).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Patrones" }));
    await user.click(screen.getByRole("button", { name: "Patrón XABCD" }));
    expect(screen.getByText(/faltan 5 clics/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Medir movimiento" }));
    expect(screen.getByText(/inicio del movimiento que quieres medir/)).toBeTruthy();
  });
});

describe("TradeChart replay", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reveals only part of the trade and hides the outcome", async () => {
    const user = userEvent.setup();
    const { createSeriesMarkers } = await import("lightweight-charts");
    renderChart({ isOpen: false, exit: { time: CLOSED, price: 69000 } });

    // Before replay, the exit marker is there.
    const markersBefore = vi.mocked(createSeriesMarkers).mock.calls.at(-1)?.[1] ?? [];
    expect(markersBefore).toHaveLength(2);

    await user.click(screen.getByLabelText("Reproducir la operación vela a vela"));

    // The whole point: with the outcome on screen there is nothing to
    // practise, so the exit marker goes away while the replay runs.
    const markersDuring = vi.mocked(createSeriesMarkers).mock.calls.at(-1)?.[1] ?? [];
    expect(markersDuring).toHaveLength(1);

    // And only a prefix of the candles is fed to the series.
    const lastData = series.setData.mock.calls.at(-1)?.[0] ?? [];
    expect(lastData.length).toBeLessThan(3);
    expect(screen.getByText("Salir de la reproducción")).toBeInTheDocument();
  });

  it("steps forward one candle at a time", async () => {
    const user = userEvent.setup();
    renderChart({ isOpen: false, exit: { time: CLOSED, price: 69000 } });

    await user.click(screen.getByLabelText("Reproducir la operación vela a vela"));
    const before = series.setData.mock.calls.at(-1)?.[0]?.length ?? 0;

    await user.click(screen.getByText("Vela siguiente"));
    const after = series.setData.mock.calls.at(-1)?.[0]?.length ?? 0;

    expect(after).toBe(before + 1);
  });
});
