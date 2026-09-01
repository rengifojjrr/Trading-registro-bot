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

function nuevaSerie() {
  return {
    setData: vi.fn(),
    createPriceLine: vi.fn(() => ({})),
    removePriceLine: vi.fn(),
    priceToCoordinate: vi.fn(() => 0),
    coordinateToPrice: vi.fn(() => 0),
  };
}

/** La última serie de velas creada, que es la que miran varias pruebas. */
let series = nuevaSerie();

/** Cuántos gráficos se han creado: reconstruirlo tira el zoom del usuario. */
let graficosCreados = 0;

/**
 * Un gráfico con su propio registro de series, como el de verdad.
 *
 * `removeSeries` de la librería empieza por buscar la serie en el mapa de
 * *ese* gráfico y revienta si no está («Value is undefined»). Un doble que
 * acepta cualquier cosa esconde justo el fallo que trae aquí: quitar de un
 * gráfico nuevo una serie que pertenecía a uno ya destruido.
 */
function crearGrafico() {
  const propias = new Set<object>();
  let viva = true;
  graficosCreados += 1;

  return {
    addSeries: (definicion: unknown) => {
      const nueva = nuevaSerie();
      // La de velas es la primera y la que se guarda para las aserciones.
      if (propias.size === 0) series = nueva;
      propias.add(nueva);
      void definicion;
      return nueva;
    },
    removeSeries: (serie: object) => {
      if (!viva) throw new Error("Chart is disposed");
      if (!propias.has(serie)) throw new Error("Value is undefined");
      propias.delete(serie);
    },
    priceScale: () => priceScale,
    timeScale: () => timeScale,
    subscribeClick: vi.fn(),
    unsubscribeClick: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    resize: vi.fn(),
    remove: () => {
      viva = false;
      propias.clear();
    },
  };
}

