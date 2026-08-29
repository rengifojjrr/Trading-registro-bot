import { describe, expect, it } from "vitest";

import type { Vela } from "@/lib/charts/indicators";

import { runBacktest } from "./engine";
import { computeMetrics, maxDrawdown } from "./metrics";
import { Decimal } from "decimal.js";
import { EMPTY_STRATEGY, type Strategy } from "./types";

/** Velas con los cuatro precios donde se le digan, para poder forzar casos. */
function vela(
  i: number,
  over: Partial<Omit<Vela, "time">> = {},
): Vela {
  const base = 100;
  return {
    time: 1_700_000_000 + i * 3600,
    open: base,
    high: base + 1,
    low: base - 1,
    close: base,
    volume: 10,
    ...over,
  };
}

/** Una serie plana con un tramo que sube, para que un cruce ocurra una vez. */
function serieConSubida(largo = 60): Vela[] {
  return Array.from({ length: largo }, (_, i) => {
    const precio = i < 30 ? 100 : 100 + (i - 30) * 2;
    return vela(i, {
      open: precio,
      high: precio + 1,
      low: precio - 1,
      close: precio,
    });
  });
}

const SIN_COSTES = { feePerContract: 0, slippageTicks: 0, tickSize: 1 };

const cruceDeMedias: Strategy = {
  ...EMPTY_STRATEGY,
  name: "Cruce",
  entry: [
    {
      left: { kind: "INDICADOR", indicator: "EMA9" },
      comparator: "CRUZA_ARRIBA",
      right: { kind: "INDICADOR", indicator: "EMA21" },
    },
  ],
  exit: { stopAtr: null, targetAtr: null, maxBars: 5, conditions: [] },
};

describe("no mirar el futuro", () => {
  it("entra a la apertura de la vela siguiente, no al cierre de la de la señal", () => {
    // Es *el* error que hace que un backtest salga espectacular y la
    // estrategia pierda dinero: ese cierre no se conoce hasta que la vela
    // termina, y para entonces ya no se puede comprar a ese precio.
    const velas = serieConSubida();
    const r = runBacktest({
      strategy: cruceDeMedias,
      velas,
      productId: "TEST",
      costs: SIN_COSTES,
    });

    expect(r.fills.length).toBeGreaterThan(0);
    const entrada = r.fills[0];
    const indice = velas.findIndex((v) => v.time === entrada.time);
    expect(indice).toBeGreaterThan(0);
    // El precio de entrada es la apertura de esa vela, no el cierre de la
    // anterior ni el cierre de esa.
    expect(entrada.price).toBe(velas[indice].open);
  });

  it("una señal en la última vela no puede ejecutarse", () => {
    // No hay vela siguiente en la que comprar.
    const velas = serieConSubida(40);
    const r = runBacktest({ strategy: cruceDeMedias, velas, productId: "TEST", costs: SIN_COSTES });
    const ultima = velas[velas.length - 1].time;
    expect(r.fills.some((f) => f.time === ultima && f.reason === "ENTRADA")).toBe(false);
  });
});

