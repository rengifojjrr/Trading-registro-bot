// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El gráfico de una publicación es **el mismo** que el de una operación.
 *
 * Eso es lo que se prueba aquí: que las herramientas están, que los dibujos van
 * contra la publicación y no contra ninguna operación, y que lo que sólo tiene
 * una operación --las capturas, copiar los dibujos de la anterior-- no sale.
 *
 * lightweight-charts pinta en un <canvas>, que jsdom no sabe abrir, así que la
 * librería se sustituye: lo que se comprueba son los controles de alrededor.
 */
const priceScale = { applyOptions: vi.fn() };
const timeScale = {
  fitContent: vi.fn(),
  setVisibleRange: vi.fn(),
  getVisibleRange: vi.fn(() => null),
  getVisibleLogicalRange: vi.fn(() => null),
  timeToCoordinate: vi.fn(() => 0),
  coordinateToTime: vi.fn(() => 0),
  subscribeVisibleTimeRangeChange: vi.fn(),
  unsubscribeVisibleTimeRangeChange: vi.fn(),
  subscribeVisibleLogicalRangeChange: vi.fn(),
  unsubscribeVisibleLogicalRangeChange: vi.fn(),
};

/** Los títulos de las líneas de precio creadas: «previo», «Entrada»… */
let lineas: string[] = [];

function nuevaSerie() {
  return {
    setData: vi.fn(),
    createPriceLine: vi.fn((opciones: { title?: string }) => {
      lineas.push(opciones.title ?? "");
      return {};
    }),
    removePriceLine: vi.fn(),
    priceToCoordinate: vi.fn(() => 0),
    coordinateToPrice: vi.fn(() => 0),
  };
}

function crearGrafico() {
  const propias = new Set<object>();
  return {
    addSeries: () => {
      const nueva = nuevaSerie();
      propias.add(nueva);
      return nueva;
    },
    removeSeries: (serie: object) => propias.delete(serie),
    priceScale: () => priceScale,
    timeScale: () => timeScale,
    subscribeClick: vi.fn(),
    unsubscribeClick: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
    resize: vi.fn(),
    remove: () => propias.clear(),
  };
}

/** Las marcas puestas en la última llamada, para leer qué señala el gráfico. */
let marcas: { text?: string }[] = [];

vi.mock("lightweight-charts", () => ({
  createChart: () => crearGrafico(),
  createSeriesMarkers: (_serie: unknown, m: { text?: string }[]) => {
    marcas = m;
    return { setMarkers: (siguientes: { text?: string }[]) => (marcas = siguientes) };
  },
  CandlestickSeries: {},
  HistogramSeries: {},
  LineSeries: {},
  ColorType: { Solid: "solid" },
  CrosshairMode: { Normal: 0 },
  LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  PriceScaleMode: { Normal: 0, Logarithmic: 1, Percentage: 2 },
}));

vi.mock("@/lib/hooks/use-current-price", () => ({ useCurrentPrice: () => ({ price: null }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { ReactionChart } from "./reaction-chart";

const EVENT_ID = "33333333-3333-4333-8333-333333333333";
const T0 = Math.floor(new Date("2026-08-12T12:30:00Z").getTime() / 1000);

/** Pedidas al gráfico: para comprobar contra quién van los dibujos. */
const pedidas: string[] = [];

function velas() {
  // Una hora antes del dato y tres después, en velas de un minuto: el
  // componente las junta a cinco, que es como abre. Tiene que llegar más allá
  // del plazo que se mide, o la flecha del final no tendría vela donde caer.
  return Array.from({ length: 240 }, (_, i) => ({
    time: T0 - 60 * 60 + i * 60,
    open: 68000,
    high: 68100,
    low: 67900,
    close: 68050,
    volume: 3,
  }));
}

function pintar(horizonMinutes = 60) {
  return render(
    <ReactionChart
      eventId={EVENT_ID}
      eventAt={new Date(T0 * 1000).toISOString()}
      productId="BTC-USD"
      timezone="Europe/Madrid"
      initialCandles={velas()}
      horizonMinutes={horizonMinutes}
    />,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  pedidas.length = 0;
  lineas = [];
  marcas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      pedidas.push(url);
      return new Response(JSON.stringify({ error: null, drawings: [] }), { status: 200 });
    }),
  );
});

describe("los dibujos son de la publicación", () => {
  it("se piden a su ruta, no a la de ninguna operación", async () => {
    pintar();
    await waitFor(() => expect(pedidas.length).toBeGreaterThan(0));
    expect(pedidas[0]).toBe(`/api/noticias/${EVENT_ID}/drawings`);
  });
});

describe("tiene las mismas herramientas que el de una operación", () => {
  it("la paleta de dibujo, la regla y el imán", async () => {
    pintar();
    await waitFor(() => expect(screen.getByLabelText("Cursor")).toBeTruthy());

    expect(screen.getByLabelText("Medir movimiento")).toBeTruthy();
    expect(screen.getByLabelText("Imán: pegar a máximos y mínimos")).toBeTruthy();
    expect(screen.getByLabelText("Seguir dibujando con la misma herramienta")).toBeTruthy();
  });

  it("los indicadores y los tres modos de escala", async () => {
    pintar();
    await waitFor(() => expect(screen.getByLabelText("Escala de precios")).toBeTruthy());
    expect(screen.getByLabelText("Temporalidad")).toBeTruthy();
    expect(screen.getByLabelText("Volumen")).toBeTruthy();
  });

  it("y la reproducción vela a vela", async () => {
    pintar();
    await waitFor(() =>
      expect(screen.getByLabelText("Reproducir la reacción vela a vela")).toBeTruthy(),
    );
  });
});

describe("y no tiene lo que sólo tiene una operación", () => {
  it("nada de capturas: se guardarían en las capturas de una operación que no existe", async () => {
    pintar();
    await waitFor(() => expect(screen.getByLabelText("Cursor")).toBeTruthy());
    expect(screen.queryByLabelText("Guardar imagen del gráfico")).toBeNull();
  });

  it("ni copiar los dibujos de «la anterior», que aquí no significa nada", async () => {
    pintar();
    await waitFor(() => expect(screen.getByLabelText("Cursor")).toBeTruthy());
    expect(screen.queryByLabelText("Traer los dibujos de la operación anterior")).toBeNull();
  });

  it("y «restablecer vista» es volver al momento, no encajarlo todo", async () => {
    pintar();
    await waitFor(() =>
      expect(screen.getByLabelText("Volver a centrar en la publicación")).toBeTruthy(),
    );
  });
});

describe("lo que marca", () => {
  it("la publicación y el final del plazo que se mide", async () => {
    pintar(60);
    await waitFor(() => expect(marcas.length).toBe(2));
    expect(marcas.map((m) => m.text)).toEqual(["dato", "1 h"]);
  });

  it("y el precio de justo antes, que es contra lo que se lee todo", async () => {
    pintar();
    await waitFor(() => expect(lineas).toContain("previo"));
    // Nada de entrada ni salida: no hay operación de la que hablar.
    expect(lineas).not.toContain("Entrada");
    expect(lineas).not.toContain("Salida");
  });
});