vi.mock("lightweight-charts", () => ({
  createChart: () => crearGrafico(),
  createSeriesMarkers: vi.fn(),
  CandlestickSeries: {},
  HistogramSeries: {},
  LineSeries: {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  PriceScaleMode: { Normal: 0, Logarithmic: 1, Percentage: 2 },
}));

vi.mock("@/lib/hooks/use-current-price", () => ({
  useCurrentPrice: () => ({ price: null }),
}));

// El gráfico recarga la ruta tras copiarse los dibujos de otra operación, y
// fuera de Next no hay router que montar.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

/**
 * El gráfico recuerda su vista por operación, en `localStorage`.
 *
 * Sin vaciarla entre pruebas, la que enciende dos indicadores se los deja
 * puestos a la siguiente -- y como todas usan el mismo identificador de
 * operación, la siguiente hereda una configuración que nunca pidió. Lo cazó
 * la prueba de la reproducción, que de pronto medía la serie del indicador
 * en vez de la de las velas.
 */
beforeEach(() => {
  window.localStorage.clear();
  graficosCreados = 0;
});

import { SCALE_LABELS, SCALE_MODES } from "@/lib/charts/scale";
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

  it("pone las herramientas en un carril, con el cursor y la regla dentro", async () => {
    // Como en TradingView: una columna al lado de las velas, no dos filas
    // encima. El cursor y la regla viven ahí también -- son de dibujar, y
    // estaban arriba sólo porque la paleta no tenía dónde.
    const user = userEvent.setup();
    renderChart();

    expect(screen.getByRole("button", { name: "Cursor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Medir movimiento" })).toBeTruthy();

    // Un botón por familia, que enseña qué herramienta pondría.
    expect(screen.getByRole("button", { name: "Líneas: Línea de tendencia" })).toBeTruthy();

    // Y la lista con los nombres, que es donde se cambia de herramienta.
    await user.click(
      screen.getByRole("button", { name: "Ver las herramientas de fibonacci y gann" }),
    );
    const menu = screen.getByRole("menu", { name: "Fibonacci y Gann" });
    expect(within(menu).getByText("Retroceso de Fibonacci")).toBeTruthy();
    expect(within(menu).getByText("Horquilla de Andrews")).toBeTruthy();
  });

  it("no deja ninguna herramienta del catálogo sin forma de elegirla", async () => {
    // Una herramienta que existe en el catálogo y no se puede elegir es código
    // muerto que nadie descubre.
    const user = userEvent.setup();
    renderChart();

    const familias = [...new Set(TOOLS.map((t) => t.group))];
    for (const familia of familias) {
      await user.click(
        screen.getByRole("button", {
          name: `Ver las herramientas de ${GROUP_LABELS[familia].toLowerCase()}`,
        }),
      );
      const menu = screen.getByRole("menu", { name: GROUP_LABELS[familia] });
      for (const tool of TOOLS.filter((t) => t.group === familia)) {
        expect(within(menu).getByText(tool.label), tool.id).toBeTruthy();
      }
    }
  });

  it("marca en qué familia está la herramienta que tienes puesta", async () => {
    // El carril enseña siete botones y sólo uno puede estar pulsado: sin eso
    // no hay forma de saber qué hay puesto sin abrir las siete listas.
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("button", { name: "Ver las herramientas de patrones" }));
    await user.click(screen.getByText("Onda de Elliott"));

    expect(screen.getByRole("button", { name: "Patrones: Onda de Elliott" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Y el botón de su familia se queda enseñándola, con la lista ya cerrada.
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText(/onda de elliott/i)).toBeTruthy();
  });

  it("exposes the view toggles", () => {
    renderChart();

    for (const label of ["Volumen", "Fijar la escala", "Restablecer vista"]) {
      expect(screen.getByRole("button", { name: label }), label).toBeTruthy();
    }
  });

  it("ofrece los tres modos de escala, no un interruptor de logarítmica", async () => {
    // Lineal, logarítmica y porcentaje son excluyentes: con interruptores
    // independientes existiría «logarítmica y porcentaje a la vez», que no
    // significa nada y habría que prohibir a mano en cada sitio.
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("combobox", { name: "Escala de precios" }));
    const listbox = await screen.findByRole("listbox");

    for (const modo of SCALE_MODES) {
      expect(
        within(listbox).getByRole("option", { name: new RegExp(SCALE_LABELS[modo]) }),
        modo,
      ).toBeTruthy();
    }
  });

  it("ofrece los indicadores, y se pueden marcar varios", async () => {
    // La mitad de las veces se quiere EMA 9 *y* EMA 21 -- es el cruce que se
    // mira -- así que marcar uno no puede desmarcar el anterior.
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("button", { name: "Indicadores" }));
    await user.click(await screen.findByRole("checkbox", { name: /EMA 9/ }));
    await user.click(screen.getByRole("checkbox", { name: /EMA 21/ }));

    expect(screen.getByRole("checkbox", { name: /EMA 9/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: /EMA 21/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("encender varios indicadores seguidos no tumba el gráfico", async () => {
    // El fallo: al encender el segundo, el gráfico se quedaba en «No se pudo
    // cargar esta sección». Encender uno reconstruía el gráfico entero, pero
    // las series del anterior sobrevivían al que las tenía, y el efecto de los
    // datos las intentaba quitar del gráfico nuevo -- donde no estaban.
    // `removeSeries` de la librería revienta con «Value is undefined».
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("button", { name: "Indicadores" }));
    for (const nombre of [/EMA 9/, /EMA 21/, /EMA 50/, /SMA 200/, /VWAP/, /RSI 14/, /ATR 14/]) {
      await user.click(await screen.findByRole("checkbox", { name: nombre }));
    }

    // Y apagarlos otra vez, que es el mismo camino al revés.
    for (const nombre of [/EMA 9/, /EMA 50/]) {
      await user.click(screen.getByRole("checkbox", { name: nombre }));
    }

    expect(screen.getByRole("checkbox", { name: /EMA 21/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: /EMA 9/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("poner un indicador no reconstruye el gráfico", async () => {
    // Reconstruirlo tira el zoom y el desplazamiento: acercarse a una zona y
    // encender una media para mirarla de cerca devolvía la vista al principio,
    // que es justo lo contrario de lo que se pedía.
    const user = userEvent.setup();
    renderChart();

    const alPrincipio = graficosCreados;

    await user.click(screen.getByRole("button", { name: "Indicadores" }));
    await user.click(await screen.findByRole("checkbox", { name: /EMA 9/ }));
    await user.click(screen.getByRole("checkbox", { name: /EMA 21/ }));

    expect(graficosCreados).toBe(alPrincipio);
  });

  it("con indicadores puestos, cambiar la escala tampoco lo tumba", async () => {
    // La escala sí reconstruye el gráfico, y ahí es donde las series viejas
    // tenían que quedarse atrás: es el mismo fallo por otra puerta.
    const user = userEvent.setup();
    renderChart();

    await user.click(screen.getByRole("button", { name: "Indicadores" }));
    await user.click(await screen.findByRole("checkbox", { name: /EMA 9/ }));
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("combobox", { name: "Escala de precios" }));
    await user.click(await screen.findByRole("option", { name: /Logarítmica/ }));

    expect(graficosCreados).toBeGreaterThan(1);
    expect(screen.getByRole("combobox", { name: "Escala de precios" })).toBeTruthy();
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

    await user.click(screen.getByRole("button", { name: "Ver las herramientas de líneas" }));
    await user.click(screen.getByText("Línea vertical"));
    expect(screen.getByText(/Un clic más para completar línea vertical/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Ver las herramientas de patrones" }));
    await user.click(screen.getByText("Patrón XABCD"));
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