describe("el stop y el objetivo", () => {
  /** Sube tranquila y luego se desploma, para que el stop salte. */
  const conDesplome: Vela[] = [
    ...Array.from({ length: 30 }, (_, i) => vela(i, { open: 100, high: 101, low: 99, close: 100 })),
    ...Array.from({ length: 10 }, (_, i) =>
      vela(30 + i, { open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i }),
    ),
    vela(40, { open: 110, high: 110, low: 80, close: 82 }),
    vela(41, { open: 82, high: 83, low: 81, close: 82 }),
    vela(42, { open: 82, high: 83, low: 81, close: 82 }),
  ];

  const conStop: Strategy = {
    ...cruceDeMedias,
    exit: { stopAtr: 1, targetAtr: 8, maxBars: null, conditions: [] },
  };

  it("el stop cierra la operación", () => {
    const r = runBacktest({
      strategy: conStop,
      velas: conDesplome,
      productId: "TEST",
      costs: SIN_COSTES,
    });
    expect(r.trades.some((t) => t.exitReason === "STOP")).toBe(true);
  });

  it("si en la misma vela se tocan los dos, gana el stop", () => {
    // Con velas no se puede saber cuál se tocó antes, y suponer que fue el
    // objetivo es la suposición que hace que un backtest salga mejor de lo
    // que la estrategia es.
    //
    // La entrada se dispara con un umbral de precio y no con un cruce de
    // medias, para que caiga en una vela conocida: con el cruce, el objetivo
    // saltaba en una vela intermedia y la grande ni se llegaba a mirar.
    const porUmbral: Strategy = {
      ...EMPTY_STRATEGY,
      entry: [
        {
          left: { kind: "PRECIO", field: "CLOSE" },
          comparator: "MAYOR",
          right: { kind: "NUMERO", value: 100.5 },
        },
      ],
      exit: { stopAtr: 1, targetAtr: 1, maxBars: null, conditions: [] },
    };

    const ambos: Vela[] = [
      // Treinta planas para que el ATR exista y valga 2.
      ...Array.from({ length: 30 }, (_, i) => vela(i, { open: 100, high: 101, low: 99, close: 100 })),
      // Ésta dispara la señal (cierra en 101 > 100,5).
      vela(30, { open: 100, high: 101, low: 99, close: 101 }),
      // Se entra aquí, a la apertura.
      vela(31, { open: 101, high: 101.2, low: 100.8, close: 101 }),
      // Y ésta toca los dos lados de golpe: stop en 99 y objetivo en 103.
      vela(32, { open: 101, high: 300, low: 1, close: 101 }),
      vela(33, { open: 101, high: 102, low: 100, close: 101 }),
    ];

    const r = runBacktest({
      strategy: porUmbral,
      velas: ambos,
      productId: "TEST",
      costs: SIN_COSTES,
    });

    const cerradas = r.trades.filter((t) => t.exitReason !== "FIN_DE_DATOS");
    expect(cerradas.length).toBeGreaterThan(0);
    expect(cerradas[0].exitReason).toBe("STOP");
  });

  it("si la vela abre pasada del stop, se sale a la apertura y no al nivel", () => {
    // La orden se habría ejecutado ahí, peor. Suponer el nivel sería regalarle
    // a la estrategia un precio que no existió.
    const conHueco: Vela[] = [
      ...Array.from({ length: 30 }, (_, i) => vela(i, { open: 100, high: 101, low: 99, close: 100 })),
      ...Array.from({ length: 6 }, (_, i) =>
        vela(30 + i, { open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i }),
      ),
      // Hueco brutal a la baja: abre muy por debajo de cualquier stop.
      vela(36, { open: 50, high: 51, low: 49, close: 50 }),
      vela(37, { open: 50, high: 51, low: 49, close: 50 }),
    ];

    const r = runBacktest({
      strategy: conStop,
      velas: conHueco,
      productId: "TEST",
      costs: SIN_COSTES,
    });

    const salida = r.fills.find((f) => f.reason === "STOP");
    expect(salida).toBeDefined();
    expect(salida!.price).toBe(50);
  });

  it("sin ATR no se pone stop en vez de ponerlo en un sitio inventado", () => {
    // Con menos de quince velas el ATR no existe todavía.
    const pocas = Array.from({ length: 10 }, (_, i) => vela(i));
    const r = runBacktest({ strategy: conStop, velas: pocas, productId: "TEST", costs: SIN_COSTES });
    expect(r.trades.every((t) => t.exitReason !== "STOP")).toBe(true);
  });
});

describe("la salida por tiempo", () => {
  it("cierra a las velas que se le digan", () => {
    const r = runBacktest({
      strategy: cruceDeMedias,
      velas: serieConSubida(),
      productId: "TEST",
      costs: SIN_COSTES,
    });
    const porTiempo = r.trades.filter((t) => t.exitReason === "TIEMPO");
    expect(porTiempo.length).toBeGreaterThan(0);
    for (const t of porTiempo) expect(t.barsHeld).toBeGreaterThanOrEqual(5);
  });
});

describe("los costes", () => {
  it("el deslizamiento va siempre en contra", () => {
    // Comprar sale más caro y vender más barato. Sin esto, un backtest de
    // estrategias rápidas sale siempre ganando.
    const velas = serieConSubida();
    const conCoste = runBacktest({
      strategy: cruceDeMedias,
      velas,
      productId: "TEST",
      costs: { feePerContract: 0, slippageTicks: 2, tickSize: 1 },
    });
    const sinCoste = runBacktest({
      strategy: cruceDeMedias,
      velas,
      productId: "TEST",
      costs: SIN_COSTES,
    });

    const compra = conCoste.fills.find((f) => f.side === "BUY")!;
    const compraLimpia = sinCoste.fills.find((f) => f.side === "BUY")!;
    expect(compra.price).toBe(compraLimpia.price + 2);

    const venta = conCoste.fills.find((f) => f.side === "SELL")!;
    const ventaLimpia = sinCoste.fills.find((f) => f.side === "SELL")!;
    expect(venta.price).toBe(ventaLimpia.price - 2);
  });

  it("la comisión se cobra por contrato y por lado", () => {
    const r = runBacktest({
      strategy: { ...cruceDeMedias, size: 3 },
      velas: serieConSubida(),
      productId: "TEST",
      costs: { feePerContract: 0.5, slippageTicks: 0, tickSize: 1 },
    });
    for (const f of r.fills) expect(f.commission).toBe(1.5);
  });

  it("con costes se gana menos que sin ellos", () => {
    const velas = serieConSubida();
    const caro = computeMetrics(
      runBacktest({
        strategy: cruceDeMedias,
        velas,
        productId: "TEST",
        costs: { feePerContract: 5, slippageTicks: 3, tickSize: 1 },
      }).trades,
      1,
    );
    const barato = computeMetrics(
      runBacktest({ strategy: cruceDeMedias, velas, productId: "TEST", costs: SIN_COSTES }).trades,
      1,
    );
    expect(Number(caro.neto)).toBeLessThan(Number(barato.neto));
  });
});

describe("las operaciones las arma el motor de verdad", () => {
  it("salen con la forma de una operación reconstruida", () => {
    // Es lo que permite comparar un backtest con la realidad: dos motores
    // distintos acaban discrepando en cómo se pondera un precio medio o cómo
    // se reparte una comisión, y entonces las dos cifras ya no se pueden
    // restar.
    const r = runBacktest({
      strategy: cruceDeMedias,
      velas: serieConSubida(),
      productId: "BIP-TEST",
      costs: SIN_COSTES,
    });

    expect(r.trades.length).toBeGreaterThan(0);
    const t = r.trades[0].trade;
    expect(t.productId).toBe("BIP-TEST");
    expect(t.direction).toBe("LONG");
    expect(t.status).toBe("CLOSED");
    // Los importes son cadenas decimales, como los del motor real.
    expect(typeof t.entryWap).toBe("string");
    expect(Number(t.totalEntryQty)).toBe(Number(t.totalExitQty));
  });

  it("una posición abierta al acabar los datos se cierra igualmente", () => {
    // Dejarla abierta la excluiría de las estadísticas, y una estrategia que
    // aguanta sus perdedoras saldría mejor de lo que es.
    const velas = serieConSubida(45);
    const r = runBacktest({
      strategy: { ...cruceDeMedias, exit: { stopAtr: null, targetAtr: null, maxBars: 500, conditions: [] } },
      velas,
      productId: "TEST",
      costs: SIN_COSTES,
    });
    expect(r.trades.every((t) => t.trade.status === "CLOSED")).toBe(true);
  });
});

describe("cuando no hay nada que probar", () => {
  it("sin señales lo dice en vez de devolver cero operaciones a secas", () => {
    // «Cero operaciones» hace pensar que la idea no funciona, cuando lo que
    // pasa es que la condición no se cumplió nunca.
    const plana = Array.from({ length: 60 }, (_, i) => vela(i));
    const r = runBacktest({ strategy: cruceDeMedias, velas: plana, productId: "TEST" });
    expect(r.trades).toHaveLength(0);
    expect(r.note).toMatch(/no se cumplieron/);
  });

  it("con muy pocas velas lo dice", () => {
    const r = runBacktest({ strategy: cruceDeMedias, velas: [vela(0)], productId: "TEST" });
    expect(r.note).toMatch(/más velas/);
  });
});

describe("el horario", () => {
  it("fuera de las horas elegidas no se entra", () => {
    const velas = serieConSubida();
    const conEntradas = runBacktest({
      strategy: cruceDeMedias,
      velas,
      productId: "TEST",
      costs: SIN_COSTES,
    });
    expect(conEntradas.fills.length).toBeGreaterThan(0);

    // Una hora en la que no cae ninguna de estas velas.
    const horasDeLasVelas = new Set(velas.map((v) => new Date(v.time * 1000).getUTCHours()));
    const horaImposible = [...Array(24).keys()].find((h) => !horasDeLasVelas.has(h))!;

    const sinEntradas = runBacktest({
      strategy: { ...cruceDeMedias, hours: [horaImposible] },
      velas,
      productId: "TEST",
      costs: SIN_COSTES,
    });
    expect(sinEntradas.fills).toHaveLength(0);
  });
});

describe("el drawdown", () => {
  it("mide la caída desde el máximo, no la peor operación", () => {
    // Lo que duele no es una operación mala, son seis seguidas.
    const netos = [100, -30, -30, -30, 200].map((n) => new Decimal(n));
    expect(maxDrawdown(netos).toNumber()).toBe(90);
  });

  it("una curva que sólo sube no tiene caída", () => {
    expect(maxDrawdown([10, 20, 30].map((n) => new Decimal(n))).toNumber()).toBe(0);
  });

  it("es positivo, no negativo", () => {
    // «Un drawdown de -300» se lee mal.
    expect(maxDrawdown([-50].map((n) => new Decimal(n))).toNumber()).toBe(50);
  });
});
